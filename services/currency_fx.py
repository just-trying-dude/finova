"""
Portfolio base currency (INR) with USD↔INR conversion for mixed holdings.
Native prices stay on stock pages; dashboard totals and risk use INR.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

BASE_CURRENCY = "INR"
BASE_SYMBOL = "₹"
DEFAULT_USD_INR = float(os.getenv("USD_INR_RATE", "84.0"))

_rate_cache: dict[str, float] = {"rate": DEFAULT_USD_INR, "ts": 0.0}
_RATE_TTL_SEC = 3600


def native_currency_for_symbol(symbol: str) -> str:
    s = (symbol or "").upper().strip()
    if s.endswith(".NS") or s.endswith(".BO"):
        return "INR"
    return "USD"


def is_indian_symbol(symbol: str) -> bool:
    return native_currency_for_symbol(symbol) == "INR"


async def get_usd_inr_rate() -> float:
    """Cached USD/INR (1 USD = X INR). Falls back to env default."""
    now = time.time()
    if now - _rate_cache["ts"] < _RATE_TTL_SEC:
        return _rate_cache["rate"]

    rate = DEFAULT_USD_INR
    try:
        import yfinance as yf

        t = yf.Ticker("INR=X")
        hist = t.history(period="5d")
        if hist is not None and not hist.empty:
            last = float(hist["Close"].iloc[-1])
            if last > 1:
                rate = last
    except Exception as exc:
        logger.debug("FX fetch failed, using default USD/INR: %s", exc)

    _rate_cache["rate"] = rate
    _rate_cache["ts"] = now
    return rate


def to_inr(amount: float, currency: str, usd_inr: float) -> float:
    if not amount or amount <= 0:
        return 0.0
    c = (currency or BASE_CURRENCY).upper()
    if c == "INR":
        return float(amount)
    if c == "USD":
        return float(amount) * float(usd_inr)
    return float(amount)


def trade_cost_fields(symbol: str, price: float, quantity: int, usd_inr: float) -> dict[str, Any]:
    native = native_currency_for_symbol(symbol)
    native_total = float(price) * int(quantity)
    inr_total = to_inr(native_total, native, usd_inr)
    return {
        "native_currency": native,
        "native_price": round(float(price), 4),
        "native_total": round(native_total, 2),
        "base_currency": BASE_CURRENCY,
        "base_total": round(inr_total, 2),
        "fx_rate_usd_inr": round(usd_inr, 4) if native == "USD" else None,
    }


def base_currency_response() -> dict[str, str]:
    return {"base_currency": BASE_CURRENCY, "currency": BASE_CURRENCY, "currency_symbol": BASE_SYMBOL}
