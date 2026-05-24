"""Global indices and macro instruments."""

from __future__ import annotations

GLOBAL_MARKET_DEFS = [
    {"key": "nifty", "symbol": "^NSEI", "title": "NIFTY 50", "region": "India", "value_unit": "pts"},
    {"key": "sensex", "symbol": "^BSESN", "title": "SENSEX", "region": "India", "value_unit": "pts"},
    {"key": "nasdaq", "symbol": "^IXIC", "title": "NASDAQ", "region": "US", "value_unit": "pts"},
    {"key": "sp500", "symbol": "^GSPC", "title": "S&P 500", "region": "US", "value_unit": "pts"},
    {"key": "dow", "symbol": "^DJI", "title": "DOW", "region": "US", "value_unit": "pts"},
    {"key": "nikkei", "symbol": "^N225", "title": "Nikkei", "region": "Japan", "value_unit": "pts"},
    {"key": "ftse", "symbol": "^FTSE", "title": "FTSE", "region": "UK", "value_unit": "pts"},
    {"key": "gold", "symbol": "GC=F", "title": "Gold", "region": "Commodities", "value_unit": "pts"},
    {"key": "bitcoin", "symbol": "BTC-USD", "title": "Bitcoin", "region": "Crypto", "value_unit": "pts"},
]

# Short aliases for URLs (e.g. /market/nse)
MARKET_KEY_ALIASES = {
    "nse": "nifty",
    "nifty50": "nifty",
    "bse": "sensex",
    "spx": "sp500",
    "s&p500": "sp500",
    "btc": "bitcoin",
}


def resolve_market_key(raw: str) -> dict | None:
    """Resolve URL key or alias to a GLOBAL_MARKET_DEFS entry."""
    key = (raw or "").strip().lower()
    if not key:
        return None
    key = MARKET_KEY_ALIASES.get(key, key)
    for item in GLOBAL_MARKET_DEFS:
        if item["key"] == key:
            return dict(item)
    return None


def split_heatmap_movers(stocks: list[dict]) -> tuple[list[dict], list[dict]]:
    """Non-overlapping gainers (positive) and losers (negative) for heatmap UI."""
    gainers = sorted(
        [s for s in stocks if (s.get("change_pct") or 0) > 0],
        key=lambda x: x.get("change_pct") or 0,
        reverse=True,
    )[:8]
    losers = sorted(
        [s for s in stocks if (s.get("change_pct") or 0) < 0],
        key=lambda x: x.get("change_pct") or 0,
    )[:8]
    return gainers, losers
