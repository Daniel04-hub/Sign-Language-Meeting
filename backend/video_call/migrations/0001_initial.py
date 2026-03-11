"""
video_call/migrations/0001_initial.py

Initial migration — creates the Room table in PostgreSQL.

Generated for model:
    video_call.Room

Fields:
    id                   UUIDField      PK, auto uuid4
    room_code            CharField      max_length=8, unique
    name                 CharField      max_length=100
    created_at           DateTimeField  auto_now_add
    is_active            BooleanField   default=True
    max_participants     IntegerField   default=8
    current_participants IntegerField   default=0
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Room",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        help_text="Auto-generated UUID primary key.",
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "room_code",
                    models.CharField(
                        editable=False,
                        help_text="Unique 8-character alphanumeric room code.",
                        max_length=8,
                        unique=True,
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        help_text="Human-readable room name.",
                        max_length=100,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True,
                        help_text="Timestamp when the room was created.",
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                        help_text="Whether this room is open and accepting participants.",
                    ),
                ),
                (
                    "max_participants",
                    models.IntegerField(
                        default=8,
                        help_text="Maximum number of simultaneous participants allowed.",
                    ),
                ),
                (
                    "current_participants",
                    models.IntegerField(
                        default=0,
                        help_text="Current number of connected participants.",
                    ),
                ),
            ],
            options={
                "verbose_name": "Room",
                "verbose_name_plural": "Rooms",
                "ordering": ["-created_at"],
            },
        ),
    ]
