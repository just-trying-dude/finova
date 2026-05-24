"""Trading balance limits for paper trading."""

from __future__ import annotations

# Default buying power: ₹10 lakh
DEFAULT_BALANCE = 1_000_000.0
LEGACY_STARTING_BALANCE = 100_000.0

# Legacy unlimited accounts (upgrade to DEFAULT_BALANCE on read)
UNLIMITED_THRESHOLD = 1_000_000_000_000.0


def is_unlimited_balance(balance: object) -> bool:
    """Reserved — production uses finite DEFAULT_BALANCE."""
    return False


def normalize_stored_balance(balance: object) -> float:
    """Normalize DB balance; upgrade old ₹1L / unlimited accounts to ₹10L."""
    try:
        b = float(balance)
    except (TypeError, ValueError):
        return DEFAULT_BALANCE
    if b >= UNLIMITED_THRESHOLD or b == LEGACY_STARTING_BALANCE:
        return DEFAULT_BALANCE
    return b


def balance_api_fields(balance: object) -> dict:
    """Fields merged into portfolio/dashboard API responses."""
    try:
        amount = normalize_stored_balance(balance)
    except (TypeError, ValueError):
        amount = DEFAULT_BALANCE
    return {"balance": amount, "balance_unlimited": False}
