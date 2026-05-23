import os

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError


def get_users_collection() -> Collection:
    """
    Returns the MongoDB `users` collection.
    Raises PyMongoError if connection/server selection fails.
    """
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB_NAME", "trading_app")

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
    # Force a server selection now (fail fast).
    client.admin.command("ping")

    db = client[db_name]
    return db["users"]

