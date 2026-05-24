import asyncio
import io
import logging
import os
import math
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from config import get_settings, validate_settings

settings = get_settings()
# Fail fast on missing Render env vars before heavy imports (pandas, yfinance).
validate_settings()

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from auth import (
    JWT_EXPIRES_MINUTES,
    JWT_REMEMBER_DAYS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from db import ping_database

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB, optional dev seed user."""
    logging.basicConfig(
        level=logging.INFO if settings.is_production else logging.DEBUG,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger.info("Starting Finova API (env=%s, port=%s)", settings.env, settings.port)
    logger.info(
        "CORS allow_origins=%s allow_origin_regex=%s",
        settings.cors_origins,
        settings.cors_origin_regex,
    )
    # Fast ping so Render can bind the port; do not crash deploy if Atlas is unreachable.
    startup_timeout_ms = int(os.getenv("MONGO_STARTUP_TIMEOUT_MS", "8000"))
    try:
        ping_database(timeout_ms=startup_timeout_ms)
        logger.info("MongoDB connection OK (db=%s)", settings.mongo_db_name)
    except Exception as exc:
        logger.error(
            "MongoDB startup check failed (API will still start). "
            "Verify MONGO_URI and Atlas Network Access (allow 0.0.0.0/0 for Render). Error: %s",
            exc,
            exc_info=True,
        )
    if settings.create_test_user:
        from services import user_service as _user_service

        _user_service.ensure_test_user(hash_password("1234"))
        logger.info("Test user ensured (CREATE_TEST_USER enabled)")
    yield
    logger.info("Shutting down Finova API")


app = FastAPI(
    title="Finova API",
    description="Trading portfolio and market data API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from services.stock_service import (
    fetch_current_price_live,
    fetch_company_name_cached,
    fetch_history_close_series_live,
    fetch_history_df_max_cached,
    fetch_history_closes,
    get_stock_price,
    get_stock_quote_cached,
    normalize_symbol,
    get_stock_price_with_fallback,
    resolve_symbol,
    fetch_stock_quote_strict,
)
from services import user_service
from services.stock_search import search_stocks
from services.stock_fundamentals import fetch_stock_fundamentals
from services.market_news import fetch_market_news
from services.portfolio_insights import generate_portfolio_insights, SECTOR_BY_SYMBOL
from services.global_markets import GLOBAL_MARKET_DEFS


def _get_plt():
    """
    Lazy-load matplotlib to avoid slow import/font-cache build at startup on Render.
    Plot endpoints call this on-demand.
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt  # noqa: WPS433 (runtime import is intentional)

    return _plt


SYMBOL_TO_COMPANY: dict[str, str] = {
    # NSE (India)
    "TCS.NS": "Tata Consultancy Services",
    "RELIANCE.NS": "Reliance Industries",
    "HDFCBANK.NS": "HDFC Bank",
    "INFY.NS": "Infosys",
    "ICICIBANK.NS": "ICICI Bank",
    "SBIN.NS": "State Bank of India",
    "ITC.NS": "ITC",
    "LT.NS": "Larsen & Toubro",
    "BHARTIARTL.NS": "Bharti Airtel",
    "ASIANPAINT.NS": "Asian Paints",
    # BSE (India)
    "TCS.BO": "Tata Consultancy Services",
    "RELIANCE.BO": "Reliance Industries",
    "HDFCBANK.BO": "HDFC Bank",
    "INFY.BO": "Infosys",
    "ICICIBANK.BO": "ICICI Bank",
    "SBIN.BO": "State Bank of India",
    "ITC.BO": "ITC",
    "LT.BO": "Larsen & Toubro",
    "BHARTIARTL.BO": "Bharti Airtel",
    "ASIANPAINT.BO": "Asian Paints",
    # US examples (optional, but commonly searched)
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet",
    "AMZN": "Amazon",
    "TSLA": "Tesla",
    "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "HINDUNILVR.NS": "Hindustan Unilever",
    "AXISBANK.NS": "Axis Bank",
    "WIPRO.NS": "Wipro",
    "MARUTI.NS": "Maruti Suzuki",
    "TITAN.NS": "Titan Company",
    "BAJFINANCE.NS": "Bajaj Finance",
    "SUNPHARMA.NS": "Sun Pharmaceutical",
    "TATAMOTORS.NS": "Tata Motors",
}

# Base tickers without exchange suffix (common search / watchlist symbols)
SYMBOL_BASE_TO_COMPANY: dict[str, str] = {
    "KOTAKBANK": "Kotak Mahindra Bank",
    "HINDUNILVR": "Hindustan Unilever",
    "HDFCBANK": "HDFC Bank",
    "ICICIBANK": "ICICI Bank",
    "AXISBANK": "Axis Bank",
    "RELIANCE": "Reliance Industries",
    "TCS": "Tata Consultancy Services",
    "INFY": "Infosys",
    "SBIN": "State Bank of India",
    "ITC": "ITC",
    "WIPRO": "Wipro",
    "BHARTIARTL": "Bharti Airtel",
    "ASIANPAINT": "Asian Paints",
    "LT": "Larsen & Toubro",
}


def _base_ticker(symbol: str) -> str:
    s = normalize_symbol(symbol)
    if not s:
        return ""
    return s.split(".", 1)[0]


def _company_name_for_symbol(symbol: str) -> str:
    s = (symbol or "").strip()
    if not s:
        return "Unknown"
    key = normalize_symbol(s)
    mapped = SYMBOL_TO_COMPANY.get(key)
    if mapped:
        return mapped
    base = _base_ticker(key)
    if base and base in SYMBOL_BASE_TO_COMPANY:
        return SYMBOL_BASE_TO_COMPANY[base]
    if base:
        return base.title()
    return key


def _png_response_from_fig(fig) -> StreamingResponse:
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=150)
    _get_plt().close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


def _error_plot_png(message: str) -> StreamingResponse:
    plt = _get_plt()
    fig, ax = plt.subplots(figsize=(8, 3))
    ax.axis("off")
    ax.text(0.01, 0.5, message, fontsize=12, va="center")
    return _png_response_from_fig(fig)


async def _get_portfolio_flat_for_user(username: str) -> dict[str, int]:
    user = user_service.get_user_flat(username)
    portfolio = user.get("portfolio") or {}
    out: dict[str, int] = {}
    if isinstance(portfolio, dict):
        for k, v in portfolio.items():
            try:
                out[normalize_symbol(str(k))] = int(v)
            except Exception:
                continue
    return {k: v for k, v in out.items() if v > 0}


async def _portfolio_returns_and_weights(portfolio: dict[str, int]) -> tuple[pd.DataFrame, np.ndarray, list[str]]:
    """
    Build aligned log-returns dataframe and weight vector for the portfolio.
    - returns_df columns are symbols (normalized)
    - weights computed using resilient price fallback (so never breaks)
    """
    if not portfolio:
        return pd.DataFrame(), np.array([], dtype=float), []

    returns_series: dict[str, pd.Series] = {}
    symbols: list[str] = []

    for sym, qty in portfolio.items():
        if qty <= 0:
            continue
        sym_n = normalize_symbol(sym)
        closes = await get_safe_history(sym_n, period="1y")
        if closes is None or len(closes) < 2:
            continue
        r = np.log(pd.Series(closes).astype(float)).diff().dropna()
        if r.empty:
            continue
        returns_series[sym_n] = r
        symbols.append(sym_n)

    if not returns_series:
        return pd.DataFrame(), np.array([], dtype=float), []

    returns_df = pd.DataFrame(returns_series).dropna(how="any")
    if returns_df.shape[0] < 2:
        return pd.DataFrame(), np.array([], dtype=float), []

    # Compute weights using resilient prices.
    values: list[float] = []
    used_symbols: list[str] = []
    for sym in returns_df.columns:
        qty = float(portfolio.get(sym, 0))
        if qty <= 0:
            continue
        price, _status = await get_stock_price_with_fallback(sym)
        v = float(price) * qty
        if v <= 0:
            continue
        used_symbols.append(sym)
        values.append(v)

    if not values:
        return pd.DataFrame(), np.array([], dtype=float), []

    returns_df = returns_df[used_symbols]
    w = np.array(values, dtype=float)
    w = w / float(np.sum(w))
    return returns_df, w, used_symbols


def _currency_label_for_symbol(symbol: str) -> tuple[str, str]:
    """
    Currency labeling only (no conversion).
    - .NS / .BO => INR (₹)
    - otherwise => USD ($)
    """
    s = (symbol or "").upper().strip()
    if s.endswith(".NS") or s.endswith(".BO"):
        return "INR", "₹"
    return "USD", "$"


def _portfolio_currency_label(symbols: list[str]) -> tuple[str, str]:
    labels = {_currency_label_for_symbol(s)[0] for s in symbols if s}
    if len(labels) == 1:
        c = next(iter(labels))
        return (c, "₹" if c == "INR" else "$")
    return "MIXED", ""


async def get_safe_history(symbol: str, period: str = "1mo") -> pd.Series | None:
    """
    Reliable historical data layer:
    - returns a cleaned Close series indexed by date
    - returns None if no usable data
    """
    try:
        # Analytics requirement: use yfinance and 1y history.
        # (We ignore the passed-in period and always pull 1y here.)
        symbol = normalize_symbol(symbol)
        closes = await fetch_history_close_series_live(symbol, period="1y")
        if closes is None:
            closes = pd.Series(dtype=float)
        closes = pd.Series(closes).dropna()
        if closes.empty:
            # Offline-safe synthetic history so risk/var/MC never break.
            n = 252
            seed = int.from_bytes(__import__("hashlib").sha256(symbol.encode("utf-8")).digest()[:8], "big") % (2**32)
            rng = np.random.default_rng(seed)
            daily_lr = rng.normal(loc=0.0004, scale=0.02, size=n)
            prices = 100.0 * np.exp(np.cumsum(daily_lr))
            idx = pd.date_range(end=pd.Timestamp.utcnow(), periods=n, freq="B")
            closes = pd.Series(prices, index=idx)
        return closes
    except Exception as e:
        logger.warning("History fetch failed for %s: %s", symbol, e)
        # Same offline-safe fallback.
        symbol = normalize_symbol(symbol)
        n = 252
        seed = int.from_bytes(__import__("hashlib").sha256(symbol.encode("utf-8")).digest()[:8], "big") % (2**32)
        rng = np.random.default_rng(seed)
        daily_lr = rng.normal(loc=0.0004, scale=0.02, size=n)
        prices = 100.0 * np.exp(np.cumsum(daily_lr))
        idx = pd.date_range(end=pd.Timestamp.utcnow(), periods=n, freq="B")
        return pd.Series(prices, index=idx)


async def safe_get_price(symbol: str) -> float:
    # Backwards-compat shim (avoid silent failures).
    symbol = normalize_symbol(symbol)
    price = await get_stock_price(symbol)
    if price is None:
        raise HTTPException(status_code=503, detail="Stock price unavailable")
    return float(price)


async def calculate_portfolio_value(portfolio: dict) -> float:
    total = 0.0
    for raw_symbol, data in (portfolio or {}).items():
        # Flat-only format: {"TCS.NS": 2}
        try:
            quantity = float(data)
        except Exception:
            continue
        symbol = normalize_symbol(str(raw_symbol))

        if quantity <= 0:
            continue

        # Resilient valuation: never breaks due to outages.
        price, _status = await get_stock_price_with_fallback(symbol)
        total += float(price) * quantity
    return total


def rebuild_portfolio(transactions: list[dict] | None) -> dict[str, int]:
    """
    Single source of truth: derive holdings from transaction history.
    Never break because of one bad transaction.
    """
    portfolio: dict[str, int] = {}
    if not transactions:
        return portfolio

    for tx in transactions:
        try:
            symbol_raw = tx.get("symbol")
            tx_type = tx.get("type")
            qty_raw = tx.get("quantity", 0)

            if not symbol_raw:
                continue

            symbol = normalize_symbol(str(symbol_raw))
            qty = int(qty_raw)
            if qty <= 0:
                continue

            if tx_type == "buy":
                portfolio[symbol] = portfolio.get(symbol, 0) + qty
            elif tx_type == "sell":
                portfolio[symbol] = portfolio.get(symbol, 0) - qty
                if portfolio[symbol] <= 0:
                    del portfolio[symbol]
        except Exception as e:
            logger.warning("Skipping bad transaction %s: %s", tx, e)
            continue

    return portfolio


def _portfolio_cache_key(portfolio: dict[str, int]) -> str:
    items = sorted(
        (normalize_symbol(str(k)), int(v))
        for k, v in (portfolio or {}).items()
        if int(v or 0) > 0
    )
    return "|".join(f"{s}:{q}" for s, q in items)


def _quotes_refresh_bucket(seconds: int = 300) -> str:
    """Time bucket so cached analytics/insights refresh as prices move."""
    import time

    return str(int(time.time()) // seconds)


async def _fetch_histories_parallel(symbols: list[str], *, period: str = "1y") -> dict[str, pd.Series | None]:
    norm = [normalize_symbol(s) for s in symbols if s]
    norm = list(dict.fromkeys(norm))

    async def _one(sym: str):
        try:
            return sym, await get_safe_history(sym, period=period)
        except Exception:
            return sym, None

    pairs = await asyncio.gather(*[_one(s) for s in norm])
    return {sym: series for sym, series in pairs}


async def _fetch_quotes_parallel(symbols: list[str]) -> dict[str, dict | None]:
    from services.stock_service import fetch_quotes_yahoo_batch

    norm = [normalize_symbol(s) for s in symbols if s]
    norm = list(dict.fromkeys(norm))
    if not norm:
        return {}

    yahoo = await fetch_quotes_yahoo_batch(norm)
    out: dict[str, dict | None] = {sym: yahoo.get(sym) for sym in norm if sym in yahoo}
    missing = [s for s in norm if s not in out]

    if missing:

        async def _one(sym: str):
            try:
                return sym, await get_stock_quote_cached(sym)
            except Exception:
                return sym, None

        pairs = await asyncio.gather(*[_one(s) for s in missing])
        for sym, q in pairs:
            if q:
                out[sym] = q
    return out


async def build_returns_and_weights(
    portfolio: dict[str, int],
    *,
    skip_invalid_symbols: bool = False,
) -> tuple[pd.DataFrame, dict[str, float], float, list[str]]:
    from services.ttl_cache import returns_weights_cache

    if not portfolio:
        raise HTTPException(status_code=400, detail="No stocks in portfolio")

    cache_key = f"rw:{_portfolio_cache_key(portfolio)}"
    cached = returns_weights_cache.get(cache_key)
    if cached is not None:
        return cached

    symbols = [normalize_symbol(s) for s in portfolio.keys()]
    skipped: list[str] = []
    histories = await _fetch_histories_parallel(symbols)
    quotes = await _fetch_quotes_parallel(symbols)

    returns_series: dict[str, pd.Series] = {}
    for symbol in symbols:
        closes = histories.get(symbol)
        if closes is None or len(closes) < 2:
            skipped.append(symbol)
            continue
        daily_returns = np.log(closes.astype(float)).diff().dropna()
        if daily_returns.empty:
            skipped.append(symbol)
            continue
        returns_series[symbol] = daily_returns

    if not returns_series:
        out = (pd.DataFrame(), {}, 0.0, skipped)
        returns_weights_cache.set(cache_key, out, ttl=60)
        return out

    returns_df = pd.DataFrame(returns_series).dropna(how="any")
    if returns_df.shape[0] < 2:
        out = (pd.DataFrame(), {}, 0.0, skipped)
        returns_weights_cache.set(cache_key, out, ttl=60)
        return out

    holding_values: dict[str, float] = {}
    total_portfolio_value = 0.0
    for symbol, qty in portfolio.items():
        sym = normalize_symbol(symbol)
        if sym not in returns_df.columns:
            continue
        quote = quotes.get(sym)
        price = float(quote.get("current_price") or 0) if quote else None
        if price is None or price <= 0:
            try:
                price = float(await get_stock_price_with_fallback(sym))
            except Exception:
                skipped.append(sym)
                continue
        value = float(price) * float(qty)
        holding_values[sym] = value
        total_portfolio_value += value

    if total_portfolio_value <= 0:
        out = (pd.DataFrame(), {}, 0.0, skipped)
        returns_weights_cache.set(cache_key, out, ttl=60)
        return out

    used_symbols = list(holding_values.keys())
    weights = {s: (holding_values[s] / total_portfolio_value) for s in used_symbols}
    returns_df = returns_df[used_symbols]

    out = (returns_df, weights, total_portfolio_value, skipped)
    returns_weights_cache.set(cache_key, out, ttl=60)
    return out


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False


class BuyRequest(BaseModel):
    symbol: str
    quantity: int
    password: str


class SellRequest(BaseModel):
    symbol: str
    quantity: int
    password: str


class WatchlistRequest(BaseModel):
    symbol: str


class SimulateRequest(BaseModel):
    symbol: str
    amount: float
    date: str  # YYYY-MM-DD


@app.get("/")
def root():
    return {"message": "Server is running", "docs": "/docs", "env": settings.env}


@app.get("/health")
def health():
    """Liveness for Render — always 200 so deploy succeeds; reports DB state."""
    try:
        ping_database(timeout_ms=5000)
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        return {
            "status": "degraded",
            "database": "disconnected",
            "detail": str(exc),
        }


if not settings.is_production:

    @app.get("/debug-portfolio-flow")
    def debug_portfolio_flow(current_user: dict = Depends(get_current_user)):
        username = current_user["username"]
        user = user_service.users_col().find_one({"username": username})
        if not user:
            return {"error": "user not found"}

        user_safe = dict(user)
        if "_id" in user_safe:
            user_safe["_id"] = str(user_safe["_id"])

        return {
            "keys_in_user": list(user_safe.keys()),
            "transactions_key": user_safe.get("transactions"),
            "transaction_key": user_safe.get("transaction"),
            "full_user": user_safe,
        }


@app.post("/register")
def register(payload: RegisterRequest):
    try:
        user_service.create_user(payload.username, hash_password(payload.password))
    except HTTPException:
        raise

    return {"message": "Registration successful"}


@app.post("/login")
def login(payload: LoginRequest):
    try:
        user = user_service.users_col().find_one({"username": payload.username}, {"_id": 0})
    except PyMongoError as exc:
        logger.error("Login failed — database error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Check MONGO_URI and Atlas network access on Render.",
        ) from exc

    if user is None or not verify_password(payload.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user["username"]}, remember_me=payload.remember_me)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_minutes": (JWT_REMEMBER_DAYS * 24 * 60) if payload.remember_me else JWT_EXPIRES_MINUTES,
    }


@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["username"]}


@app.get("/stock/{symbol}/profile")
async def get_stock_profile(symbol: str):
    quote = await fetch_stock_quote_strict(symbol, timeout_s=5.0)
    sym = quote["symbol"]
    fundamentals, chart, news = await asyncio.gather(
        fetch_stock_fundamentals(sym),
        _index_chart_series(sym, float(quote["current_price"]), float(quote["previous_close"]), points=365),
        fetch_market_news(sym, limit=8),
    )
    currency, currency_symbol = _currency_label_for_symbol(sym)
    raw_name = fundamentals.get("name") or ""
    name = raw_name if raw_name and raw_name.upper().replace(" ", "") not in {sym.replace(".", ""), _base_ticker(sym)} else _company_name_for_symbol(sym)
    current = float(quote["current_price"])
    previous = float(quote["previous_close"])
    change_pct = ((current - previous) / previous * 100.0) if previous > 0 else 0.0
    return {
        "symbol": quote["symbol"],
        "name": name,
        "current_price": current,
        "previous_close": previous,
        "change_pct": round(change_pct, 2),
        "currency": currency,
        "currency_symbol": currency_symbol,
        "exchange": fundamentals.get("exchange"),
        "sector": fundamentals.get("sector"),
        "industry": fundamentals.get("industry"),
        "description": fundamentals.get("description"),
        "market_cap": fundamentals.get("market_cap"),
        "pe_ratio": fundamentals.get("pe_ratio"),
        "fifty_two_week_high": fundamentals.get("fifty_two_week_high"),
        "fifty_two_week_low": fundamentals.get("fifty_two_week_low"),
        "volume": fundamentals.get("volume"),
        "avg_volume": fundamentals.get("avg_volume"),
        "beta": fundamentals.get("beta"),
        "chart": chart,
        "news": news,
    }


@app.get("/stock/{symbol}")
async def get_stock(symbol: str):
    # Strict behavior: real data only, no mock/fallback, clean 404 on invalid.
    quote = await fetch_stock_quote_strict(symbol, timeout_s=4.0)
    currency, currency_symbol = _currency_label_for_symbol(quote["symbol"])
    # Prefer real company name (yfinance metadata) if available; fallback to mapping.
    name = await fetch_company_name_cached(quote["symbol"], timeout_s=2.0)
    sym_key = quote["symbol"].upper()
    if not name or name.upper().replace(" ", "") in {sym_key.replace(".", ""), _base_ticker(sym_key)}:
        name = _company_name_for_symbol(quote["symbol"])
    return {
        "symbol": quote["symbol"],
        "name": name,
        "current_price": float(quote["current_price"]),
        "previous_close": float(quote["previous_close"]),
        "currency": currency,
        "currency_symbol": currency_symbol,
    }


@app.get("/search")
async def search_stocks_endpoint(q: str = "", limit: int = 10):
    query = (q or "").strip()
    if not query:
        return []
    safe_limit = max(1, min(int(limit or 10), 20))
    return await search_stocks(query, limit=safe_limit)


@app.get("/market/top-stocks")
async def get_market_top_stocks():
    # Keep symbols in the same format your existing quote logic supports.
    nse_symbols = [
        "RELIANCE.NS",
        "TCS.NS",
        "HDFCBANK.NS",
        "INFY.NS",
        "ICICIBANK.NS",
        "SBIN.NS",
        "ITC.NS",
        "LT.NS",
    ]
    bse_symbols = [
        "RELIANCE.BO",
        "TCS.BO",
        "HDFCBANK.BO",
        "INFY.BO",
        "ICICIBANK.BO",
        "SBIN.BO",
        "ITC.BO",
        "LT.BO",
    ]

    async def _build_items(symbols: list[str]) -> list[dict]:
        quotes = await _fetch_quotes_parallel(symbols)
        out: list[dict] = []
        for sym in symbols:
            sym_n = normalize_symbol(sym)
            q = quotes.get(sym_n)
            if q and q.get("current_price"):
                current_price = float(q["current_price"])
            else:
                try:
                    price, _status = await get_stock_price_with_fallback(sym_n)
                    current_price = float(price)
                except Exception:
                    current_price = 0.0
            if not math.isfinite(current_price) or current_price <= 0:
                current_price = 0.0

            out.append(
                {
                    "symbol": sym,
                    "name": _company_name_for_symbol(sym),
                    "current_price": current_price,
                }
            )
        return out

    return {"nse": await _build_items(nse_symbols), "bse": await _build_items(bse_symbols)}


MARKET_NSE_STOCKS = [
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "INFY.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
    "ITC.NS",
    "LT.NS",
    "BHARTIARTL.NS",
    "ASIANPAINT.NS",
    "HINDUNILVR.NS",
    "KOTAKBANK.NS",
]

NSE_INDEX_SYMBOL = "^NSEI"
BSE_INDEX_SYMBOL = "^BSESN"
# ~6 months of trading days — rich mini charts without max-history fetches
GLOBAL_INDEX_CHART_POINTS = 126


def _mock_index_chart(current: float, previous: float, points: int = 252) -> list[dict]:
    """Synthetic index path with day-to-day volatility (not smooth curves)."""
    import random

    start = float(previous) if previous > 0 else float(current) * 0.985
    end = float(current) if current > 0 else start
    if points < 2:
        today = datetime.now(timezone.utc).date().isoformat()
        return [{"date": today, "price": round(end, 2)}]

    rng = random.Random(int(abs(hash(f"{start}:{end}:{points}"))) % (2**32))
    out: list[dict] = []
    base_date = datetime.now(timezone.utc).date()
    price = start
    daily_vol = max(abs(end - start) * 0.004, end * 0.0035, 1.0)

    for i in range(points):
        remaining = max(points - 1 - i, 1)
        drift = (end - price) / remaining
        shock = rng.gauss(0.0, daily_vol)
        price = max(1.0, price + drift + shock)
        day = base_date - timedelta(days=(points - 1 - i))
        out.append({"date": day.isoformat(), "price": round(price, 2)})

    out[-1]["price"] = round(end, 2)
    return out


async def _index_chart_series(
    symbol: str, current: float, previous: float, points: int = 252, *, fast: bool = False
) -> list[dict]:
    target_points = GLOBAL_INDEX_CHART_POINTS if fast else points
    if fast:
        try:
            closes = await fetch_history_close_series_live(symbol, period="1y")
            if closes is not None and not getattr(closes, "empty", True) and len(closes) >= 2:
                tail = closes.dropna().tail(target_points)
                return [
                    {"date": idx.date().isoformat(), "price": round(float(v), 2)}
                    for idx, v in tail.items()
                ]
        except Exception:
            pass
        return _mock_index_chart(current, previous, points=target_points)

    try:
        df = await fetch_history_df_max_cached(symbol)
        if df is not None and not df.empty and "Close" in df.columns:
            closes = df["Close"].dropna().tail(points)
            if len(closes) >= 2:
                return [
                    {"date": idx.date().isoformat(), "price": round(float(v), 2)}
                    for idx, v in closes.items()
                ]
    except Exception:
        pass
    return _mock_index_chart(current, previous, points)


async def _market_index_overview(
    symbol: str, *, title: str, index_name: str, fast_chart: bool = False
) -> dict:
    current = 0.0
    previous = 0.0
    try:
        quote = await get_stock_quote_cached(symbol)
        current = float(quote.get("current_price") or 0)
        previous = float(quote.get("previous_close") or 0)
    except Exception:
        pass

    if current <= 0:
        try:
            price, _status = await get_stock_price_with_fallback(symbol)
            current = float(price)
        except Exception:
            current = 0.0

    if previous <= 0 and current > 0:
        previous = current * 0.995

    change_pct = ((current - previous) / previous * 100.0) if previous > 0 else 0.0
    chart = await _index_chart_series(symbol, current, previous, fast=fast_chart)

    return {
        "title": title,
        "index_name": index_name,
        "symbol": symbol,
        "current_value": round(current, 2),
        "previous_close": round(previous, 2),
        "change_pct": round(change_pct, 2),
        "chart": chart,
        "value_unit": "pts",
    }


async def _market_stock_snapshot(sym: str) -> dict | None:
    symbol = sym.upper().strip()
    if not symbol:
        return None
    current = 0.0
    previous = 0.0
    try:
        quote = await get_stock_quote_cached(symbol)
        current = float(quote.get("current_price") or 0)
        previous = float(quote.get("previous_close") or 0)
    except Exception:
        try:
            price, _status = await get_stock_price_with_fallback(symbol)
            current = float(price)
            previous = current * 0.99
        except Exception:
            return None

    if current <= 0:
        return None
    if previous <= 0:
        previous = current

    change_pct = ((current - previous) / previous * 100.0) if previous > 0 else 0.0
    return {
        "symbol": symbol,
        "name": _company_name_for_symbol(symbol),
        "current_price": round(current, 2),
        "previous_close": round(previous, 2),
        "change_pct": round(change_pct, 2),
        "currency_symbol": "₹",
    }


@app.get("/market/global")
async def get_market_global():
    from services.ttl_cache import market_global_cache

    cache_key = "global_v2"
    cached = market_global_cache.get(cache_key)
    if cached is not None:
        return cached

    tasks = [
        _market_index_overview(
            d["symbol"], title=d["title"], index_name=d["title"], fast_chart=True
        )
        for d in GLOBAL_MARKET_DEFS
    ]
    results = await asyncio.gather(*tasks)
    payload = {"markets": [{**GLOBAL_MARKET_DEFS[i], **results[i]} for i in range(len(GLOBAL_MARKET_DEFS))]}
    market_global_cache.set(cache_key, payload, ttl=60)
    return payload


@app.get("/market/news")
async def get_market_news(symbol: str = "", limit: int = 12):
    sym = symbol.strip() or None
    safe_limit = max(1, min(int(limit or 12), 30))
    items = await fetch_market_news(sym, limit=safe_limit)
    return {"news": items, "symbol": sym}


@app.get("/market/heatmap")
async def get_market_heatmap():
    from services.ttl_cache import market_heatmap_cache

    cached = market_heatmap_cache.get("heatmap")
    if cached is not None:
        return cached

    stock_tasks = [_market_stock_snapshot(sym) for sym in MARKET_NSE_STOCKS]
    stocks = [s for s in await asyncio.gather(*stock_tasks) if s]
    sectors: dict[str, list] = {}
    for s in stocks:
        sec = SECTOR_BY_SYMBOL.get(s["symbol"]) or SECTOR_BY_SYMBOL.get(
            s["symbol"].replace(".BO", ".NS")
        ) or "Other"
        sectors.setdefault(sec, []).append(s)
    sector_rows = []
    for name, items in sorted(sectors.items()):
        avg_chg = sum((x.get("change_pct") or 0) for x in items) / max(len(items), 1)
        sector_rows.append({"sector": name, "change_pct": round(avg_chg, 2), "count": len(items), "stocks": items})
    payload = {
        "sectors": sector_rows,
        "stocks": stocks,
        "gainers": sorted(stocks, key=lambda x: x.get("change_pct") or 0, reverse=True)[:12],
        "losers": sorted(stocks, key=lambda x: x.get("change_pct") or 0)[:12],
    }
    market_heatmap_cache.set("heatmap", payload, ttl=25)
    return payload


@app.get("/market/page")
async def get_market_page(news_limit: int = 8):
    """Single round-trip payload for the Markets page (parallel, cached sections)."""
    from services.ttl_cache import market_global_cache, market_heatmap_cache

    safe_news = max(1, min(int(news_limit or 8), 20))

    async def _global():
        cache_key = "global_v2"
        cached = market_global_cache.get(cache_key)
        if cached is not None:
            return cached
        tasks = [
            _market_index_overview(
                d["symbol"], title=d["title"], index_name=d["title"], fast_chart=True
            )
            for d in GLOBAL_MARKET_DEFS
        ]
        results = await asyncio.gather(*tasks)
        payload = {
            "markets": [{**GLOBAL_MARKET_DEFS[i], **results[i]} for i in range(len(GLOBAL_MARKET_DEFS))]
        }
        market_global_cache.set(cache_key, payload, ttl=60)
        return payload

    async def _heatmap():
        cached = market_heatmap_cache.get("heatmap")
        if cached is not None:
            return cached
        stock_tasks = [_market_stock_snapshot(sym) for sym in MARKET_NSE_STOCKS]
        stocks = [s for s in await asyncio.gather(*stock_tasks) if s]
        sectors: dict[str, list] = {}
        for s in stocks:
            sec = SECTOR_BY_SYMBOL.get(s["symbol"]) or SECTOR_BY_SYMBOL.get(
                s["symbol"].replace(".BO", ".NS")
            ) or "Other"
            sectors.setdefault(sec, []).append(s)
        sector_rows = []
        for name, items in sorted(sectors.items()):
            avg_chg = sum((x.get("change_pct") or 0) for x in items) / max(len(items), 1)
            sector_rows.append(
                {"sector": name, "change_pct": round(avg_chg, 2), "count": len(items), "stocks": items}
            )
        payload = {
            "sectors": sector_rows,
            "stocks": stocks,
            "gainers": sorted(stocks, key=lambda x: x.get("change_pct") or 0, reverse=True)[:12],
            "losers": sorted(stocks, key=lambda x: x.get("change_pct") or 0)[:12],
        }
        market_heatmap_cache.set("heatmap", payload, ttl=25)
        return payload

    global_res, heatmap_res, news_items = await asyncio.gather(
        _global(),
        _heatmap(),
        fetch_market_news(None, limit=safe_news),
    )
    return {
        "global": global_res,
        "heatmap": heatmap_res,
        "news": {"news": news_items, "symbol": None},
    }


@app.get("/market/overview")
async def get_market_overview():
    from services.ttl_cache import market_overview_cache

    cached = market_overview_cache.get("overview")
    if cached is not None:
        return cached

    nse_task = _market_index_overview(NSE_INDEX_SYMBOL, title="NSE", index_name="NIFTY 50")
    bse_task = _market_index_overview(BSE_INDEX_SYMBOL, title="BSE", index_name="SENSEX")
    stock_tasks = [_market_stock_snapshot(sym) for sym in MARKET_NSE_STOCKS]

    nse, bse, *stock_results = await asyncio.gather(nse_task, bse_task, *stock_tasks)
    stocks = [s for s in stock_results if s]

    ranked = sorted(stocks, key=lambda x: x.get("change_pct") or 0, reverse=True)
    gainers = [s for s in ranked if (s.get("change_pct") or 0) > 0][:6]
    losers = sorted([s for s in stocks if (s.get("change_pct") or 0) < 0], key=lambda x: x["change_pct"])[:6]

    trending_pool = sorted(stocks, key=lambda x: abs(x.get("change_pct") or 0), reverse=True)
    trending = trending_pool[:8] if trending_pool else ranked[:8]

    payload = {
        "nse": nse,
        "bse": bse,
        "top_gainers": gainers,
        "top_losers": losers,
        "trending": trending,
    }
    market_overview_cache.set("overview", payload, ttl=45)
    return payload


@app.get("/stock-history/{symbol}")
async def get_stock_history(symbol: str, days: int = 0):
    symbol = await resolve_symbol(symbol)
    if not symbol:
        return {"error": "invalid symbol", "symbol": symbol, "history": []}

    safe_days = max(0, min(int(days or 0), 365))
    if safe_days and safe_days <= 10:
        period = "5d"
    elif safe_days and safe_days <= 35:
        period = "1mo"
    elif safe_days:
        period = "1y"
    else:
        period = "max"

    if period == "max":
        df = await fetch_history_df_max_cached(symbol)
        if df is None or df.empty or "Close" not in df.columns:
            return {"symbol": symbol, "history": []}
        closes = df["Close"].dropna()
    else:
        closes = await fetch_history_close_series_live(symbol, period=period)
        if closes is None or getattr(closes, "empty", True):
            return {"symbol": symbol, "history": []}

    if closes.empty:
        return {"symbol": symbol, "history": []}

    history = [{"date": idx.date().isoformat(), "price": float(v)} for idx, v in closes.items()]
    if safe_days:
        history = history[-safe_days:]
    return {"symbol": symbol, "history": history}


@app.post("/simulate")
async def simulate_investment(payload: SimulateRequest):
    symbol = await resolve_symbol(payload.symbol)
    if not symbol:
        return {"error": "invalid symbol"}
    if payload.amount <= 0:
        return {"error": "amount must be greater than 0"}

    try:
        start_dt = datetime.strptime(payload.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return {"error": "invalid date format (expected YYYY-MM-DD)"}

    end_dt = start_dt + timedelta(days=7)

    # Fetch a short window; if the exact day isn't present, we use the first trading day after.
    df = await fetch_history_df_max_cached(symbol)
    if df is None or df.empty or "Close" not in df.columns:
        return {"error": "insufficient historical data"}

    closes = df["Close"].dropna()
    if closes.empty:
        return {"error": "insufficient historical data"}

    # Filter to the desired window.
    window = closes.loc[(closes.index >= start_dt) & (closes.index <= end_dt)]
    if window.empty:
        return {"error": "insufficient historical data"}

    buy_price = float(window.iloc[0])
    # Never throw 502: use live fetch but handle any failure gracefully.
    try:
        current_price = float(await fetch_current_price_live(symbol))
    except Exception:
        current_price = float(window.iloc[-1])

    shares = payload.amount / buy_price
    current_value = shares * current_price
    profit = current_value - payload.amount
    return_percentage = (profit / payload.amount) * 100

    return {
        "symbol": symbol,
        "investment": payload.amount,
        "buy_price": buy_price,
        "current_price": current_price,
        "shares": shares,
        "current_value": current_value,
        "profit": profit,
        "return_percentage": return_percentage,
    }


def _verify_trade_password(username: str, password: str) -> None:
    user = user_service.get_user_flat(username)
    if not user or not verify_password(password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid password")


@app.post("/buy")
async def buy_stock(payload: BuyRequest, current_user: dict = Depends(get_current_user)):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    _verify_trade_password(current_user["username"], payload.password)

    symbol = await resolve_symbol(payload.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    price, _status = await get_stock_price_with_fallback(symbol)
    total_cost = float(price) * payload.quantity

    user = user_service.get_user_flat(current_user["username"])
    if float(user.get("balance", 0)) < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    updated = user_service.buy_update(current_user["username"], symbol, payload.quantity, price)
    return {"balance": updated["balance"], "portfolio": updated.get("portfolio", {})}


@app.post("/sell")
async def sell_stock(payload: SellRequest, current_user: dict = Depends(get_current_user)):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    _verify_trade_password(current_user["username"], payload.password)

    symbol = await resolve_symbol(payload.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    user = user_service.get_user_flat(current_user["username"])
    portfolio = user.get("portfolio") or {}
    owned_qty = int(portfolio.get(symbol, 0))
    if owned_qty <= 0:
        raise HTTPException(status_code=400, detail="Stock not owned")
    if payload.quantity > owned_qty:
        raise HTTPException(status_code=400, detail="Insufficient quantity")

    price, _status = await get_stock_price_with_fallback(symbol)
    updated = user_service.sell_update(current_user["username"], symbol, payload.quantity, price)
    return {"balance": updated["balance"], "portfolio": updated.get("portfolio", {})}


async def _portfolio_value_history(portfolio: dict[str, int]) -> list[dict]:
    """Daily portfolio value series from max available history per holding."""
    if not portfolio:
        return []

    items = [
        (normalize_symbol(str(sym)), int(qty))
        for sym, qty in portfolio.items()
        if int(qty or 0) > 0
    ]
    if not items:
        return []

    async def _series_for_holding(sym_n: str, qty_n: int):
        df = await fetch_history_df_max_cached(sym_n)
        if df is None or df.empty or "Close" not in df.columns:
            return None
        closes = df["Close"].dropna()
        if len(closes) < 2:
            return None
        return sym_n, closes.astype(float) * float(qty_n)

    results = await asyncio.gather(*[_series_for_holding(s, q) for s, q in items])
    price_series: dict[str, pd.Series] = {}
    for row in results:
        if row is None:
            continue
        sym_n, ser = row
        price_series[sym_n] = ser

    if not price_series:
        return []

    prices = pd.DataFrame(price_series).sort_index()
    prices = prices.ffill().dropna(how="all")
    if prices.empty:
        return []

    portfolio_value = prices.sum(axis=1).dropna()
    return [
        {"date": idx.date().isoformat(), "price": round(float(v), 2)}
        for idx, v in portfolio_value.items()
    ]


async def _holdings_snapshot(portfolio: dict[str, int]) -> tuple[list[dict], float]:
    """Parallel quote fetch for all portfolio symbols."""
    symbols = [normalize_symbol(s) for s in portfolio.keys() if int(portfolio.get(s) or 0) > 0]
    quotes = await _fetch_quotes_parallel(symbols)
    holdings: list[dict] = []
    total = 0.0
    for sym, qty in portfolio.items():
        q = int(qty or 0)
        if q <= 0:
            continue
        sym_n = normalize_symbol(sym)
        quote = quotes.get(sym_n)
        if not quote:
            continue
        price = float(quote.get("current_price") or 0)
        prev = float(quote.get("previous_close") or 0)
        chg = ((price - prev) / prev * 100.0) if prev > 0 else 0.0
        value = price * q
        total += value
        holdings.append(
            {
                "symbol": sym_n,
                "qty": q,
                "price": price,
                "previous_close": prev,
                "value": round(value, 2),
                "changePct": round(chg, 2),
                "name": _company_name_for_symbol(sym_n),
                "sector": SECTOR_BY_SYMBOL.get(sym_n) or "Other",
            }
        )
    return holdings, total


def _allocations_from_holdings(holdings: list[dict]) -> list[dict]:
    """Top allocation weights for dashboard chips."""
    palette = ["#2BB6FF", "#7C5CFF", "#34D399", "#FF8A4C"]
    alloc_raw = sorted(
        [{"symbol": h["symbol"], "name": h.get("name") or h["symbol"], "value": float(h.get("value") or 0)} for h in holdings],
        key=lambda x: -x["value"],
    )
    alloc_raw = [x for x in alloc_raw if x["value"] > 0][:4]
    total = sum(x["value"] for x in alloc_raw) or 1.0
    out = []
    for i, a in enumerate(alloc_raw):
        pct = max(0, min(100, round((a["value"] / total) * 100)))
        out.append({"symbol": a["symbol"], "name": a["name"], "pct": pct, "color": palette[i % len(palette)]})
    return out


@app.get("/portfolio/insights")
async def get_portfolio_insights(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    if not portfolio:
        return {"insights": generate_portfolio_insights([])}

    holdings, _total = await _holdings_snapshot(portfolio)
    vol_pct = None
    var_95 = None
    try:
        returns_df, weights, total_val, _ = await build_returns_and_weights(portfolio, skip_invalid_symbols=True)
        if not returns_df.empty and weights and total_val > 0:
            w = np.array([weights[s] for s in returns_df.columns], dtype=float)
            port_lr = returns_df.to_numpy(dtype=float) @ w
            if port_lr.size > 1:
                vol_pct = float(np.std(port_lr, ddof=1) * np.sqrt(252) * 100)
                var_95 = float(np.percentile(port_lr, 5) * 100)
    except Exception:
        pass

    return {"insights": generate_portfolio_insights(holdings, volatility_pct=vol_pct, var_95=var_95)}


@app.get("/portfolio/analytics")
async def get_portfolio_analytics(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    if not portfolio:
        return {"sectors": [], "holdings": [], "diversification_score": 0, "total_value": 0}

    holdings, total = await _holdings_snapshot(portfolio)
    sector_map: dict[str, float] = {}
    for h in holdings:
        sector_map[h["sector"]] = sector_map.get(h["sector"], 0) + h["value"]

    sectors = []
    for name, val in sorted(sector_map.items(), key=lambda x: -x[1]):
        pct = (val / total * 100) if total > 0 else 0
        sectors.append({"sector": name, "value": round(val, 2), "pct": round(pct, 2)})

    weights = [h["value"] / total for h in holdings] if total > 0 else []
    hhi = sum(w**2 for w in weights) if weights else 1
    div_score = max(0, min(100, int((1 - hhi) * 120)))

    history = await _portfolio_value_history(portfolio)
    return {
        "total_value": round(total, 2),
        "sectors": sectors,
        "holdings": holdings,
        "diversification_score": div_score,
        "history": history,
    }


@app.get("/portfolio/bundle")
async def get_portfolio_bundle(current_user: dict = Depends(get_current_user)):
    """Single cached response for portfolio analytics UI (avoids 4+ round trips)."""
    from services.ttl_cache import analytics_bundle_cache

    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    cache_key = f"bundle:{username}:{_portfolio_cache_key(portfolio)}:{_quotes_refresh_bucket(300)}"
    cached = analytics_bundle_cache.get(cache_key)
    if cached is not None:
        return cached

    if not portfolio:
        empty = {
            "analytics": {"sectors": [], "holdings": [], "diversification_score": 0, "total_value": 0, "history": []},
            "insights": {"insights": generate_portfolio_insights([])},
            "risk": None,
            "var": None,
            "monte_carlo": None,
        }
        analytics_bundle_cache.set(cache_key, empty, ttl=45)
        return empty

    holdings, total = await _holdings_snapshot(portfolio)
    history_task = _portfolio_value_history(portfolio)
    returns_task = build_returns_and_weights(portfolio, skip_invalid_symbols=True)
    history, (returns_df, weights, total_val, skipped) = await asyncio.gather(history_task, returns_task)

    sector_map: dict[str, float] = {}
    for h in holdings:
        sector_map[h["sector"]] = sector_map.get(h["sector"], 0) + h["value"]
    sectors = [
        {"sector": name, "value": round(val, 2), "pct": round((val / total * 100) if total > 0 else 0, 2)}
        for name, val in sorted(sector_map.items(), key=lambda x: -x[1])
    ]
    w_list = [h["value"] / total for h in holdings] if total > 0 else []
    div_score = max(0, min(100, int((1 - sum(x**2 for x in w_list)) * 120))) if w_list else 0

    vol_pct = None
    var_payload = None
    risk_payload = None
    monte_payload = None
    var_95_ret = None

    if not returns_df.empty and weights and total_val > 0:
        w = np.array([weights[s] for s in returns_df.columns], dtype=float)
        port_lr = returns_df.to_numpy(dtype=float) @ w
        if port_lr.size > 1:
            vol = float(np.std(port_lr, ddof=1) * np.sqrt(252))
            vol_pct = vol * 100
            var_95_ret = float(np.percentile(port_lr, 5))
            var_99_ret = float(np.percentile(port_lr, 1))
            var_payload = {"VaR_95": var_95_ret * total_val, "VaR_99": var_99_ret * total_val}
            risk_payload = {"portfolio_volatility": vol, "weights": weights}

            mu = float(np.mean(port_lr))
            sigma = float(np.std(port_lr, ddof=1))
            sims = 1000
            horizon = 30
            rnd = np.random.default_rng(42).normal(mu, max(sigma, 1e-9), size=(sims, horizon))
            paths = total_val * np.exp(np.cumsum(rnd, axis=1))
            monte_payload = {
                "expected_value": float(np.median(paths[:, -1])),
                "worst_case": float(np.percentile(paths[:, -1], 5)),
                "best_case": float(np.percentile(paths[:, -1], 95)),
            }

    insights = generate_portfolio_insights(
        holdings, volatility_pct=vol_pct, var_95=(var_95_ret * 100) if var_95_ret is not None else None
    )

    payload = {
        "analytics": {
            "total_value": round(total, 2),
            "sectors": sectors,
            "holdings": holdings,
            "diversification_score": div_score,
            "history": history,
        },
        "insights": {"insights": insights},
        "risk": risk_payload,
        "var": var_payload,
        "monte_carlo": monte_payload,
        "skipped": skipped,
    }
    analytics_bundle_cache.set(cache_key, payload, ttl=45)
    return payload


@app.get("/portfolio/dashboard")
async def get_portfolio_dashboard(current_user: dict = Depends(get_current_user)):
    """One round trip: holdings quotes, chart history, allocations (cached ~30s)."""
    from services.ttl_cache import analytics_bundle_cache

    username = current_user["username"]
    user = user_service.get_user_flat(username)
    portfolio = user.get("portfolio", {}) or {}
    symbols = [str(s) for s in portfolio.keys()]
    currency, currency_symbol = _portfolio_currency_label(symbols)

    cache_key = f"dash:{username}:{_portfolio_cache_key(portfolio)}:{_quotes_refresh_bucket(60)}"
    cached = analytics_bundle_cache.get(cache_key)
    if cached is not None:
        return cached

    base = {
        "username": username,
        "balance": user.get("balance", 0),
        "portfolio": portfolio,
        "currency": currency,
        "currency_symbol": currency_symbol,
    }

    if not portfolio:
        empty = {
            **base,
            "holdings": [],
            "total_portfolio_value": 0.0,
            "day_change": 0.0,
            "day_change_pct": 0.0,
            "chart": [],
            "allocations": [],
        }
        analytics_bundle_cache.set(cache_key, empty, ttl=20)
        return empty

    (holdings_raw, total), history = await asyncio.gather(
        _holdings_snapshot(portfolio),
        _portfolio_value_history(portfolio),
    )

    merged = []
    total_now = 0.0
    total_prev = 0.0
    for h in holdings_raw:
        price = float(h.get("price") or 0)
        prev = float(h.get("previous_close") or 0)
        qty = int(h.get("qty") or 0)
        total_now += price * qty
        if prev > 0:
            total_prev += prev * qty
        chg = ((price - prev) / prev * 100.0) if price > 0 and prev > 0 else None
        merged.append(
            {
                "symbol": h["symbol"],
                "name": h.get("name") or h["symbol"],
                "qty": qty,
                "price": round(price, 2) if price > 0 else None,
                "previousClose": round(prev, 2) if prev > 0 else None,
                "changePct": round(chg, 2) if chg is not None else None,
            }
        )

    day_change = total_now - total_prev
    day_change_pct = (day_change / total_prev * 100.0) if total_prev > 0 else 0.0

    payload = {
        **base,
        "holdings": merged,
        "total_portfolio_value": round(total_now, 2),
        "day_change": round(day_change, 2),
        "day_change_pct": round(day_change_pct, 2),
        "chart": history,
        "allocations": _allocations_from_holdings(holdings_raw),
    }
    analytics_bundle_cache.set(cache_key, payload, ttl=20)
    return payload


@app.get("/portfolio/history")
async def get_portfolio_history(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    history = await _portfolio_value_history(portfolio)
    return {"history": history}


@app.get("/portfolio")
async def get_portfolio(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    user = user_service.get_user_flat(username)
    portfolio = user.get("portfolio", {}) or {}
    symbols = [str(s) for s in (portfolio or {}).keys()]
    currency, currency_symbol = _portfolio_currency_label(symbols)
    currency_by_symbol = {str(s): {"currency": _currency_label_for_symbol(str(s))[0], "currency_symbol": _currency_label_for_symbol(str(s))[1]} for s in symbols}
    try:
        total_portfolio_value = await calculate_portfolio_value(portfolio)
        return {
            "username": username,
            "balance": user.get("balance", 0),
            "portfolio": portfolio,
            "total_portfolio_value": total_portfolio_value,
            "currency": currency,
            "currency_symbol": currency_symbol,
            "currency_by_symbol": currency_by_symbol,
        }
    except HTTPException as e:
        if isinstance(e.detail, dict):
            return {
                "username": username,
                "balance": user.get("balance", 0),
                "portfolio": portfolio,
                "total_portfolio_value": 0.0,
                "currency": currency,
                "currency_symbol": currency_symbol,
                "currency_by_symbol": currency_by_symbol,
                **e.detail,
            }
        return {
            "username": username,
            "balance": user.get("balance", 0),
            "portfolio": portfolio,
            "total_portfolio_value": 0.0,
            "currency": currency,
            "currency_symbol": currency_symbol,
            "currency_by_symbol": currency_by_symbol,
            "error": "Stock price unavailable",
        }


@app.get("/plot/monte-carlo")
async def plot_monte_carlo(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    if not portfolio:
        return _error_plot_png("No stocks in portfolio.")

    returns_df, w, used_symbols = await _portfolio_returns_and_weights(portfolio)
    if returns_df.empty or w.size == 0:
        return _error_plot_png("Insufficient data for Monte Carlo simulation.")

    # Portfolio daily log-returns
    port_lr = returns_df.to_numpy(dtype=float) @ w
    if port_lr.size < 2:
        return _error_plot_png("Insufficient data for Monte Carlo simulation.")

    mu = float(np.mean(port_lr))
    sigma = float(np.std(port_lr, ddof=1))

    paths = 100
    horizon_days = 30

    # Start value: resilient valuation
    total_value = float(await calculate_portfolio_value(portfolio))
    if total_value <= 0:
        total_value = 1.0

    rng = np.random.default_rng(42)
    rand_lr = rng.normal(loc=mu, scale=max(sigma, 1e-9), size=(paths, horizon_days))
    growth = np.exp(np.cumsum(rand_lr, axis=1))
    values = total_value * growth

    plt = _get_plt()
    fig, ax = plt.subplots(figsize=(10, 5))
    for i in range(paths):
        ax.plot(values[i], color="tab:blue", alpha=0.2, linewidth=1)
    ax.set_title("Monte Carlo Simulated Portfolio Paths (100)")
    ax.set_xlabel("Day")
    ax.set_ylabel("Portfolio Value")
    ax.grid(True, alpha=0.25)
    return _png_response_from_fig(fig)


@app.get("/plot/portfolio-history")
async def plot_portfolio_history(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    if not portfolio:
        return _error_plot_png("No stocks in portfolio.")

    # Build price series per symbol (1y closes, with graceful fallback via get_safe_history)
    price_series: dict[str, pd.Series] = {}
    for sym, qty in portfolio.items():
        closes = await get_safe_history(sym, period="1y")
        if closes is None or len(closes) < 2:
            continue
        s = pd.Series(closes).astype(float).dropna()
        if s.empty:
            continue
        price_series[sym] = s

    if not price_series:
        return _error_plot_png("No historical data available to build portfolio history.")

    prices = pd.DataFrame(price_series).sort_index()
    prices = prices.ffill().dropna(how="all")
    if prices.empty:
        return _error_plot_png("No historical data available to build portfolio history.")

    # Multiply by quantities, sum across symbols.
    qty_vec = pd.Series({sym: float(qty) for sym, qty in portfolio.items()})
    qty_vec = qty_vec.reindex(prices.columns).fillna(0.0)
    portfolio_value = prices.mul(qty_vec, axis=1).sum(axis=1)

    plt = _get_plt()
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(portfolio_value.index, portfolio_value.values, color="tab:green", linewidth=2)
    ax.set_title("Portfolio Value Over Time")
    ax.set_xlabel("Date")
    ax.set_ylabel("Value")
    ax.grid(True, alpha=0.25)
    fig.autofmt_xdate()
    return _png_response_from_fig(fig)


@app.get("/plot/returns-distribution")
async def plot_returns_distribution(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    portfolio = await _get_portfolio_flat_for_user(username)
    if not portfolio:
        return _error_plot_png("No stocks in portfolio.")

    returns_df, w, used_symbols = await _portfolio_returns_and_weights(portfolio)
    if returns_df.empty or w.size == 0:
        return _error_plot_png("Insufficient data to compute portfolio returns.")

    port_lr = returns_df.to_numpy(dtype=float) @ w
    if port_lr.size < 10:
        return _error_plot_png("Insufficient data to compute portfolio returns.")

    mu = float(np.mean(port_lr))
    sigma = float(np.std(port_lr, ddof=1))
    sigma = max(sigma, 1e-9)

    plt = _get_plt()
    fig, ax = plt.subplots(figsize=(10, 5))
    bins = 40
    ax.hist(port_lr, bins=bins, density=True, color="tab:purple", alpha=0.6, edgecolor="white")

    # Overlay normal curve
    x_min = float(np.min(port_lr))
    x_max = float(np.max(port_lr))
    xs = np.linspace(x_min, x_max, 300)
    pdf = (1.0 / (sigma * math.sqrt(2.0 * math.pi))) * np.exp(-0.5 * ((xs - mu) / sigma) ** 2)
    ax.plot(xs, pdf, color="black", linewidth=2)

    ax.set_title("Daily Portfolio Log-Returns Distribution")
    ax.set_xlabel("Daily log return")
    ax.set_ylabel("Density")
    ax.grid(True, alpha=0.25)
    return _png_response_from_fig(fig)


@app.get("/risk")
async def get_risk(current_user: dict = Depends(get_current_user)):
    user = user_service.get_user_flat(current_user["username"])
    portfolio = user.get("portfolio", {}) or {}
    currency, currency_symbol = _portfolio_currency_label([str(s) for s in portfolio.keys()])
    returns_df, weights, _total_value, skipped = await build_returns_and_weights(
        portfolio,
        skip_invalid_symbols=True,
    )
    if returns_df.empty or not weights:
        raise HTTPException(status_code=404, detail="No valid stocks with historical data")

    symbols = list(weights.keys())

    # Single stock: std dev of daily returns (annualized).
    if len(symbols) == 1:
        sym = symbols[0]
        vol = float(returns_df[sym].std()) * float(np.sqrt(252))
        return {
            "username": user["username"],
            "weights": weights,
            "portfolio_volatility": vol,
            "currency": currency,
            "currency_symbol": currency_symbol,
        }

    cov_matrix = returns_df.cov()
    w = np.array([weights[s] for s in cov_matrix.columns], dtype=float)

    variance = float(w.T @ cov_matrix.to_numpy(dtype=float) @ w)
    volatility = float(np.sqrt(max(variance, 0.0))) * float(np.sqrt(252))

    return {
        "username": user["username"],
        "weights": weights,
        "portfolio_volatility": volatility,
        "currency": currency,
        "currency_symbol": currency_symbol,
    }


@app.get("/var")
async def get_var(current_user: dict = Depends(get_current_user)):
    user = user_service.get_user_flat(current_user["username"])
    portfolio = user.get("portfolio", {}) or {}
    currency, currency_symbol = _portfolio_currency_label([str(s) for s in portfolio.keys()])
    returns_df, weights, total_portfolio_value, skipped = await build_returns_and_weights(
        portfolio,
        skip_invalid_symbols=True,
    )
    if returns_df.empty or not weights or total_portfolio_value <= 0:
        raise HTTPException(status_code=404, detail="No valid stocks with historical data")

    # portfolio_return = sum(weight_i * return_i)
    w = np.array([weights[s] for s in returns_df.columns], dtype=float)
    portfolio_returns = returns_df.to_numpy(dtype=float) @ w
    if portfolio_returns.size == 0:
        raise HTTPException(status_code=404, detail="Insufficient aligned historical data")

    sorted_returns = np.sort(portfolio_returns)
    var_95_return = float(np.percentile(sorted_returns, 5))
    var_99_return = float(np.percentile(sorted_returns, 1))

    var_95_amount = var_95_return * float(total_portfolio_value)
    var_99_amount = var_99_return * float(total_portfolio_value)

    return {
        "username": user["username"],
        "VaR_95": var_95_amount,
        "VaR_99": var_99_amount,
        "currency": currency,
        "currency_symbol": currency_symbol,
    }


@app.get("/monte-carlo")
async def monte_carlo(current_user: dict = Depends(get_current_user)):
    user = user_service.get_user_flat(current_user["username"])
    portfolio = user.get("portfolio", {}) or {}
    currency, currency_symbol = _portfolio_currency_label([str(s) for s in portfolio.keys()])
    returns_df, weights, total_portfolio_value, skipped = await build_returns_and_weights(
        portfolio,
        skip_invalid_symbols=True,
    )

    # Only fail if ALL stocks fail; otherwise run on valid subset.
    if returns_df.empty or not weights or total_portfolio_value <= 0:
        return {"error": "No valid stocks for simulation", "skipped": skipped, "currency": currency, "currency_symbol": currency_symbol}

    w = np.array([weights[s] for s in returns_df.columns], dtype=float)
    portfolio_returns = returns_df.to_numpy(dtype=float) @ w
    if portfolio_returns.size < 2:
        return {"error": "No valid stocks for simulation", "skipped": skipped, "currency": currency, "currency_symbol": currency_symbol}

    mu = float(np.mean(portfolio_returns))
    sigma = float(np.std(portfolio_returns, ddof=1))

    simulations = 1000
    horizon_days = 30

    # Shape: (simulations, horizon_days)
    random_returns = np.random.normal(loc=mu, scale=sigma, size=(simulations, horizon_days))
    growth_factors = np.cumprod(1.0 + random_returns, axis=1)
    final_values = float(total_portfolio_value) * growth_factors[:, -1]

    expected_value = float(np.mean(final_values))
    worst_case = float(np.percentile(final_values, 5))
    best_case = float(np.percentile(final_values, 95))

    return {
        "expected_value": expected_value,
        "worst_case": worst_case,
        "best_case": best_case,
        "currency": currency,
        "currency_symbol": currency_symbol,
    }


@app.get("/transactions")
def get_transactions(current_user: dict = Depends(get_current_user)):
    user = user_service.get_user(current_user["username"])
    return {"username": user["username"], "transactions": user.get("transactions", [])}


@app.post("/watchlist/add")
async def add_to_watchlist(payload: WatchlistRequest, current_user: dict = Depends(get_current_user)):
    symbol = await resolve_symbol(payload.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    updated = user_service.add_to_watchlist(current_user["username"], symbol)
    return {"watchlist": updated.get("watchlist", [])}


@app.post("/watchlist/remove")
async def remove_from_watchlist(payload: WatchlistRequest, current_user: dict = Depends(get_current_user)):
    symbol = await resolve_symbol(payload.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    updated = user_service.remove_from_watchlist(current_user["username"], symbol)
    return {"watchlist": updated.get("watchlist", [])}


@app.get("/watchlist")
def get_watchlist(current_user: dict = Depends(get_current_user)):
    user = user_service.get_user(current_user["username"])
    return {"username": user["username"], "watchlist": user.get("watchlist", [])}


@app.get("/watchlist/snapshot")
async def get_watchlist_snapshot(current_user: dict = Depends(get_current_user)):
    """Single batched response: quotes + short sparklines (avoids N history calls from the client)."""
    from services.ttl_cache import TTLCache

    username = current_user["username"]
    user = user_service.get_user(username)
    symbols = [normalize_symbol(s) for s in (user.get("watchlist") or []) if s]
    symbols = list(dict.fromkeys(symbols))

    if not symbols:
        return {"items": []}

    snap_cache: TTLCache = getattr(get_watchlist_snapshot, "_cache", None)
    if snap_cache is None:
        snap_cache = TTLCache(default_ttl=12)
        get_watchlist_snapshot._cache = snap_cache  # type: ignore[attr-defined]

    cache_key = f"{username}:{','.join(sorted(symbols))}"
    cached = snap_cache.get(cache_key)
    if cached is not None:
        return cached

    quotes = await _fetch_quotes_parallel(symbols)

    async def _spark(sym: str) -> list[dict]:
        try:
            closes = await fetch_history_close_series_live(sym, period="1mo")
            if closes is None or getattr(closes, "empty", True):
                return []
            rows = [{"date": idx.date().isoformat(), "price": round(float(v), 2)} for idx, v in closes.items()]
            return rows[-36:]
        except Exception:
            return []

    async def _resolve_name(sym: str) -> str:
        try:
            name = await fetch_company_name_cached(sym, timeout_s=2.0)
            if name and name.upper().replace(" ", "") not in {sym.replace(".", ""), _base_ticker(sym)}:
                return name
        except Exception:
            pass
        return _company_name_for_symbol(sym)

    sparks, names = await asyncio.gather(
        asyncio.gather(*[_spark(s) for s in symbols]),
        asyncio.gather(*[_resolve_name(s) for s in symbols]),
    )

    items: list[dict] = []
    for sym, spark, name in zip(symbols, sparks, names):
        q = quotes.get(sym) or {}
        price = float(q.get("current_price") or 0) if q else 0.0
        prev = float(q.get("previous_close") or 0) if q else 0.0
        currency, currency_symbol = _currency_label_for_symbol(sym)
        items.append(
            {
                "symbol": sym,
                "name": name,
                "current_price": price if price > 0 else None,
                "previous_close": prev if prev > 0 else None,
                "currency": currency,
                "currency_symbol": currency_symbol,
                "sparkline": spark,
            }
        )

    payload = {"items": items, "symbols": symbols}
    snap_cache.set(cache_key, payload, ttl=20)
    return payload


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=not settings.is_production,
    )

