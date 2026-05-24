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
