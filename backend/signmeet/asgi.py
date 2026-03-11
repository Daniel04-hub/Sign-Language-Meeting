"""
ASGI config for SignMeet.

Handles two protocol types:
  - HTTP  → Django's standard ASGI app (REST API, admin)
  - WebSocket → Django Channels URLRouter (signaling + AI broadcasts)

Routing:
  ws://host/ws/room/{room_code}/  →  video_call.consumers.RoomConsumer
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "signmeet.settings")

# Initialise Django BEFORE importing app-level modules (consumers, routing)
django_asgi_app = get_asgi_application()

# Import WebSocket URL patterns AFTER Django setup
from video_call.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        # ── HTTP ──────────────────────────────────────────────────────────────
        # All standard HTTP requests (API endpoints, admin, static files in dev)
        "http": django_asgi_app,

        # ── WebSocket ─────────────────────────────────────────────────────────
        # AllowedHostsOriginValidator: rejects WS connections from unlisted origins
        # AuthMiddlewareStack:         populates scope["user"] from session cookie
        # URLRouter:                   dispatches to correct consumer by path
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(
                URLRouter(websocket_urlpatterns)
            )
        ),
    }
)
