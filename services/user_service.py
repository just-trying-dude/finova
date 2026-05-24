from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo.collection import Collection
from pymongo.errors import PyMongoError
from pymongo import ReturnDocument

from db import get_users_collection
from services.balance import UNLIMITED_BALANCE, is_unlimited_balance, normalize_stored_balance
from services.stock_service import normalize_symbol


def _flatten_portfolio(portfolio: object) -> dict[str, int]:
    """
    Backward-compatible portfolio reader.
    Accepts:
    - flat: {"TCS.NS": 2}
    - old nested: {"TCS": {"NS": 2}} or {"TCS": {"BO": 2}}
    Returns always-flat: {"TCS.NS": 2}
    """
    out: dict[str, int] = {}
    if not isinstance(portfolio, dict):
        return out

    for raw_symbol, raw_qty in portfolio.items():
        # Cleanup: remove any non-string keys.
        if not isinstance(raw_symbol, str):
            continue

        # Old nested shape: {"TCS": {"NS": 2}}
        if isinstance(raw_qty, dict):
            if len(raw_qty) != 1:
                continue
            k, v = next(iter(raw_qty.items()))
            suffix = str(k).strip().upper()
            if suffix not in {"NS", "BO"}:
                continue
            sym = f"{str(raw_symbol).strip().upper()}.{suffix}"
            try:
                qty = int(v)
            except Exception:
                continue
        else:
            sym = normalize_symbol(str(raw_symbol))
            try:
                qty = int(raw_qty)
            except Exception:
                continue

        sym = normalize_symbol(sym)
        # Cleanup: drop any non-positive quantities.
        if qty <= 0 or not sym:
            continue
        out[sym] = out.get(sym, 0) + qty

    return out


def get_user_flat(username: str, *, persist_migration: bool = True) -> dict:
    """
    Read user and ensure portfolio is flat dict of normalized symbols.
    Optionally persists migration back to DB if conversion was needed.
    """
    doc = get_user(username)
    portfolio_raw = doc.get("portfolio", {})
    portfolio_flat = _flatten_portfolio(portfolio_raw)

    # Detect if migration needed (non-dict, any nested dict values, non-string keys, or unnormalized keys).
    needs_migration = False
    if not isinstance(portfolio_raw, dict):
        needs_migration = True
    else:
        for k, v in portfolio_raw.items():
            if not isinstance(k, str):
                needs_migration = True
                break
            if isinstance(v, dict):
                needs_migration = True
                break
            if isinstance(k, str) and normalize_symbol(k) != k.strip().upper():
                needs_migration = True
                break

    if needs_migration:
        doc["portfolio"] = portfolio_flat
        if persist_migration:
            try:
                users_col().update_one({"username": username}, {"$set": {"portfolio": portfolio_flat}})
            except PyMongoError:
                # Don't block reads on migration persistence.
                pass
    else:
        doc["portfolio"] = portfolio_flat

    return doc


def trade_update(
    username: str,
    *,
    symbol: str,
    quantity: int,
    price: float,
    side: str,
) -> dict:
    """
    Single shared update function for BUY/SELL.
    Guarantees portfolio remains a flat dict with normalized symbol keys.
    Avoids Mongo dotted-field updates that create nested documents.
    """
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    if side not in {"buy", "sell"}:
        raise HTTPException(status_code=400, detail="Invalid trade side")

    # Always read + migrate to flat before applying deltas.
    user = get_user_flat(username, persist_migration=True)
    unlimited = is_unlimited_balance(user.get("balance"))
    portfolio = dict(user.get("portfolio") or {})

    prev_qty = int(portfolio.get(symbol, 0))
    delta = int(quantity) if side == "buy" else -int(quantity)
    new_qty = prev_qty + delta

    if new_qty > 0:
        portfolio[symbol] = new_qty
    else:
        portfolio.pop(symbol, None)

    amount = float(price) * float(quantity)
    balance_delta = -amount if side == "buy" else amount

    tx = {
        "type": side,
        "symbol": symbol,
        "quantity": int(quantity),
        "price": float(price),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    update: dict = {"$set": {"portfolio": portfolio}, "$push": {"transactions": tx}}
    if not unlimited:
        update["$inc"] = {"balance": balance_delta}

    try:
        updated = users_col().find_one_and_update(
            {"username": username},
            update,
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database error while updating user")

    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Final safety cleanup: ensure response portfolio is flat.
    updated["portfolio"] = _flatten_portfolio(updated.get("portfolio", {}))
    return updated


def users_col() -> Collection:
    try:
        return get_users_collection()
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database connection error")


def get_user(username: str) -> dict:
    doc = users_col().find_one({"username": username}, {"_id": 0})
    if doc is None:
        raise HTTPException(status_code=404, detail="User not found")
    bal = normalize_stored_balance(doc.get("balance"))
    if float(doc.get("balance", 0)) != bal:
        try:
            users_col().update_one({"username": username}, {"$set": {"balance": bal}})
        except PyMongoError:
            pass
        doc["balance"] = bal
    return doc


def create_user(username: str, hashed_password: str) -> None:
    col = users_col()
    existing = col.find_one({"username": username}, {"_id": 1})
    if existing is not None:
        raise HTTPException(status_code=400, detail="Username already exists")
    try:
        col.insert_one(
            {
                "username": username,
                "hashed_password": hashed_password,
                "balance": UNLIMITED_BALANCE,
                "portfolio": {},
                "watchlist": [],
                "transactions": [],
            }
        )
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database error while creating user")


def ensure_test_user(hashed_password: str) -> None:
    col = users_col()
    existing = col.find_one({"username": "test"}, {"_id": 1})
    if existing is None:
        try:
            col.insert_one(
                {
                    "username": "test",
                    "hashed_password": hashed_password,
                    "balance": UNLIMITED_BALANCE,
                    "portfolio": {},
                    "watchlist": [],
                    "transactions": [],
                }
            )
        except PyMongoError:
            return


def buy_update(username: str, symbol: str, quantity: int, price: float) -> dict:
    return trade_update(username, symbol=symbol, quantity=quantity, price=price, side="buy")


def sell_update(username: str, symbol: str, quantity: int, price: float) -> dict:
    return trade_update(username, symbol=symbol, quantity=quantity, price=price, side="sell")


def add_to_watchlist(username: str, symbol: str) -> dict:
    try:
        updated = users_col().find_one_and_update(
            {"username": username},
            {"$addToSet": {"watchlist": symbol}},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database error while updating watchlist")
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


def remove_from_watchlist(username: str, symbol: str) -> dict:
    try:
        updated = users_col().find_one_and_update(
            {"username": username},
            {"$pull": {"watchlist": symbol}},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database error while updating watchlist")
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return updated

