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

MONGO_URI = os.getenv("MONGO_URI")


def get_mongo_client() -> MongoClient:
    """
    Shared MongoDB client (one per process).
    Uses MONGO_URI from the environment with TLS + certifi.
    """
    global _client
    if _client is not None:
        return _client

    uri = (MONGO_URI or "").strip()
    if not uri:
        logger.error("MONGO_URI is not set")
        raise PyMongoError("MONGO_URI is not configured")

    if not uri.startswith("mongodb+srv://"):
        logger.error("MONGO_URI must use mongodb+srv:// (Atlas SRV connection string)")
        raise PyMongoError("MONGO_URI must use mongodb+srv://")

    try:
        print("Connecting to MongoDB Atlas...")
        logger.info("Connecting to MongoDB Atlas (tls=True, tlsCAFile=certifi, timeout_ms=30000)")
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=30000,
            tls=True,
            tlsCAFile=certifi.where(),
            retryWrites=True,
        )
        _client.admin.command("ping")
        print("MongoDB connected successfully")
        logger.info("MongoDB connected successfully")
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


def ping_database(timeout_ms: int | None = None) -> None:
    """Verify MongoDB is reachable (used on startup / health)."""
    global _client
    uri = (MONGO_URI or "").strip()
    if not uri:
        raise PyMongoError("MONGO_URI is not configured")
    if not uri.startswith("mongodb+srv://"):
        raise PyMongoError("MONGO_URI must use mongodb+srv://")

    ms = timeout_ms if timeout_ms is not None else 30000
    try:
        if _client is None:
            logger.info("MongoDB ping (timeout_ms=%s)", ms)
            client = MongoClient(
                uri,
                serverSelectionTimeoutMS=ms,
                tls=True,
                tlsCAFile=certifi.where(),
                retryWrites=True,
            )
            client.admin.command("ping")
            _client = client
            logger.info("MongoDB connected successfully")
        else:
            _client.admin.command("ping")
    except Exception as exc:
        logger.error("MongoDB ping failed: %s", exc, exc_info=True)
        _client = None
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
