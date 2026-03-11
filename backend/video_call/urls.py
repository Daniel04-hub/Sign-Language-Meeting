"""
video_call/urls.py

URL patterns for SignMeet REST API.
All routes are mounted under /api/ in signmeet/urls.py.

Routes:
    POST   /api/rooms/create/        → RoomCreateView
    POST   /api/rooms/join/          → RoomJoinView
    GET    /api/rooms/<room_code>/   → RoomDetailView
    GET    /api/health/              → HealthCheckView
"""

from django.urls import path

from .views import HealthCheckView, RoomCreateView, RoomDetailView, RoomJoinView

urlpatterns = [
    # ── Room lifecycle ────────────────────────────────────────────────────────
    path("rooms/create/", RoomCreateView.as_view(), name="room-create"),
    path("rooms/join/", RoomJoinView.as_view(), name="room-join"),
    path("rooms/<str:room_code>/", RoomDetailView.as_view(), name="room-detail"),

    # ── Ops ───────────────────────────────────────────────────────────────────
    path("health/", HealthCheckView.as_view(), name="health-check"),
]
