"""Financial news via yfinance (symbol-specific or market-wide)."""

from __future__ import annotations

import asyncio
import time

from services.stock_service import normalize_symbol, resolve_symbol

_news_cache: dict[str, tuple[list, float]] = {}
_CACHE_TTL = 120


def _fetch_news_sync(symbol: str | None, limit: int) -> list[dict]:
    import yfinance as yf

    tickers = []
    if symbol:
        sym = normalize_symbol(symbol)
        if sym:
            tickers = [sym]
    else:
        tickers = ["^NSEI", "^GSPC", "BTC-USD"]

    seen: set[str] = set()
    out: list[dict] = []

    for t_sym in tickers:
        try:
            items = yf.Ticker(t_sym).news or []
        except Exception:
            items = []
        for item in items:
            if not isinstance(item, dict):
                continue
            link = item.get("link") or item.get("url") or ""
            title = item.get("title") or ""
            if not title:
                continue
            key = link or title
            if key in seen:
                continue
            seen.add(key)
            ts = item.get("providerPublishTime") or item.get("pubDate")
            published = None
            if isinstance(ts, (int, float)):
                published = int(ts if ts > 1e12 else ts * 1000)
            out.append(
                {
                    "title": title,
                    "source": item.get("publisher") or item.get("source") or "Market",
                    "url": link,
                    "published_at": published,
                    "related_symbol": t_sym if symbol else None,
                }
            )
            if len(out) >= limit:
                return out[:limit]
    return out[:limit]


async def fetch_market_news(symbol: str | None = None, limit: int = 12) -> list[dict]:
    sym = None
    if symbol:
        sym = await resolve_symbol(symbol)
    cache_key = sym or "__market__"
    now = time.time()
    cached = _news_cache.get(cache_key)
    if cached and now - cached[1] < _CACHE_TTL:
        return cached[0][:limit]

    rows = await asyncio.to_thread(_fetch_news_sync, sym, max(limit, 20))
    _news_cache[cache_key] = (rows, now)
    return rows[:limit]
