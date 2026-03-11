"""
video_call/tests.py

Django Channels WebSocket tests for SignMeetConsumer.

Tests use channels.testing.WebsocketCommunicator to simulate real WebSocket
connections without needing a running server or network socket.

Test classes:
    SignMeetConsumerTests — covers connect, join, multi-user, and sign broadcast.

Run with:
    python manage.py test video_call.tests --verbosity=2
"""

import json
import uuid

from channels.db import database_sync_to_async
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.testing import WebsocketCommunicator
from django.core.asgi import get_asgi_application
from django.test import TransactionTestCase, override_settings

from video_call.consumers import SignMeetConsumer
from video_call.models import Room
from video_call.routing import websocket_urlpatterns

# ─────────────────────────────────────────────────────────────────────────────
# Test-only ASGI app — strips AllowedHostsOriginValidator so tests don't need
# an Origin header (browsers always send one; WebsocketCommunicator does not).
# ─────────────────────────────────────────────────────────────────────────────
test_application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": URLRouter(websocket_urlpatterns),
    }
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def make_room(**kwargs) -> Room:
    """
    Async helper — create a Room in the test database.

    Args:
        **kwargs: Optional Room field overrides (name, max_participants, etc.).

    Returns:
        Room: Saved Room instance with auto-generated room_code.
    """

    @database_sync_to_async
    def _create():
        return Room.objects.create(
            name=kwargs.get("name", "Test Room"),
            max_participants=kwargs.get("max_participants", 8),
        )

    return await _create()


async def ws_connect(room_code: str) -> WebsocketCommunicator:
    """
    Create a WebsocketCommunicator connected to a room.

    Uses test_application (no AllowedHostsOriginValidator) so no Origin
    header is required.

    Args:
        room_code: Room code used in the WS URL path.

    Returns:
        WebsocketCommunicator: Communicator ready for send/receive.
    """
    communicator = WebsocketCommunicator(
        test_application,
        f"/ws/room/{room_code}/",
    )
    connected, _ = await communicator.connect()
    assert connected, f"WebSocket failed to connect to room {room_code}"
    return communicator


def join_payload(user_id: str, user_name: str) -> str:
    """
    Build a JSON "join" message payload.

    Args:
        user_id:   Unique user identifier string.
        user_name: Display name string.

    Returns:
        str: JSON-encoded join message.
    """
    return json.dumps({
        "type": "join",
        "user_id": user_id,
        "user_name": user_name,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Test suite
# ─────────────────────────────────────────────────────────────────────────────

@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
class SignMeetConsumerTests(TransactionTestCase):
    """
    Integration tests for the SignMeetConsumer WebSocket consumer.

    Uses TransactionTestCase (not TestCase) because Channels tests run in
    async coroutines and require real database transactions with actual
    commit/rollback behaviour.

    CHANNEL_LAYERS is overridden to force InMemoryChannelLayer regardless of
    whether REDIS_URL is set in .env — Redis is not available in unit tests.
    """

    # ── Fixture ───────────────────────────────────────────────────────────────

    def setUp(self) -> None:
        """Create a default room before each test and clear the room registry."""
        self.room = Room.objects.create(name="Integration Test Room")
        self.room_code = self.room.room_code
        # Clear class-level registry between tests to avoid state bleed
        SignMeetConsumer.rooms.clear()

    # ── Test 1: connect ───────────────────────────────────────────────────────

    async def test_websocket_connect(self) -> None:
        """
        Connecting to a valid room should receive a {"type": "connected"} message.
        """
        comm = await ws_connect(self.room_code)

        response = json.loads(await comm.receive_from())

        self.assertEqual(response["type"], "connected")
        self.assertEqual(response["room_code"], self.room_code)
        self.assertIn("message", response)

        await comm.disconnect()

    # ── Test 2: join ──────────────────────────────────────────────────────────

    async def test_join_room(self) -> None:
        """
        First user joining an empty room receives user-joined with empty existing_users.
        """
        comm = await ws_connect(self.room_code)
        await comm.receive_from()  # discard "connected" ack

        user_id = str(uuid.uuid4())
        await comm.send_to(join_payload(user_id, "Alice"))

        response = json.loads(await comm.receive_from())

        self.assertEqual(response["type"], "user-joined")
        self.assertEqual(response["user_id"], user_id)
        self.assertEqual(response["user_name"], "Alice")
        self.assertEqual(response["existing_users"], [])

        await comm.disconnect()

    # ── Test 3: two users join ────────────────────────────────────────────────

    async def test_two_users_join(self) -> None:
        """
        When a second user joins:
          - User 1 receives a "new-user" message.
          - User 2 receives "user-joined" with existing_users containing User 1.
        """
        # User 1 connects and joins
        comm1 = await ws_connect(self.room_code)
        await comm1.receive_from()  # "connected" ack

        user1_id = str(uuid.uuid4())
        await comm1.send_to(join_payload(user1_id, "Alice"))
        await comm1.receive_from()  # "user-joined" for user 1 (existing_users=[])

        # User 2 connects and joins
        comm2 = await ws_connect(self.room_code)
        await comm2.receive_from()  # "connected" ack

        user2_id = str(uuid.uuid4())
        await comm2.send_to(join_payload(user2_id, "Bob"))

        # User 2 receives "user-joined" with User 1 in existing_users
        user2_response = json.loads(await comm2.receive_from())
        self.assertEqual(user2_response["type"], "user-joined")
        self.assertEqual(user2_response["user_id"], user2_id)
        self.assertEqual(len(user2_response["existing_users"]), 1)
        self.assertEqual(user2_response["existing_users"][0]["user_id"], user1_id)
        self.assertEqual(user2_response["existing_users"][0]["user_name"], "Alice")

        # User 1 receives "new-user" broadcast about User 2
        user1_notification = json.loads(await comm1.receive_from())
        self.assertEqual(user1_notification["type"], "new-user")
        self.assertEqual(user1_notification["user_id"], user2_id)
        self.assertEqual(user1_notification["user_name"], "Bob")

        await comm1.disconnect()
        await comm2.disconnect()

    # ── Test 4: sign-detected broadcast ──────────────────────────────────────

    async def test_sign_detected_broadcast(self) -> None:
        """
        When User 1 sends sign-detected, BOTH users receive the broadcast.
        """
        # Setup: two users in the room
        comm1 = await ws_connect(self.room_code)
        await comm1.receive_from()  # "connected"

        user1_id = str(uuid.uuid4())
        await comm1.send_to(join_payload(user1_id, "Alice"))
        await comm1.receive_from()  # "user-joined"

        comm2 = await ws_connect(self.room_code)
        await comm2.receive_from()  # "connected"

        user2_id = str(uuid.uuid4())
        await comm2.send_to(join_payload(user2_id, "Bob"))
        await comm2.receive_from()  # "user-joined" for Bob
        await comm1.receive_from()  # "new-user" notification for Alice

        # User 1 sends a sign-detected message
        await comm1.send_to(json.dumps({
            "type": "sign-detected",
            "sign": "HELLO",
            "confidence": 0.97,
        }))

        # Both users should receive the broadcast
        sign_msg_user1 = json.loads(await comm1.receive_from())
        sign_msg_user2 = json.loads(await comm2.receive_from())

        for msg in (sign_msg_user1, sign_msg_user2):
            self.assertEqual(msg["type"], "sign-detected")
            self.assertEqual(msg["from_id"], user1_id)
            self.assertEqual(msg["from_name"], "Alice")
            self.assertEqual(msg["sign"], "HELLO")
            self.assertAlmostEqual(msg["confidence"], 0.97, places=2)

        await comm1.disconnect()
        await comm2.disconnect()

    # ── Test 5: room not found ────────────────────────────────────────────────

    async def test_connect_invalid_room(self) -> None:
        """
        Connecting to a non-existent room code should be rejected (connected=False).
        """
        comm = WebsocketCommunicator(test_application, "/ws/room/INVALID1/")
        connected, code = await comm.connect()
        self.assertFalse(connected)

    # ── Test 6: room capacity enforcement ────────────────────────────────────

    async def test_full_room_rejected(self) -> None:
        """
        Connecting to a room that is already at capacity should be rejected (connected=False).
        """

        @database_sync_to_async
        def create_full_room():
            return Room.objects.create(name="Full Room", max_participants=1)

        full_room = await create_full_room()
        room_code = full_room.room_code

        # First user fills the room
        comm1 = await ws_connect(room_code)
        await comm1.receive_from()  # "connected"
        await comm1.send_to(join_payload(str(uuid.uuid4()), "Alice"))
        await comm1.receive_from()  # "user-joined"

        # Second user should be rejected
        comm2 = WebsocketCommunicator(test_application, f"/ws/room/{room_code}/")
        connected, code = await comm2.connect()
        self.assertFalse(connected)

        await comm1.disconnect()

    # ── Test 7: unknown message type ─────────────────────────────────────────

    async def test_unknown_message_type(self) -> None:
        """
        Sending an unknown message type should return an error response.
        """
        comm = await ws_connect(self.room_code)
        await comm.receive_from()  # "connected"

        await comm.send_to(json.dumps({"type": "invalid-type"}))

        response = json.loads(await comm.receive_from())
        self.assertEqual(response["type"], "error")
        self.assertIn("Unknown message type", response["message"])

        await comm.disconnect()

    # ── Test 8: disconnect decrements participant count ───────────────────────

    async def test_disconnect_decrements_participants(self) -> None:
        """
        After a user disconnects, current_participants is decremented in the DB.
        """
        comm = await ws_connect(self.room_code)
        await comm.receive_from()  # "connected"

        user_id = str(uuid.uuid4())
        await comm.send_to(join_payload(user_id, "Alice"))
        await comm.receive_from()  # "user-joined"

        # Verify count incremented
        @database_sync_to_async
        def get_count():
            return Room.objects.get(room_code=self.room_code).current_participants

        count_after_join = await get_count()
        self.assertEqual(count_after_join, 1)

        await comm.disconnect()

        count_after_leave = await get_count()
        self.assertEqual(count_after_leave, 0)
