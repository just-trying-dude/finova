from __future__ import annotations

import logging
from typing import Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[MongoClient] = None


def get_mongo_client() -> MongoClient:
    """
    Shared MongoDB client (one per process).
    """
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    uri = settings.mongo_uri_for_dev()
    if not uri:
        raise PyMongoError("MONGO_URI is not configured")

    timeout_ms = 8000 if settings.is_production else 3000
    _client = MongoClient(
        uri,
        serverSelectionTimeoutMS=timeout_ms,
        tls=True,
        retryWrites=True,
    )
    return _client


def ping_database() -> None:
    """Verify MongoDB is reachable (used on startup)."""
    client = get_mongo_client()
    client.admin.command("ping")


def get_users_collection() -> Collection:
    """
    Returns the MongoDB `users` collection.
    Raises PyMongoError if connection/server selection fails.
    """
    settings = get_settings()
    client = get_mongo_client()
    client.admin.command("ping")
    db = client[settings.mongo_db_name]
    return db["users"]
