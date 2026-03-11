"""
WSGI config for SignMeet.

Used by traditional WSGI servers (Gunicorn, uWSGI).
For production with WebSockets use asgi.py + Daphne instead.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "signmeet.settings")

application = get_wsgi_application()
