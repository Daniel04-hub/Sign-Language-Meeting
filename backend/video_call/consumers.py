"""
video_call/consumers.py

SignMeet WebSocket consumer — handles all real-time signaling and AI broadcasts.

Message routing:
    Client → Server:
        join            → handle_join()
        webrtc-offer    → handle_webrtc_offer()
        webrtc-answer   → handle_webrtc_answer()
        ice-candidate   → handle_ice_candidate()
        sign-detected   → handle_sign_detected()
        speech-text     → handle_speech_text()

    Server → Client:
        connected       → sent on WebSocket accept
        user-joined     → sent only to joining user (contains existing_users list)
        new-user        → broadcast to room EXCLUDING joining user
        user-left       → broadcast to room when anyone disconnects
        webrtc-offer    → sent directly to target user only
        webrtc-answer   → sent directly to target user only
        ice-candidate   → sent directly to target user only
        sign-detected   → broadcast to entire room (including sender)
        speech-text     → broadcast to entire room (excluding sender)
        error           → sent to the connection that triggered the error

In-memory room registry (class-level dict):
    rooms = {
        "<room_code>": {
            "<user_id>": {
                "name": "<display_name>",
                "channel_name": "<channels_channel_name>"
            }
        }
    }

NOTE: This in-memory dict only works correctly with InMemoryChannelLayer (single
      process). With Redis Channel Layer in production the room registry must be
      moved to Redis or the database. The DB participant count is always correct
      because it is updated via save() on connect/disconnect.
"""

import json
import logging
import time
import asyncio

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.db import DatabaseError

logger = logging.getLogger(__name__)


class SignMeetConsumer(AsyncWebsocketConsumer):
    """
    Async WebSocket consumer for SignMeet video call rooms.

    One instance is created per WebSocket connection. Class-level `rooms`
    dict is shared across all instances in the same process.
    """

    # ── Class-level in-process room registry ─────────────────────────────────
    # { room_code: { user_id: { "name": str, "channel_name": str } } }
    rooms: dict = {}
    VALID_SIGNS = {'HELLO', 'THANKS', 'BYE', 'YES', 'NO'}

    # ─────────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """
        Handle new WebSocket connection.

        Steps:
            1. Extract room_code from URL route kwargs.
            2. Look up Room in DB — close 4404 if not found.
            3. Reject if room is full — close 4403.
            4. Join the Channels group for this room.
            5. Accept the WebSocket.
            6. Send {"type": "connected"} confirmation.

        Close codes:
            4404 — Room not found.
            4403 — Room is full.
        """
        self.room_code: str = self.scope["url_route"]["kwargs"]["room_code"].upper()
        self.group_name: str = f"room_{self.room_code}"
        self.user_id: str = ""
        self.user_name: str = ""
        self.last_speech_time: float = 0.0
        self.sign_count: int = 0
        self.join_timeout_task = None

        # Fetch room from DB
        try:
            room = await self._get_room(self.room_code)
        except DatabaseError as exc:
            logger.error("Database error during connect for room %s: %s", self.room_code, exc)
            await self.send_error("Database error occurred")
            await self.close(code=4500)
            return

        if room is None:
            logger.warning("WebSocket connect rejected: room %s not found.", self.room_code)
            await self.send_error("Room not found")
            await self.close(code=4404)
            return

        # Enforce capacity limit
        if room.current_participants >= room.max_participants:
            logger.warning(
                "WebSocket connect rejected: room %s is full (%d/%d).",
                self.room_code,
                room.current_participants,
                room.max_participants,
            )
            await self.close(code=4403)
            return

        # Initialise room registry entry if first user
        if self.room_code not in SignMeetConsumer.rooms:
            SignMeetConsumer.rooms[self.room_code] = {}

        # Join Channels group
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Accept the WebSocket connection
        await self.accept()

        # Acknowledge connection
        await self.send(text_data=json.dumps({
            "type": "connected",
            "message": "Connected to room",
            "room_code": self.room_code,
        }))

        self.join_timeout_task = asyncio.create_task(self._enforce_join_timeout())

        logger.info("WebSocket connected: channel %s → room %s", self.channel_name, self.room_code)

    async def disconnect(self, close_code: int) -> None:
        """
        Handle WebSocket disconnection.

        Steps:
            1. Remove user from in-memory registry.
            2. Decrement current_participants in DB.
            3. Broadcast user-left to remaining room members.
            4. Leave the Channels group.

        Args:
            close_code: WebSocket close code (1000 = normal, 4xxx = custom).
        """
        logger.info(
            "WebSocket disconnected: user %s from room %s (code=%s)",
            self.user_id,
            self.room_code,
            close_code,
        )

        if self.join_timeout_task is not None:
            self.join_timeout_task.cancel()
            self.join_timeout_task = None

        # Remove from in-memory registry
        if (
            self.room_code in SignMeetConsumer.rooms
            and self.user_id in SignMeetConsumer.rooms[self.room_code]
        ):
            del SignMeetConsumer.rooms[self.room_code][self.user_id]
            # Clean up empty room entry
            if not SignMeetConsumer.rooms[self.room_code]:
                del SignMeetConsumer.rooms[self.room_code]

        # Decrement DB participant count (only if user had joined properly)
        if self.user_id:
            try:
                await self._decrement_participants(self.room_code)
            except DatabaseError as exc:
                logger.error("Failed to decrement participants for room %s: %s", self.room_code, exc)

        # Notify remaining users
        if self.user_id:
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast.message",
                    "data": {
                        "type": "user-left",
                        "user_id": self.user_id,
                    },
                    "exclude_id": None,  # everyone including late receivers
                },
            )

        # Leave the group
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data: str) -> None:
        """
        Route incoming WebSocket messages to the correct handler.

        Args:
            text_data: Raw JSON string from the client.
        """
        try:
            data = json.loads(text_data)

            message_type = data.get("type", "")

            handlers = {
                "join": self.handle_join,
                "webrtc-offer": self.handle_webrtc_offer,
                "webrtc-answer": self.handle_webrtc_answer,
                "ice-candidate": self.handle_ice_candidate,
                "sign-detected": self.handle_sign_detected,
                "speech-text": self.handle_speech_text,
            }

            handler = handlers.get(message_type)
            if handler is None:
                await self.send_error(f"Unknown message type: '{message_type}'.")
                return

            await handler(data)
        except json.JSONDecodeError:
            await self.send_error("Invalid message format")
        except Exception as exc:
            logger.error(f"Consumer error: {exc}")
            await self.send_error("Server error occurred")

    # ─────────────────────────────────────────────────────────────────────────
    # Message handlers
    # ─────────────────────────────────────────────────────────────────────────

    async def handle_join(self, data: dict) -> None:
        """
        Handle "join" message — register user in the room.

        Sends "user-joined" back to this user with the list of already-present
        users, then broadcasts "new-user" to everyone else in the room.

        Args:
            data: {
                type:      "join",
                user_id:   str  — unique ID generated by the React client,
                user_name: str  — display name chosen on the home page.
            }
        """
        user_id = data.get("user_id", "").strip()
        user_name = data.get("user_name", "Anonymous").strip()

        if not user_id:
            await self.send_error("join message missing required field: user_id.")
            return

        self.user_id = user_id
        self.user_name = user_name

        if self.join_timeout_task is not None:
            self.join_timeout_task.cancel()
            self.join_timeout_task = None

        # Capture existing users BEFORE adding self
        existing_users = [
            {"user_id": uid, "user_name": info["name"]}
            for uid, info in SignMeetConsumer.rooms.get(self.room_code, {}).items()
        ]

        # Register this user in the room registry
        if self.room_code not in SignMeetConsumer.rooms:
            SignMeetConsumer.rooms[self.room_code] = {}

        SignMeetConsumer.rooms[self.room_code][user_id] = {
            "name": user_name,
            "channel_name": self.channel_name,
        }

        # Persist participant count to DB
        try:
            await self._increment_participants(self.room_code)
        except DatabaseError as exc:
            logger.error("Failed to increment participants for room %s: %s", self.room_code, exc)
            await self.send_error("Database error occurred")
            return

        # Tell joining user who's already here
        await self.send(text_data=json.dumps({
            "type": "user-joined",
            "user_id": user_id,
            "user_name": user_name,
            "existing_users": existing_users,
        }))

        # Tell everyone else that a new user arrived
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "broadcast.message",
                "data": {
                    "type": "new-user",
                    "user_id": user_id,
                    "user_name": user_name,
                },
                "exclude_id": user_id,  # don't echo back to sender
            },
        )

        logger.info("User %s (%s) joined room %s.", user_id, user_name, self.room_code)

    async def handle_webrtc_offer(self, data: dict) -> None:
        """
        Forward a WebRTC offer SDP directly to the target user.

        Args:
            data: {
                type:      "webrtc-offer",
                target_id: str — user_id of the intended recipient,
                sdp:       str — RTCSessionDescription serialized as string.
            }
        """
        target_id = data.get("target_id", "")
        sdp = data.get("sdp") or data.get("offer")

        if not target_id or sdp is None:
            await self.send_error("webrtc-offer requires target_id and sdp.")
            return

        await self.send_to_user(target_id, {
            "type": "webrtc-offer",
            "from_id": self.user_id,
            "sdp": sdp,
        })

    async def handle_webrtc_answer(self, data: dict) -> None:
        """
        Forward a WebRTC answer SDP directly to the target user.

        Args:
            data: {
                type:      "webrtc-answer",
                target_id: str — user_id of the intended recipient,
                sdp:       str — RTCSessionDescription serialized as string.
            }
        """
        target_id = data.get("target_id", "")
        sdp = data.get("sdp") or data.get("answer")

        if not target_id or sdp is None:
            await self.send_error("webrtc-answer requires target_id and sdp.")
            return

        await self.send_to_user(target_id, {
            "type": "webrtc-answer",
            "from_id": self.user_id,
            "sdp": sdp,
        })

    async def handle_ice_candidate(self, data: dict) -> None:
        """
        Forward an ICE candidate directly to the target user.

        Args:
            data: {
                type:      "ice-candidate",
                target_id: str  — user_id of the intended recipient,
                candidate: dict — RTCIceCandidateInit object.
            }
        """
        target_id = data.get("target_id", "")
        candidate = data.get("candidate")

        if not target_id or candidate is None:
            await self.send_error("ice-candidate requires target_id and candidate.")
            return

        await self.send_to_user(target_id, {
            "type": "ice-candidate",
            "from_id": self.user_id,
            "candidate": candidate,
        })

    async def handle_sign_detected(self, data: dict) -> None:
        """
        Broadcast a detected sign to ALL users in the room (including sender).

        Hearing users will receive this and trigger TTS.
        All users will see the SignBadge overlay on the sender's video tile.

        Args:
            data: {
                type:       "sign-detected",
                sign:       str   — e.g. "HELLO",
                confidence: float — 0.0–1.0, only sent if > 0.85 by client.
            }
        """
        raw_sign = data.get("sign", "")
        sign = str(raw_sign).strip().upper()

        if not sign:
            await self.send_error("sign-detected requires sign field.")
            return

        if sign not in self.VALID_SIGNS:
            await self.send_error("Invalid sign label.")
            return

        try:
            confidence = float(data.get("confidence", 0.0))
        except (TypeError, ValueError):
            await self.send_error("Invalid confidence value.")
            return

        if confidence < 0 or confidence > 1:
            await self.send_error("Confidence must be between 0 and 1.")
            return

        self.sign_count += 1

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "broadcast.message",
                "data": {
                    "type": "sign-detected",
                    "from_id": self.user_id,
                    "from_name": self.user_name,
                    "sign": sign,
                    "confidence": confidence,
                    "timestamp": data.get("timestamp", 0),
                    "sign_count": self.sign_count,
                },
                "exclude_id": None,  # include sender
            },
        )

    async def handle_speech_text(self, data: dict) -> None:
        """
        Broadcast speech caption text to all users EXCEPT the sender.

        Deaf users receive this and the CaptionOverlay updates.

        Args:
            data: {
                type:     "speech-text",
                text:     str  — transcript from Web Speech API,
                is_final: bool — True when SpeechRecognition fires a final result.
            }
        """
        raw_text = data.get("text", "")
        cleaned_text = str(raw_text).strip()

        if not cleaned_text:
            return

        if len(cleaned_text) > 500:
            return

        now = time.monotonic()
        if now - self.last_speech_time < 0.1:
            return
        self.last_speech_time = now

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "broadcast.message",
                "data": {
                    "type": "speech-text",
                    "from_id": self.user_id,
                    "from_name": self.user_name,
                    "text": cleaned_text,
                    "is_final": data.get("is_final", False),
                    "timestamp": data.get("timestamp", 0),
                },
                "exclude_id": self.user_id,
            },
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Channels dispatch handlers
    # (called by channel_layer.group_send / channel_layer.send)
    # ─────────────────────────────────────────────────────────────────────────

    async def broadcast_message(self, event: dict) -> None:
        """
        Dispatch handler for group_send type "broadcast.message".

        Forwards event["data"] as JSON to this WebSocket client,
        unless this consumer's user_id matches event["exclude_id"].

        Args:
            event: {
                type:       "broadcast.message",
                data:       dict — the message payload to forward,
                exclude_id: str | None — user_id to skip (or None to send to all).
            }
        """
        exclude_id = event.get("exclude_id")
        if exclude_id and self.user_id == exclude_id:
            return  # do not echo back to sender

        await self.send(text_data=json.dumps(event["data"]))

    async def direct_message(self, event: dict) -> None:
        """
        Dispatch handler for channel_layer.send() type "direct.message".

        Forwards event["data"] as JSON to this specific WebSocket client.

        Args:
            event: {
                type: "direct.message",
                data: dict — the message payload to forward.
            }
        """
        await self.send(text_data=json.dumps(event["data"]))

    # ─────────────────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def send_to_user(self, target_user_id: str, message: dict) -> None:
        """
        Send a message directly to a single user's WebSocket channel.

        Args:
            target_user_id: user_id of the intended recipient.
            message:        dict payload (will be JSON-encoded by direct_message).
        """
        room_users = SignMeetConsumer.rooms.get(self.room_code, {})
        target = room_users.get(target_user_id)

        if target is None:
            logger.warning(
                "send_to_user: target %s not found in room %s.",
                target_user_id,
                self.room_code,
            )
            return

        await self.channel_layer.send(
            target["channel_name"],
            {
                "type": "direct.message",
                "data": message,
            },
        )

    async def group_send_message(self, message_type: str, data: dict) -> None:
        """
        Convenience wrapper — broadcast to the entire room group.

        Args:
            message_type: The "type" key sent inside data["type"] to the client.
            data:         Full message payload dict (must include "type" key).
        """
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "broadcast.message",
                "data": data,
                "exclude_id": None,
            },
        )

    async def send_error(self, message: str) -> None:
        await self.send(text_data=json.dumps({
            "type": "error",
            "message": message,
        }))

    async def _send_error(self, message: str) -> None:
        """
        Send an error message back to this connection only.

        Args:
            message: Human-readable error description.
        """
        logger.warning("SignMeetConsumer error → %s: %s", self.channel_name, message)
        await self.send_error(message)

    async def _enforce_join_timeout(self) -> None:
        try:
            await asyncio.sleep(30)
            if not self.user_id:
                logger.warning("Join timeout: closing connection for room %s", self.room_code)
                await self.send_error("Join timeout")
                await self.close(code=4408)
        except asyncio.CancelledError:
            return

    # ─────────────────────────────────────────────────────────────────────────
    # Database helpers (sync_to_async wrappers)
    # ─────────────────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_room(self, room_code: str):
        """
        Fetch a Room by room_code or return None.

        Args:
            room_code: 8-character uppercase room code.

        Returns:
            Room instance or None.
        """
        from .models import Room  # local import avoids circular import at module level

        try:
            return Room.objects.get(room_code=room_code, is_active=True)
        except Room.DoesNotExist:
            return None
        except DatabaseError:
            logger.exception("Database error while fetching room %s", room_code)
            raise

    @database_sync_to_async
    def _increment_participants(self, room_code: str) -> None:
        """
        Atomically increment current_participants for a room.

        Args:
            room_code: 8-character uppercase room code.
        """
        from django.db.models import F

        from .models import Room

        try:
            Room.objects.filter(room_code=room_code).update(
                current_participants=F("current_participants") + 1
            )
        except DatabaseError:
            logger.exception("Database error while incrementing participants for %s", room_code)
            raise

    @database_sync_to_async
    def _decrement_participants(self, room_code: str) -> None:
        """
        Atomically decrement current_participants, flooring at 0.

        Args:
            room_code: 8-character uppercase room code.
        """
        from django.db.models import F, Value
        from django.db.models.functions import Greatest

        from .models import Room

        try:
            Room.objects.filter(room_code=room_code).update(
                current_participants=Greatest(F("current_participants") - 1, Value(0))
            )
        except DatabaseError:
            logger.exception("Database error while decrementing participants for %s", room_code)
            raise
