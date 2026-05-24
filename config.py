"""
Application settings from environment variables (Render / local / Vercel).
"""
from __future__ import annotations

import hashlib
import os
import sys
from functools import lru_cache
from typing import List


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _parse_origins(*values: str | None) -> List[str]:
    out: List[str] = []
    for value in values:
        if not value:
            continue
        for part in value.split(","):
            origin = part.strip().rstrip("/")
            if origin and origin not in out:
                out.append(origin)
    return out


def _is_render_host() -> bool:
    """Render sets RENDER=true on web services."""
    return os.getenv("RENDER", "").strip().lower() in ("true", "1", "yes")


def _render_jwt_fallback() -> str:
    """Stable per-service secret when Render env group did not inject JWT_SECRET_KEY."""
    service_id = (
        os.getenv("RENDER_SERVICE_ID")
        or os.getenv("RENDER_SERVICE_NAME")
        or os.getenv("RENDER_EXTERNAL_HOSTNAME")
        or "finova-api"
    )
    return hashlib.sha256(f"finova-jwt-v1:{service_id}".encode()).hexdigest()


def _read_jwt_secret_from_env() -> str:
    """Explicit JWT secret from environment (supports common alternate names)."""
    for name in ("JWT_SECRET_KEY", "JWT_SECRET", "SECRET_KEY"):
        value = (os.getenv(name) or "").strip()
        if _is_valid_jwt_secret(value):
            return value
    return ""


def resolve_jwt_secret() -> tuple[str, bool]:
    """
    Returns (secret, is_render_fallback).
    On Render, uses a service-derived fallback so deploy is not blocked by env group issues.
    """
    explicit = _read_jwt_secret_from_env()
    if explicit:
        return explicit, False
    if _is_render_host():
        return _render_jwt_fallback(), True
    return "", False


_JWT_PLACEHOLDERS = frozenset(
    {
        "change_me",
        "change-me",
        "changeme",
        "your-long-random-secret",
        "change-me-to-a-long-random-secret",
    }
)


def _is_valid_jwt_secret(value: str) -> bool:
    if not value or len(value) < 16:
        return False
    if value.strip().lower() in _JWT_PLACEHOLDERS or value.strip().upper() == "CHANGE_ME":
        return False
    return True


def _log_env_diagnostics() -> None:
    """Log which expected vars are visible to the process (names only, not values)."""
    keys = (
        "JWT_SECRET_KEY",
        "JWT_SECRET",
        "SECRET_KEY",
        "MONGO_URI",
        "MONGODB_URI",
        "ENV",
        "VERCEL_FRONTEND_URL",
        "RENDER",
    )
    print("Environment diagnostic (set = present and non-empty):", file=sys.stderr)
    for key in keys:
        raw = os.getenv(key)
        status = "set" if raw and raw.strip() else "MISSING"
        print(f"  {key}: {status}", file=sys.stderr)
    related = sorted(k for k in os.environ if "JWT" in k.upper() or k.upper().endswith("_SECRET"))
    if related:
        print(f"  Other secret-like keys in process: {', '.join(related)}", file=sys.stderr)


class Settings:
    def __init__(self) -> None:
        raw_env = (os.getenv("ENV") or os.getenv("APP_ENV") or "").strip().lower()
        if raw_env:
            self.env = raw_env
        elif _is_render_host():
            # Blueprint/manual deploys often omit ENV; treat Render as production.
            self.env = "production"
        else:
            self.env = "development"
        self.port = int(os.getenv("PORT", "8000"))

        self.mongo_uri = (os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "").strip()
        self.mongo_db_name = (os.getenv("MONGO_DB_NAME") or "trading_app").strip()

        self.jwt_secret_key, self.jwt_secret_is_render_fallback = resolve_jwt_secret()
        if self.jwt_secret_is_render_fallback:
            print(
                "WARNING: JWT_SECRET_KEY is not set in this container — using a Render "
                "service-derived fallback so the API can start. Add JWT_SECRET_KEY to your "
                "Environment Group (exact name) or on the service → Environment, then redeploy.",
                file=sys.stderr,
            )
        self.jwt_algorithm = (os.getenv("JWT_ALGORITHM") or "HS256").strip()
        self.jwt_expires_minutes = int(os.getenv("JWT_EXPIRES_MINUTES", str(24 * 60)))
        self.jwt_remember_days = int(os.getenv("JWT_REMEMBER_DAYS", "30"))

        self.create_test_user = _env_bool("CREATE_TEST_USER", default=self.env != "production")
        # Allow *.vercel.app on production and on Render (even if ENV was not set).
        self.cors_allow_vercel_previews = _env_bool(
            "CORS_ALLOW_VERCEL_PREVIEWS",
            default=self.is_production or _is_render_host(),
        )

        local_defaults = (
            []
            if self.is_production
            else [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]
        )
        extra = _parse_origins(
            os.getenv("CORS_ORIGINS"),
            os.getenv("FRONTEND_ORIGINS"),
            os.getenv("VERCEL_FRONTEND_URL"),
        )
        self.cors_origins: List[str] = []
        for origin in local_defaults + extra:
            if origin not in self.cors_origins:
                self.cors_origins.append(origin)

    @property
    def cors_origin_regex(self) -> str | None:
        if self.cors_allow_vercel_previews:
            return r"https://.*\.vercel\.app"
        return None

    @property
    def is_production(self) -> bool:
        return self.env in ("production", "prod")

    def mongo_uri_for_dev(self) -> str:
        """URI from environment only (no hardcoded connection strings)."""
        return self.mongo_uri


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_settings(settings: Settings | None = None) -> None:
    s = settings or get_settings()

    if s.is_production:
        missing: List[str] = []
        if not s.mongo_uri:
            missing.append("MONGO_URI")
        # JWT may use Render fallback (logged above); only fail if still no secret.
        if not s.jwt_secret_key:
            missing.append("JWT_SECRET_KEY")
        if missing:
            _log_env_diagnostics()
            hints = []
            if "JWT_SECRET_KEY" in missing:
                hints.append(
                    "JWT_SECRET_KEY must be set on the Render API web service (exact name). "
                    "If using an Environment Group, open the service → Environment and confirm "
                    "JWT_SECRET_KEY appears there (not only on Vercel). Value must be 16+ chars, "
                    "not a placeholder from .env.example."
                )
            if "MONGO_URI" in missing:
                hints.append("MONGO_URI: your MongoDB Atlas mongodb+srv:// connection string.")
            msg = (
                f"Missing required environment variables for production: {', '.join(missing)}. "
                + " ".join(hints)
                + " Save env vars and redeploy the API service."
            )
            print(msg, file=sys.stderr)
            raise RuntimeError(msg)

        if not _parse_origins(os.getenv("CORS_ORIGINS"), os.getenv("VERCEL_FRONTEND_URL")):
            print(
                "Warning: set VERCEL_FRONTEND_URL or CORS_ORIGINS for production CORS.",
                file=sys.stderr,
            )
