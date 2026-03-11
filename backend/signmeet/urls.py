"""
Root URL configuration for SignMeet Django project.

URL layout:
  /api/         →  video_call REST API (rooms, etc.)
  /admin/       →  Django admin panel
  /api/schema/  →  (future) DRF schema endpoint
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # ── Django admin ──────────────────────────────────────────────────────────
    path("admin/", admin.site.urls),

    # ── SignMeet REST API ──────────────────────────────────────────────────────
    # All video_call endpoints live under /api/
    # e.g.  POST /api/rooms/          → create room
    #        GET /api/rooms/{code}/   → retrieve room details
    path("api/", include("video_call.urls")),
]
