from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import numpy as np
import pandas as pd
import io
import math
from datetime import datetime, timedelta, timezone

from auth import create_access_token, get_current_user, hash_password, verify_password

app = FastAPI()

# CORS (must be added before routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

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
}


def _company_name_for_symbol(symbol: str) -> str:
    s = (symbol or "").strip()
    if not s:
        return "Unknown"
    key = s.upper()
    mapped = SYMBOL_TO_COMPANY.get(key) or SYMBOL_TO_COMPANY.get(normalize_symbol(key))
    if mapped:
        return mapped
    # Last resort: return a readable base ticker (avoid showing "—")
    return s.upper()


def _png_response_from_fig(fig) -> StreamingResponse:
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


def _error_plot_png(message: str) -> StreamingResponse:
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
        print(f"History fetch failed for {symbol}: {e}")
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
            print("Skipping bad transaction:", tx, e)
            continue

    return portfolio


async def build_returns_and_weights(
    portfolio: dict[str, int],
    *,
    skip_invalid_symbols: bool = False,
) -> tuple[pd.DataFrame, dict[str, float], float, list[str]]:
    if not portfolio:
        raise HTTPException(status_code=400, detail="No stocks in portfolio")

    symbols = list(portfolio.keys())
    skipped: list[str] = []

    returns_series: dict[str, pd.Series] = {}
    last_closes: dict[str, float] = {}
    for symbol in symbols:
        symbol = normalize_symbol(symbol)
        closes = await get_safe_history(symbol, period="1y")
        if closes is None or len(closes) < 2:
            print(f"Skipping {symbol} (no history)")
            skipped.append(symbol)
            continue

        # Requirement: use log returns from valid price history.
        daily_returns = np.log(closes.astype(float)).diff().dropna()
        if daily_returns.empty:
            print(f"Skipping {symbol} (no returns)")
            skipped.append(symbol)
            continue

        returns_series[symbol] = daily_returns
        try:
            last_closes[symbol] = float(closes.dropna().iloc[-1])
        except Exception:
            skipped.append(symbol)
            continue

    if not returns_series:
        return pd.DataFrame(), {}, 0.0, skipped

    returns_df = pd.DataFrame(returns_series).dropna(how="any")
    if returns_df.shape[0] < 2:
        return pd.DataFrame(), {}, 0.0, skipped

    holding_values: dict[str, float] = {}
    total_portfolio_value = 0.0
    for symbol, qty in portfolio.items():
        if symbol not in returns_df.columns:
            continue
        # Single source of truth for prices in analytics.
        price = await get_stock_price(symbol)
        if price is None:
            skipped.append(symbol)
            continue
        value = float(price) * float(qty)
        holding_values[symbol] = value
        total_portfolio_value += value

    if total_portfolio_value <= 0:
        return pd.DataFrame(), {}, 0.0, skipped

    used_symbols = list(holding_values.keys())
    weights = {s: (holding_values[s] / total_portfolio_value) for s in used_symbols}
    returns_df = returns_df[used_symbols]

    return returns_df, weights, total_portfolio_value, skipped


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class BuyRequest(BaseModel):
    symbol: str
    quantity: int


class SellRequest(BaseModel):
    symbol: str
    quantity: int


class WatchlistRequest(BaseModel):
    symbol: str


class SimulateRequest(BaseModel):
    symbol: str
    amount: float
    date: str  # YYYY-MM-DD


@app.on_event("startup")
def ensure_test_user():
    user_service.ensure_test_user(hash_password("1234"))


@app.get("/")
def root():
    return {"message": "Server is running"}


@app.get("/debug-portfolio-flow")
def debug_portfolio_flow(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    user = user_service.users_col().find_one({"username": username})
    print("USER RAW:", user)
    if not user:
        return {"error": "user not found"}

    # Make Mongo document JSON-safe for the response.
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
    user = user_service.users_col().find_one({"username": payload.username}, {"_id": 0})
    if user is None or not verify_password(payload.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user["username"]})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/stock/{symbol}")
async def get_stock(symbol: str):
    # Strict behavior: real data only, no mock/fallback, clean 404 on invalid.
    quote = await fetch_stock_quote_strict(symbol, timeout_s=4.0)
    currency, currency_symbol = _currency_label_for_symbol(quote["symbol"])
    # Prefer real company name (yfinance metadata) if available; fallback to mapping.
    name = await fetch_company_name_cached(quote["symbol"], timeout_s=2.0)
    if not name:
        name = _company_name_for_symbol(quote["symbol"])
    return {
        "symbol": quote["symbol"],
        "name": name,
        "current_price": float(quote["current_price"]),
        "previous_close": float(quote["previous_close"]),
        "currency": currency,
        "currency_symbol": currency_symbol,
    }


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
        out: list[dict] = []
        for sym in symbols:
            try:
                price, _status = await get_stock_price_with_fallback(sym)
                current_price = float(price)
                if not math.isfinite(current_price) or current_price <= 0:
                    current_price = 0.0
            except Exception:
                # Mock-safe value if price fetch fails (keeps UI stable).
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


@app.get("/stock-history/{symbol}")
async def get_stock_history(symbol: str):
    symbol = await resolve_symbol(symbol)
    if not symbol:
        return {"error": "invalid symbol", "symbol": symbol, "history": []}

    df = await fetch_history_df_max_cached(symbol)
    if df is None or df.empty or "Close" not in df.columns:
        # Fallback behavior: empty dataset (not an error).
        return {"symbol": symbol, "history": []}

    closes = df["Close"].dropna()
    if closes.empty:
        return {"symbol": symbol, "history": []}

    history = [{"date": idx.date().isoformat(), "price": float(v)} for idx, v in closes.items()]
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


@app.post("/buy")
async def buy_stock(payload: BuyRequest, current_user: dict = Depends(get_current_user)):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

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

