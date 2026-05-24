from __future__ import annotations

import logging
import os
from typing import Optional

import certifi
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError

from config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[MongoClient] = None

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")


def _resolve_mongo_uri() -> str:
    uri = (MONGO_URI or "").strip()
    if uri:
        return uri
    settings = get_settings()
    return settings.mongo_uri_for_dev()


def get_mongo_client() -> MongoClient:
    """
    Shared MongoDB client (one per process).
    Uses MONGO_URI from the environment with TLS + certifi (Python 3.14 safe).
    """
    global _client
    if _client is not None:
        return _client

    uri = _resolve_mongo_uri()
    if not uri:
        logger.error("MONGO_URI is not set (checked MONGO_URI and MONGODB_URI)")
        raise PyMongoError("MONGO_URI is not configured")

    settings = get_settings()
    timeout_ms = 8000 if settings.is_production else 3000

    try:
        logger.info(
            "Connecting to MongoDB (tls=True, tlsCAFile=certifi, timeout_ms=%s)",
            timeout_ms,
        )
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=timeout_ms,
            tls=True,
            tlsCAFile=certifi.where(),
            retryWrites=True,
        )
        _client.admin.command("ping")
        logger.info("MongoDB connection OK")
    except ServerSelectionTimeoutError as exc:
        logger.error(
            "MongoDB server selection failed (timeout). Check MONGO_URI, Atlas IP allowlist, and TLS. Error: %s",
            exc,
            exc_info=True,
        )
        _client = None
        raise
    except PyMongoError as exc:
        logger.error("MongoDB PyMongo error: %s", exc, exc_info=True)
        _client = None
        raise
    except Exception as exc:
        logger.error("MongoDB unexpected connection error: %s", exc, exc_info=True)
        _client = None
        raise

    return _client


def ping_database() -> None:
    """Verify MongoDB is reachable (used on startup)."""
    try:
        client = get_mongo_client()
        client.admin.command("ping")
    except Exception as exc:
        logger.error("MongoDB ping failed: %s", exc, exc_info=True)
        raise


def get_users_collection() -> Collection:
    """
    Returns the MongoDB `users` collection.
    Raises PyMongoError if connection/server selection fails.
    """
    settings = get_settings()
    client = get_mongo_client()
    db = client[settings.mongo_db_name]
    return db["users"]
