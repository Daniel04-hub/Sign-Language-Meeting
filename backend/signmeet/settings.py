"""
Django settings for SignMeet.

Dev:  PostgreSQL + InMemoryChannelLayer  (values from .env)
Prod: PostgreSQL + Redis Channel Layer  (values from environment)

Requires a .env file at backend/.env (see .env.example).
"""

from pathlib import Path
from urllib.parse import urlparse
import socket

from decouple import Csv, config

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ─────────────────────────────────────────────────────────────────────────────
# Security  (override SECRET_KEY via env var in production)
# ─────────────────────────────────────────────────────────────────────────────
SECRET_KEY = config(
    "SECRET_KEY",
    default="dev-insecure-key-change-this-in-production-signmeet-2026",
)

DEBUG = config("DEBUG", default=True, cast=bool)

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1,0.0.0.0",
    cast=Csv(),
)

# ─────────────────────────────────────────────────────────────────────────────
# Installed apps
# ─────────────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    # daphne MUST come before django.contrib.staticfiles
    "daphne",
    # Django defaults
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "channels",
    "rest_framework",
    "corsheaders",
    # Local apps
    "video_call",
]

# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",        # Must be FIRST
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ─────────────────────────────────────────────────────────────────────────────
# URL / ASGI / WSGI
# ─────────────────────────────────────────────────────────────────────────────
ROOT_URLCONF = "signmeet.urls"
WSGI_APPLICATION = "signmeet.wsgi.application"
ASGI_APPLICATION = "signmeet.asgi.application"

# ─────────────────────────────────────────────────────────────────────────────
# Templates
# ─────────────────────────────────────────────────────────────────────────────
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Database
# Default: PostgreSQL (values from .env)
# Local fallback: SQLite when USE_SQLITE=True
# ─────────────────────────────────────────────────────────────────────────────
USE_SQLITE = config("USE_SQLITE", default=False, cast=bool)

if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME", default="signmeet_db"),
            "USER": config("DB_USER", default="postgres"),
            "PASSWORD": config("DB_PASSWORD", default="postgres"),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5432"),
        }
    }

# ─────────────────────────────────────────────────────────────────────────────
# Django Channels — InMemoryChannelLayer for dev
# Switch to RedisChannelLayer in production by setting REDIS_URL env var
# ─────────────────────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="")


def _redis_reachable(redis_url: str) -> bool:
    if not redis_url:
        return False
    try:
        parsed = urlparse(redis_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        with socket.create_connection((host, port), timeout=0.35):
            return True
    except OSError:
        return False

if REDIS_URL and _redis_reachable(REDIS_URL):
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ─────────────────────────────────────────────────────────────────────────────
# CORS — allow React Vite dev server (port 5173) + production origins
# ─────────────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",    # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:3000",    # fallback
]

# Allow credentials (cookies / auth headers) from React
CORS_ALLOW_CREDENTIALS = True

# Allow WebSocket upgrade headers
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# ─────────────────────────────────────────────────────────────────────────────
# Django REST Framework
# ─────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    # Use JSON renderer only (no DRF browsable API HTML in prod)
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        # Keep browsable API available in DEBUG mode
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    # No auth required by default — individual views can restrict
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    # Pagination for list endpoints
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

# ─────────────────────────────────────────────────────────────────────────────
# Password validation
# ─────────────────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─────────────────────────────────────────────────────────────────────────────
# Internationalisation
# ─────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ─────────────────────────────────────────────────────────────────────────────
# Static files
# ─────────────────────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
