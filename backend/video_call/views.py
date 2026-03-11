"""
video_call/views.py

REST API views for SignMeet room management.

Endpoints:
    POST /api/rooms/create/        — Create a new room, receive room_code
    POST /api/rooms/join/          — Join an existing room by room_code
    GET  /api/rooms/<room_code>/   — Retrieve room details
    GET  /api/health/              — Server health check
"""

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Room
from .serializers import CreateRoomSerializer, JoinRoomSerializer, RoomSerializer


class RoomCreateView(APIView):
    """
    POST /api/rooms/create/

    Create a new SignMeet room.

    Request body:
        { "name": "My Room" }

    Response 201:
        {
            "room_code": "A3KX92BZ",
            "name": "My Room",
            "id": "<uuid>"
        }
    """

    def post(self, request: Request) -> Response:
        """
        Validate input, create Room, return room_code + id.

        Args:
            request: DRF Request with JSON body containing "name".

        Returns:
            Response: 201 with room_code, name, id on success.
                      400 with validation errors on failure.
        """
        serializer = CreateRoomSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        room = Room.objects.create(name=serializer.validated_data["name"])

        return Response(
            {
                "room_code": room.room_code,
                "name": room.name,
                "id": str(room.id),
            },
            status=status.HTTP_201_CREATED,
        )


class RoomJoinView(APIView):
    """
    POST /api/rooms/join/

    Validate that a room exists and has capacity before the WebSocket
    connection is established. Does NOT increment participant count —
    that is handled by the WebSocket consumer on connect/disconnect.

    Request body:
        { "room_code": "A3KX92BZ", "user_name": "Alice" }

    Response 200:
        {
            "room_code": "A3KX92BZ",
            "name": "My Room",
            "current_participants": 2,
            "max_participants": 8
        }
    """

    def post(self, request: Request) -> Response:
        """
        Validate room_code + user_name, return room info for WebRTC setup.

        Args:
            request: DRF Request with JSON body containing "room_code" and "user_name".

        Returns:
            Response: 200 with room details on success.
                      400 if room not found or full.
        """
        serializer = JoinRoomSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        room_code = serializer.validated_data["room_code"]
        room = Room.objects.get(room_code=room_code)

        return Response(
            {
                "room_code": room.room_code,
                "name": room.name,
                "current_participants": room.current_participants,
                "max_participants": room.max_participants,
            },
            status=status.HTTP_200_OK,
        )


class RoomDetailView(APIView):
    """
    GET /api/rooms/<room_code>/

    Retrieve full details for a single room.

    Response 200: Full RoomSerializer payload.
    Response 404: { "error": "Room not found" }
    """

    def get(self, request: Request, room_code: str) -> Response:
        """
        Fetch room by room_code and return full serialized data.

        Args:
            request: DRF Request.
            room_code: 8-character room code from URL path.

        Returns:
            Response: 200 with full room data, or 404 if not found.
        """
        try:
            room = Room.objects.get(room_code=room_code.upper())
        except Room.DoesNotExist:
            return Response(
                {"error": "Room not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = RoomSerializer(room)
        return Response(serializer.data, status=status.HTTP_200_OK)


class HealthCheckView(APIView):
    """
    GET /api/health/

    Lightweight health check endpoint used by Docker, load balancers,
    and CI pipelines to confirm the server is alive.

    Response 200:
        { "status": "ok", "version": "1.0" }
    """

    def get(self, request: Request) -> Response:
        """
        Return server health status.

        Args:
            request: DRF Request (unused).

        Returns:
            Response: 200 with status and version.
        """
        return Response(
            {"status": "ok", "version": "1.0"},
            status=status.HTTP_200_OK,
        )
