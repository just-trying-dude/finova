"""Trading balance limits — unlimited buying power for paper trading."""

from __future__ import annotations

# Stored in MongoDB (JSON-safe). Treat as unlimited for checks and display.
UNLIMITED_BALANCE = 9_999_999_999_999.0
LEGACY_STARTING_BALANCE = 100_000.0
UNLIMITED_THRESHOLD = 1_000_000_000_000.0  # >= 1T reads as unlimited


def is_unlimited_balance(balance: object) -> bool:
    try:
        return float(balance) >= UNLIMITED_THRESHOLD
    except (TypeError, ValueError):
        return False


def normalize_stored_balance(balance: object) -> float:
    """Upgrade legacy ₹1L starter accounts to unlimited."""
    try:
        b = float(balance)
    except (TypeError, ValueError):
        return UNLIMITED_BALANCE
    if b == LEGACY_STARTING_BALANCE or b >= UNLIMITED_THRESHOLD:
        return UNLIMITED_BALANCE
    return b


def balance_api_fields(balance: object) -> dict:
    """Fields merged into portfolio/dashboard API responses."""
    if is_unlimited_balance(balance):
        return {"balance": None, "balance_unlimited": True}
    try:
        return {"balance": float(balance), "balance_unlimited": False}
    except (TypeError, ValueError):
        return {"balance": 0.0, "balance_unlimited": False}
