"""
video_call/models.py

Defines the Room model — the core entity of SignMeet.
Each Room represents a single video call session that participants join.
"""

import random
import string
import uuid

from django.db import models


def generate_room_code() -> str:
    """
    Generate a random 8-character alphanumeric room code.

    Uses uppercase letters + digits for readability.
    Example output: "A3KX92BZ"

    Returns:
        str: 8-character room code string.
    """
    characters = string.ascii_uppercase + string.digits
    return "".join(random.choices(characters, k=8))


class Room(models.Model):
    """
    Represents a video call room in SignMeet.

    A Room is created by the first user and shared via room_code.
    It tracks participant count and enforces a max-capacity limit.

    Attributes:
        id (UUID): Auto-generated UUID primary key.
        room_code (str): Unique 8-char alphanumeric code shared with participants.
        name (str): Human-readable room name (e.g. "Team Standup").
        created_at (datetime): Timestamp when the room was created.
        is_active (bool): Whether the room is currently open for joining.
        max_participants (int): Maximum number of simultaneous participants (default 8).
        current_participants (int): Live count of connected participants.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Auto-generated UUID primary key.",
    )
    room_code = models.CharField(
        max_length=8,
        unique=True,
        editable=False,
        help_text="Unique 8-character alphanumeric room code.",
    )
    name = models.CharField(
        max_length=100,
        help_text="Human-readable room name.",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the room was created.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this room is open and accepting participants.",
    )
    max_participants = models.IntegerField(
        default=8,
        help_text="Maximum number of simultaneous participants allowed.",
    )
    current_participants = models.IntegerField(
        default=0,
        help_text="Current number of connected participants.",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Room"
        verbose_name_plural = "Rooms"

    def save(self, *args, **kwargs) -> None:
        """
        Override save to auto-generate room_code on first creation.

        Generates unique codes in a loop to avoid (extremely unlikely)
        collisions with existing codes.
        """
        if not self.room_code:
            code = generate_room_code()
            # Ensure uniqueness — loop until we have a code not in use
            while Room.objects.filter(room_code=code).exists():
                code = generate_room_code()
            self.room_code = code
        super().save(*args, **kwargs)

    def is_full(self) -> bool:
        """
        Check whether the room has reached its participant capacity.

        Returns:
            bool: True if current_participants >= max_participants.
        """
        return self.current_participants >= self.max_participants

    def __str__(self) -> str:
        """Return room_code as string representation."""
        return self.room_code
