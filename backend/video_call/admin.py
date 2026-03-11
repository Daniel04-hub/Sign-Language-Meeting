"""
video_call/admin.py

Django admin registration for SignMeet models.

Registers the Room model with a customised admin interface:
- List view shows key fields at a glance.
- Search by room_code or name.
- Filter by is_active status.
- room_code and created_at are read-only (auto-generated).
"""

from django.contrib import admin

from .models import Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    """
    Admin interface for the Room model.

    List display shows the most operationally relevant fields.
    room_code is read-only because it is auto-generated on save.
    """

    # ── List view ─────────────────────────────────────────────────────────────
    list_display = [
        "room_code",
        "name",
        "current_participants",
        "max_participants",
        "is_active",
        "created_at",
    ]
    list_filter = ["is_active"]
    search_fields = ["room_code", "name"]
    ordering = ["-created_at"]

    # ── Detail / change view ──────────────────────────────────────────────────
    readonly_fields = ["room_code", "created_at", "id"]

    fieldsets = (
        (
            "Room Identity",
            {
                "fields": ("id", "room_code", "name"),
            },
        ),
        (
            "Participants",
            {
                "fields": ("current_participants", "max_participants"),
            },
        ),
        (
            "Status",
            {
                "fields": ("is_active", "created_at"),
            },
        ),
    )
