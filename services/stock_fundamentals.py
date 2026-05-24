"""Extended stock metadata via yfinance."""

from __future__ import annotations

import asyncio

from services.stock_service import normalize_symbol, resolve_symbol


def _fetch_info_sync(symbol: str) -> dict:
    import yfinance as yf

    sym = normalize_symbol(symbol)
    if not sym:
        return {}
    try:
        t = yf.Ticker(sym)
        info = getattr(t, "info", None) or {}
        if not isinstance(info, dict):
            return {}
        return info
    except Exception:
        return {}


async def fetch_stock_fundamentals(symbol: str) -> dict:
    from services.ttl_cache import fundamentals_cache

    sym = await resolve_symbol(symbol)
    if not sym:
        return {}

    cache_key = f"fund:{sym}"
    cached = fundamentals_cache.get(cache_key)
    if cached is not None:
        return dict(cached)

    info = await asyncio.to_thread(_fetch_info_sync, sym)
    if not info:
        return {"symbol": sym}

    def _f(key, default=None):
        v = info.get(key)
        if v is None or v == "":
            return default
        return v

    result = {
        "symbol": sym,
        "name": _f("longName") or _f("shortName"),
        "exchange": _f("exchange"),
        "sector": _f("sector"),
        "industry": _f("industry"),
        "description": (_f("longBusinessSummary") or "")[:1200],
        "market_cap": _f("marketCap"),
        "pe_ratio": _f("trailingPE") or _f("forwardPE"),
        "fifty_two_week_high": _f("fiftyTwoWeekHigh"),
        "fifty_two_week_low": _f("fiftyTwoWeekLow"),
        "volume": _f("volume") or _f("regularMarketVolume"),
        "avg_volume": _f("averageVolume"),
        "dividend_yield": _f("dividendYield"),
        "beta": _f("beta"),
        "currency": _f("currency"),
    }
    fundamentals_cache.set(cache_key, result, ttl=3600)
    return result
