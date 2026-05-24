"""Simple in-memory TTL cache for market and analytics data."""

from __future__ import annotations

import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")


class TTLCache:
    def __init__(self, default_ttl: float = 30.0):
        self.default_ttl = default_ttl
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any | None:
        row = self._store.get(key)
        if not row:
            return None
        value, expires = row
        if time.time() >= expires:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        sec = self.default_ttl if ttl is None else ttl
        self._store[key] = (value, time.time() + sec)

    async def get_or_set(self, key: str, factory: Callable[[], T], ttl: float | None = None) -> T:
        hit = self.get(key)
        if hit is not None:
            return hit
        import asyncio

        if asyncio.iscoroutinefunction(factory):
            value = await factory()
        else:
            value = factory()
        self.set(key, value, ttl)
        return value


# Shared caches (process-local)
fundamentals_cache = TTLCache(default_ttl=3600)
history_1y_cache = TTLCache(default_ttl=600)
analytics_bundle_cache = TTLCache(default_ttl=45)
returns_weights_cache = TTLCache(default_ttl=60)
market_overview_cache = TTLCache(default_ttl=45)
market_global_cache = TTLCache(default_ttl=60)
market_heatmap_cache = TTLCache(default_ttl=45)
strict_quote_cache = TTLCache(default_ttl=12)
quote_batch_cache = TTLCache(default_ttl=15)
