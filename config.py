"""
Application settings from environment variables (Render / local / Vercel).
"""
from __future__ import annotations

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


class Settings:
    def __init__(self) -> None:
        self.env = (os.getenv("ENV") or os.getenv("APP_ENV") or "development").strip().lower()
        self.port = int(os.getenv("PORT", "8000"))

        self.mongo_uri = (os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "").strip()
        self.mongo_db_name = (os.getenv("MONGO_DB_NAME") or "trading_app").strip()

        self.jwt_secret_key = (os.getenv("JWT_SECRET_KEY") or "").strip()
        self.jwt_algorithm = (os.getenv("JWT_ALGORITHM") or "HS256").strip()
        self.jwt_expires_minutes = int(os.getenv("JWT_EXPIRES_MINUTES", str(24 * 60)))
        self.jwt_remember_days = int(os.getenv("JWT_REMEMBER_DAYS", "30"))

        self.create_test_user = _env_bool("CREATE_TEST_USER", default=self.env != "production")

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
    def is_production(self) -> bool:
        return self.env in ("production", "prod")

    def mongo_uri_for_dev(self) -> str:
        """Local fallback only when not in production."""
        if self.mongo_uri:
            return self.mongo_uri
        if self.is_production:
            return ""
        return "mongodb://localhost:27017"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_settings(settings: Settings | None = None) -> None:
    s = settings or get_settings()

    if s.is_production:
        missing: List[str] = []
        if not s.mongo_uri:
            missing.append("MONGO_URI")
        if not s.jwt_secret_key or s.jwt_secret_key == "CHANGE_ME":
            missing.append("JWT_SECRET_KEY")
        if missing:
            msg = f"Missing required environment variables for production: {', '.join(missing)}"
            print(msg, file=sys.stderr)
            raise RuntimeError(msg)

        if not _parse_origins(os.getenv("CORS_ORIGINS"), os.getenv("VERCEL_FRONTEND_URL")):
            print(
                "Warning: set VERCEL_FRONTEND_URL or CORS_ORIGINS for production CORS.",
                file=sys.stderr,
            )
