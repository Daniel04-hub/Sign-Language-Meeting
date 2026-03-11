"""
video_call/routing.py

WebSocket URL patterns for SignMeet.
Imported by signmeet/asgi.py → ProtocolTypeRouter → URLRouter.

Routes:
    ws://host/ws/room/<room_code>/  →  SignMeetConsumer
"""

from django.urls import re_path

from .consumers import SignMeetConsumer

websocket_urlpatterns = [
    # Match any 1+ character room code (React generates 8-char uppercase codes)
    re_path(r"^ws/room/(?P<room_code>[A-Z0-9]+)/$", SignMeetConsumer.as_asgi()),
]
