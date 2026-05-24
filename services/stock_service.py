import time
from datetime import datetime, timedelta, timezone
import math

import httpx
import logging
from fastapi import HTTPException
import asyncio
import yfinance as yf
import hashlib
from zoneinfo import ZoneInfo

# ----------------------------
# Simple in-memory caches
# ----------------------------

stock_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 20  # seconds — aligned with frontend poll cadence

price_cache: dict[str, dict[str, object]] = {}
PRICE_TTL_SECONDS = 30

async_client = httpx.AsyncClient(timeout=3)
logger = logging.getLogger(__name__)

# Historical data cache (yfinance)
history_cache_max: dict[str, dict[str, object]] = {}
HISTORY_TTL_SECONDS = 600  # 10 minutes

# Last-known good prices (used as fallback during outages)
last_known_price: dict[str, dict[str, object]] = {}
LAST_KNOWN_TTL_SECONDS = 3600  # 1 hour

# Short-lived snapshot cache for consistent repeated calls
snapshot_cache: dict[str, dict[str, object]] = {}
SNAPSHOT_TTL_SECONDS = 30  # 10–30 seconds as requested

# Resolved symbol cache (original input -> resolved Yahoo ticker)
resolved_symbol_cache: dict[str, str] = {}

# Company name cache (yfinance info is heavier)
company_name_cache: dict[str, dict[str, object]] = {}
COMPANY_NAME_TTL_SECONDS = 86400  # 24h


def _company_name_from_yfinance_sync(symbol: str) -> str | None:
    try:
        t = yf.Ticker(symbol)
    except Exception:
        return None
    try:
        info = getattr(t, "info", None) or {}
        if isinstance(info, dict):
            for k in ("longName", "shortName", "displayName", "name"):
                v = info.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip()
    except Exception:
        return None
    return None


async def fetch_company_name_cached(symbol: str, *, timeout_s: float = 2.0) -> str | None:
    """
    Best-effort company name fetch with caching.
    Returns None if unavailable; does not raise.
    """
    sym = normalize_symbol(symbol)
    if not sym:
        return None
    now = time.time()
    hit = company_name_cache.get(sym)
    if hit and (now - float(hit.get("ts", 0) or 0)) < COMPANY_NAME_TTL_SECONDS:
        v = hit.get("name")
        return v if isinstance(v, str) and v.strip() else None

    try:
        name = await asyncio.wait_for(asyncio.to_thread(_company_name_from_yfinance_sync, sym), timeout=timeout_s)
    except Exception:
        name = None

    company_name_cache[sym] = {"name": name or "", "ts": now}
    return name if isinstance(name, str) and name.strip() else None


def _stock_symbol_attempts_for_stock_endpoint(symbol: str) -> list[str]:
    """
    Strict /stock endpoint behavior:
    - uppercase
    - if symbol has exchange suffix (contains '.'), try as-is only
    - otherwise try SYMBOL.NS first, then SYMBOL (US)
    """
    s = normalize_symbol(symbol)
    if not s:
        return []
    if "." in s:
        return [s]
    return [f"{s}.NS", s]


def _quote_from_yfinance_sync(symbol: str) -> dict | None:
    """
    Strict real-data quote fetch.
    Returns None if any required data is missing/invalid.
    Requirements:
    - current_price: latest intraday minute close
    - previous_close: previous trading day's close
    - historical data must be non-empty
    - no mock/fallback values
    """
    try:
        t = yf.Ticker(symbol)
    except Exception:
        return None

    # Daily history for previous close (and "historical data is not empty" validation)
    try:
        daily = t.history(period="10d", interval="1d", auto_adjust=False, actions=False)
    except Exception:
        return None
    if daily is None or daily.empty:
        return None
    dclose = daily.get("Close")
    if dclose is None:
        return None
    dclose = dclose.dropna()
    if dclose.size < 2:
        return None
    previous_close = float(dclose.iloc[-2])

    # Intraday for current price (latest available market price)
    try:
        intraday = t.history(period="1d", interval="1m", auto_adjust=False, actions=False)
    except Exception:
        return None
    if intraday is None or intraday.empty:
        return None
    iclose = intraday.get("Close")
    if iclose is None:
        return None
    iclose = iclose.dropna()
    if iclose.empty:
        return None
    current_price = float(iclose.iloc[-1])

    # Strict validation
    if current_price <= 0 or previous_close <= 0:
        return None
    if math.isnan(current_price) or math.isnan(previous_close):
        return None

    return {"symbol": symbol, "current_price": current_price, "previous_close": previous_close}


async def fetch_stock_quote_strict(symbol: str, *, timeout_s: float = 4.0) -> dict:
    """
    Strict symbol resolution + quote fetching for /stock endpoint only.
    - Try SYMBOL.NS then SYMBOL (US) if no suffix
    - Per-attempt timeout
    - Strict validation; no mock/fallback
    - Raises HTTP 404 if all attempts fail
    """
    attempts = _stock_symbol_attempts_for_stock_endpoint(symbol)
    if not attempts:
        raise HTTPException(status_code=404, detail="Stock symbol not found or no data available")

    logger.info("stock_quote_strict input=%s attempts=%s", symbol, attempts)
    for idx, cand in enumerate(attempts, start=1):
        try:
            # Hard timeout per attempt (yfinance is blocking)
            q = await asyncio.wait_for(asyncio.to_thread(_quote_from_yfinance_sync, cand), timeout=timeout_s)
            if q is not None:
                logger.info("stock_quote_strict success on attempt %d/%d: %s", idx, len(attempts), cand)
                return q
            logger.info("stock_quote_strict invalid data attempt %d/%d: %s", idx, len(attempts), cand)
        except TimeoutError:
            logger.warning("stock_quote_strict timeout attempt %d/%d: %s", idx, len(attempts), cand)
        except Exception as e:
            logger.warning("stock_quote_strict failed attempt %d/%d: %s (%s)", idx, len(attempts), cand, e)

    raise HTTPException(status_code=404, detail="Stock symbol not found or no data available")


def normalize_symbol(symbol: str) -> str:
    """
    Canonicalize input symbol:
    - uppercase + strip
    - DO NOT guess exchanges here (global markets supported via resolve_symbol()).
    """
    return (symbol or "").upper().strip()


def _candidate_symbols(symbol: str) -> list[str]:
    """
    Exchange resolution candidates (system-wide order):
    - If user provided dotted symbol, keep as-is only
    - Else: try US first (raw), then NSE (.NS), then BSE (.BO)
    """
    s = normalize_symbol(symbol)
    if not s:
        return []
    if "." in s:
        return [s]
    return [s, f"{s}.NS", f"{s}.BO"]


def _probe_price_sync(symbol: str) -> tuple[float | None, float | None]:
    """
    Probe a symbol using yfinance only (single provider).
    Prefer fast_info last_price; fallback to intraday close.
    previous_close from previous trading day close.
    Returns (current_price, previous_close) or (None, None) if invalid.
    """
    try:
        t = yf.Ticker(symbol)
    except Exception:
        return None, None

    cur: float | None = None
    prev: float | None = None

    # current price
    try:
        fi = getattr(t, "fast_info", None)
        if fi:
            v = fi.get("last_price") if hasattr(fi, "get") else None
            if isinstance(v, (int, float)) and float(v) > 0:
                cur = float(v)
    except Exception:
        pass

    if cur is None:
        try:
            intraday = t.history(period="1d", interval="1m", auto_adjust=False, actions=False)
            if intraday is not None and not intraday.empty:
                c = intraday.get("Close")
                if c is not None:
                    c = c.dropna()
                    if not c.empty:
                        v = float(c.iloc[-1])
                        if v > 0:
                            cur = v
        except Exception:
            pass

    # previous close (previous trading day)
    try:
        daily = t.history(period="5d", interval="1d", auto_adjust=False, actions=False)
        if daily is not None and not daily.empty:
            c = daily.get("Close")
            if c is not None:
                c = c.dropna()
                if c.size >= 2:
                    v = float(c.iloc[-2])
                    if v > 0:
                        prev = v
                elif c.size == 1:
                    v = float(c.iloc[-1])
                    if v > 0:
                        prev = v
    except Exception:
        pass

    if cur is None or prev is None:
        return None, None
    if cur <= 0 or prev <= 0:
        return None, None
    if math.isnan(cur) or math.isnan(prev):
        return None, None

    # Reject extreme inconsistency (global rule-of-thumb)
    if abs(cur - prev) / prev > 0.5:
        return None, None

    return cur, prev


async def resolve_symbol(symbol: str) -> str:
    """
    Resolve a user input symbol to a valid Yahoo Finance ticker.
    Requirements:
    - If input contains '.', use as-is
    - Else try: US (raw) -> .NS -> .BO
    - Validate price via fast_info/history
    - Cache resolved symbol so repeated calls are consistent
    """
    original = (symbol or "").strip()
    s = normalize_symbol(symbol)
    if not s:
        raise HTTPException(status_code=400, detail="Symbol is required")

    cached = resolved_symbol_cache.get(s)
    if cached:
        return cached

    logger.info("resolve_symbol input=%s normalized=%s", original, s)
    candidates = _candidate_symbols(s)
    for cand in candidates[:3]:
        logger.info("resolve_symbol attempt=%s", cand)
        cur, prev = await asyncio.to_thread(_probe_price_sync, cand)
        if cur is not None and prev is not None:
            resolved_symbol_cache[s] = cand
            logger.info("resolve_symbol selected=%s (from %s)", cand, s)
            return cand

    # Nothing validated; fall back to original normalized (stable)
    resolved_symbol_cache[s] = candidates[0] if candidates else s
    logger.info("resolve_symbol fallback_selected=%s (from %s)", resolved_symbol_cache[s], s)
    return resolved_symbol_cache[s]


def get_cached_stock(symbol: str) -> dict | None:
    symbol = normalize_symbol(symbol)
    cached = stock_cache.get(symbol)
    if not cached:
        return None
    data, timestamp = cached
    if time.time() - timestamp < CACHE_TTL:
        return data
    return None


def set_cached_stock(symbol: str, data: dict) -> None:
    symbol = normalize_symbol(symbol)
    stock_cache[symbol] = (data, time.time())


async def _httpx_get_with_retries(
    url: str,
    *,
    params: dict[str, object] | None = None,
    retries: int = 3,
    backoff_base_s: float = 0.35,
) -> httpx.Response | None:
    """
    Robust external fetch:
    - retries with exponential backoff
    - returns None on failure (never raises to callers)
    """
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = await async_client.get(url, params=params)
            resp.raise_for_status()
            return resp
        except Exception as e:
            last_err = e
            delay = backoff_base_s * (2**attempt)
            logger.warning("httpx GET failed %s attempt %d/%d: %s", url, attempt + 1, retries, e)
            await asyncio.sleep(delay)

    logger.error("httpx GET failed after retries %s: %s", url, last_err)
    return None


async def fetch_stock_quote(symbol: str) -> dict:
    """
    Returns {"symbol", "current_price", "previous_close"}.
    Raises HTTPException for invalid symbols / fetch errors.
    """
    symbol = await resolve_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    resp = await _httpx_get_with_retries(
        "https://query1.finance.yahoo.com/v7/finance/quote",
        params={"symbols": symbol},
        retries=3,
        backoff_base_s=0.35,
    )
    if resp is None:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")
    try:
        payload = resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable")

    # Debug logging: raw payload before parsing (for diagnosing provider anomalies).
    try:
        logger.debug("Yahoo quote raw payload for %s: %s", symbol, payload)
    except Exception:
        pass

    result = (payload.get("quoteResponse") or {}).get("result") or []
    if not result:
        raise HTTPException(status_code=404, detail="Invalid or unknown symbol")

    quote = result[0] or {}
    current_price = quote.get("regularMarketPrice")
    previous_close = quote.get("regularMarketPreviousClose")

    # Debug logging: helps diagnose when Yahoo returns stale/duplicated fields.
    try:
        logger.debug(
            "Yahoo quote raw fields for %s: %s",
            symbol,
            {
                "regularMarketPrice": quote.get("regularMarketPrice"),
                "regularMarketPreviousClose": quote.get("regularMarketPreviousClose"),
                "marketState": quote.get("marketState"),
                "exchangeTimezoneName": quote.get("exchangeTimezoneName"),
                "currency": quote.get("currency"),
            },
        )
    except Exception:
        pass

    # Requirement: BOTH values must come from the SAME provider dataset.
    # We therefore do NOT mix quote API with candle history here.
    # Definitions:
    # - current_price: regularMarketPrice
    # - previous_close: regularMarketPreviousClose (previous trading day close)

    if current_price is None or previous_close is None:
        raise HTTPException(status_code=404, detail="Invalid or unknown symbol")

    return {
        "symbol": symbol,
        "current_price": float(current_price),
        "previous_close": float(previous_close),
    }


async def fetch_quotes_yahoo_batch(symbols: list[str]) -> dict[str, dict]:
    """
    Live quotes from Yahoo v7 (regularMarketPrice / regularMarketPreviousClose).
  Preferred for accurate day P/L; batches up to 40 symbols per request.
    """
    norm = list(dict.fromkeys(normalize_symbol(s) for s in symbols if s))
    if not norm:
        return {}

    out: dict[str, dict] = {}
    chunk_size = 40
    for i in range(0, len(norm), chunk_size):
        chunk = norm[i : i + chunk_size]
        resp = await _httpx_get_with_retries(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            params={"symbols": ",".join(chunk)},
            retries=2,
            backoff_base_s=0.3,
        )
        if resp is None:
            continue
        try:
            payload = resp.json()
        except Exception:
            continue
        rows = (payload.get("quoteResponse") or {}).get("result") or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            sym = normalize_symbol(str(row.get("symbol") or ""))
            cur = row.get("regularMarketPrice")
            prev = row.get("regularMarketPreviousClose")
            if sym and cur is not None and prev is not None:
                try:
                    cur_f = float(cur)
                    prev_f = float(prev)
                except (TypeError, ValueError):
                    continue
                if cur_f > 0 and prev_f > 0:
                    out[sym] = {
                        "symbol": sym,
                        "current_price": cur_f,
                        "previous_close": prev_f,
                    }
    return out


def _mock_price(symbol: str) -> float:
    """
    Deterministic mock price generator (offline-safe).
    Produces a stable pseudo-price per symbol in a reasonable range.
    """
    symbol = normalize_symbol(symbol)
    h = hashlib.sha256(symbol.encode("utf-8")).digest()
    n = int.from_bytes(h[:8], "big")
    # Map to [50, 5000] with cents
    return float(50.0 + (n % 495000) / 100.0)


def _mock_previous_close_price(symbol: str) -> float:
    """Deterministic "previous close" for offline mode (different from current mock)."""
    symbol = normalize_symbol(symbol)
    h = hashlib.sha256((symbol + "|prev").encode("utf-8")).digest()
    n = int.from_bytes(h[:8], "big")
    return float(50.0 + (n % 495000) / 100.0)


def _get_last_known_quote(symbol: str) -> dict | None:
    symbol = normalize_symbol(symbol)
    now = datetime.now(timezone.utc)
    lk = last_known_price.get(symbol)
    if lk is None:
        return None
    ts = lk.get("timestamp")
    cur = lk.get("current_price")
    prev = lk.get("previous_close")
    if isinstance(ts, datetime) and now - ts < timedelta(seconds=LAST_KNOWN_TTL_SECONDS):
        if isinstance(cur, (int, float)) and isinstance(prev, (int, float)):
            return {"symbol": symbol, "current_price": float(cur), "previous_close": float(prev)}
    return None


def _set_last_known_quote(symbol: str, *, current_price: float, previous_close: float) -> None:
    symbol = normalize_symbol(symbol)
    last_known_price[symbol] = {
        "current_price": float(current_price),
        "previous_close": float(previous_close),
        "timestamp": datetime.now(timezone.utc),
    }


async def get_stock_quote_hybrid(symbol: str) -> dict:
    """
    Single uniform snapshot provider for ALL symbols.
    Definitions (system-wide):
    - current_price: latest intraday 1-minute Close (yfinance)
    - previous_close: previous trading day's daily Close (yfinance)

    Fallback order (system-wide, no per-symbol variation):
    1) yfinance snapshot (intraday + daily)
    2) last-known cached snapshot (in-memory)
    3) deterministic mock snapshot
    """
    symbol = await resolve_symbol(symbol)
    if not symbol:
        p = _mock_price("INVALID.NS")
        return {"symbol": "INVALID.NS", "current_price": p, "previous_close": _mock_previous_close_price("INVALID.NS")}

    # Optional: short cache so repeated calls are consistent + fast.
    now = datetime.now(timezone.utc)
    sc = snapshot_cache.get(symbol)
    if sc is not None:
        ts = sc.get("timestamp")
        if isinstance(ts, datetime) and now - ts < timedelta(seconds=SNAPSHOT_TTL_SECONDS):
            try:
                return {
                    "symbol": symbol,
                    "current_price": float(sc["current_price"]),
                    "previous_close": float(sc["previous_close"]),
                }
            except Exception:
                pass

    def _is_market_hours_nse(now_utc: datetime) -> bool:
        try:
            ist = ZoneInfo("Asia/Kolkata")
            now = now_utc.astimezone(ist)
            if now.weekday() >= 5:
                return False
            # NSE regular session ~09:15–15:30 IST
            start = now.replace(hour=9, minute=15, second=0, microsecond=0)
            end = now.replace(hour=15, minute=30, second=0, microsecond=0)
            return start <= now <= end
        except Exception:
            return False

    def _fetch_snapshot_sync(sym: str) -> tuple[float | None, float | None]:
        t = yf.Ticker(sym)

        # current_price: latest intraday minute close
        cur: float | None = None
        try:
            intraday = t.history(period="1d", interval="1m", auto_adjust=False, actions=False)
            if intraday is not None and not intraday.empty:
                c = intraday.get("Close")
                if c is not None:
                    c = c.dropna()
                    if not c.empty:
                        v = float(c.iloc[-1])
                        if v > 0:
                            cur = v
        except Exception:
            cur = None

        # previous_close: previous trading day's daily close
        prev: float | None = None
        try:
            daily = t.history(period="5d", interval="1d", auto_adjust=False, actions=False)
            if daily is not None and not daily.empty:
                c = daily.get("Close")
                if c is not None:
                    c = c.dropna()
                    if c.size >= 2:
                        v = float(c.iloc[-2])
                        if v > 0:
                            prev = v
                    elif c.size == 1:
                        v = float(c.iloc[-1])
                        if v > 0:
                            prev = v
        except Exception:
            prev = None

        return cur, prev

    # Provider debug: always the same provider path for all symbols.
    logger.debug("price_snapshot provider=yfinance symbol=%s", symbol)

    cur: float | None = None
    prev: float | None = None
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            cur, prev = await asyncio.to_thread(_fetch_snapshot_sync, symbol)
            # Validation: non-empty, numeric, non-NaN, and not a drastic outlier vs last-known.
            ok = (
                isinstance(cur, (int, float))
                and isinstance(prev, (int, float))
                and cur is not None
                and prev is not None
                and float(cur) > 0
                and float(prev) > 0
                and not math.isnan(float(cur))
                and not math.isnan(float(prev))
            )
            if ok:
                lk = _get_last_known_quote(symbol)
                if lk is not None:
                    lk_cur = float(lk["current_price"])
                    # Reject if cur is drastically lower than what we last saw (common "first call wrong" symptom).
                    if lk_cur > 0 and float(cur) < 0.7 * lk_cur:
                        ok = False
                        logger.warning(
                            "snapshot validation failed for %s attempt %d/3: cur=%s too low vs last_known=%s",
                            symbol,
                            attempt + 1,
                            cur,
                            lk_cur,
                        )
            if ok:
                if attempt > 0:
                    logger.info("yfinance snapshot retry succeeded for %s on attempt %d/3", symbol, attempt + 1)
                break
        except Exception as e:
            last_err = e
            if attempt == 0:
                logger.warning("yfinance snapshot first attempt failed for %s: %s", symbol, e)
            else:
                logger.warning("yfinance snapshot failed %s attempt %d/3: %s", symbol, attempt + 1, e)
        # Delay 0.5–1s between retries (exponential within that range).
        await asyncio.sleep(min(1.0, 0.5 * (2**attempt)))

    if isinstance(cur, (int, float)) and isinstance(prev, (int, float)) and cur > 0 and prev > 0:
        # Validation: unrealistic gaps => reject and fall back to last-known snapshot.
        if prev > 0 and abs(float(cur) - float(prev)) / float(prev) > 0.15:
            logger.warning("snapshot gap >15%% for %s (cur=%s prev=%s); falling back to last-known", symbol, cur, prev)
            lk = _get_last_known_quote(symbol)
            if lk is not None:
                return lk
        # Market-hours stale warning
        if _is_market_hours_nse(datetime.now(timezone.utc)) and abs(float(cur) - float(prev)) <= 1e-6:
            logger.warning("possible stale pricing during market hours for %s (cur==prev==%s)", symbol, cur)

        _set_last_known_quote(symbol, current_price=float(cur), previous_close=float(prev))
        snapshot_cache[symbol] = {"current_price": float(cur), "previous_close": float(prev), "timestamp": now}
        return {"symbol": symbol, "current_price": float(cur), "previous_close": float(prev)}

    # Fallback 2: last-known snapshot
    lk = _get_last_known_quote(symbol)
    if lk is not None:
        logger.debug("price_snapshot provider=last_known symbol=%s", symbol)
        return lk

    # Fallback 3: deterministic mock snapshot (offline)
    logger.debug("price_snapshot provider=mock symbol=%s", symbol)
    return {"symbol": symbol, "current_price": _mock_price(symbol), "previous_close": _mock_previous_close_price(symbol)}


async def get_stock_quote_cached(symbol: str) -> dict:
    symbol = await resolve_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    from services.ttl_cache import strict_quote_cache

    cache_key = symbol.upper()
    hit = strict_quote_cache.get(cache_key)
    if hit is not None:
        return hit

    cached = get_cached_stock(symbol)
    if cached is not None:
        strict_quote_cache.set(cache_key, cached, ttl=8)
        return cached

    try:
        data = await fetch_stock_quote(symbol)
        set_cached_stock(symbol, data)
        strict_quote_cache.set(cache_key, data, ttl=8)
        now = datetime.now(timezone.utc)
        snapshot_cache[symbol] = {
            "current_price": float(data["current_price"]),
            "previous_close": float(data["previous_close"]),
            "timestamp": now,
        }
        return data
    except HTTPException:
        pass

    data = await get_stock_quote_hybrid(symbol)
    set_cached_stock(symbol, data)
    strict_quote_cache.set(cache_key, data, ttl=8)
    return data


async def fetch_current_price(symbol: str) -> float:
    """
    Cached current price used by buy/sell/risk endpoints.
    """
    symbol = await resolve_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    now = datetime.now(timezone.utc)
    cached = price_cache.get(symbol)
    if cached is not None:
        cached_ts = cached.get("timestamp")
        cached_price = cached.get("price")
        if isinstance(cached_ts, datetime) and isinstance(cached_price, (int, float)):
            if now - cached_ts < timedelta(seconds=PRICE_TTL_SECONDS):
                return float(cached_price)

    quote = await get_stock_quote_cached(symbol)
    price = float(quote["current_price"])
    price_cache[symbol] = {"price": price, "timestamp": now}
    return price


def _fetch_current_price_yfinance_sync(symbol: str) -> float:
    """
    Fetch a live-ish last price from yfinance.
    Kept sync because yfinance is blocking; wrap via asyncio.to_thread.
    """
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise ValueError("Symbol is required")

    t = yf.Ticker(symbol)

    # Prefer fast_info if present (much faster / lighter).
    try:
        fi = getattr(t, "fast_info", None)
        if fi:
            for key in ("last_price", "lastPrice", "regularMarketPrice"):
                v = fi.get(key) if hasattr(fi, "get") else None
                if isinstance(v, (int, float)) and v > 0:
                    return float(v)
    except Exception:
        # We'll fall back to history below.
        pass

    hist = t.history(period="5d", interval="1d")
    if hist is None or hist.empty:
        raise ValueError(f"No price history returned for {symbol}")

    close = hist.get("Close")
    if close is None or close.dropna().empty:
        raise ValueError(f"No close prices returned for {symbol}")

    price = float(close.dropna().iloc[-1])
    if price <= 0:
        raise ValueError(f"Non-positive price for {symbol}")
    return price


async def fetch_current_price_live(symbol: str) -> float:
    """
    Live price source for portfolio valuation (yfinance).
    - normalizes symbol to Yahoo format
    - logs and raises on failure (no silent 0)
    """
    symbol = normalize_symbol(symbol)
    price = await get_stock_price(symbol)
    if price is None:
        raise ValueError(f"Stock price unavailable for {symbol}")
    return float(price)


def _get_stock_price_sync(symbol: str) -> float | None:
    """
    Single source of truth for stock prices:
    - yfinance Ticker(symbol).history(period='1d')
    - last Close
    - returns None on any failure / empty
    """
    symbol = normalize_symbol(symbol)
    if not symbol:
        return None

    try:
        t = yf.Ticker(symbol)
        # Preferred: real-time market price from yfinance info.
        try:
            info = t.info or {}
            rp = info.get("regularMarketPrice")
            if isinstance(rp, (int, float)) and rp > 0:
                return float(rp)
        except Exception:
            pass

        # Fallback: last intraday minute close (still yfinance, same provider).
        try:
            hist = t.history(period="1d", interval="1m")
            if hist is None or hist.empty:
                return None
            close = hist.get("Close")
            if close is None:
                return None
            close = close.dropna()
            if close.empty:
                return None
            price = float(close.iloc[-1])
            if price <= 0:
                return None
            return price
        except Exception:
            return None
    except Exception:
        return None


async def get_stock_price(symbol: str) -> float | None:
    """
    SINGLE reusable price function.
    Requirements:
    - yfinance (history 1d)
    - last closing price
    - retry up to 3 times
    - on failure: return None (no throw)
    """
    symbol = await resolve_symbol(symbol)
    for attempt in range(3):
        try:
            price = await asyncio.to_thread(_get_stock_price_sync, symbol)
            if isinstance(price, (int, float)) and float(price) > 0:
                return float(price)
        except Exception as e:
            logger.warning("get_stock_price failed (%s) attempt %d/3: %s", symbol, attempt + 1, e)
    logger.warning("get_stock_price unavailable for %s", symbol)
    return None


async def get_stock_price_with_fallback(symbol: str) -> tuple[float, str]:
    """
    Resilient price getter for internal computations (portfolio/risk/etc).
    Returns (price, status) where status is "ok" or "data_unavailable".
    Order:
    1) fresh yfinance (get_stock_price)
    2) last-known cached price (<= 1h)
    3) deterministic mock fallback price
    """
    symbol = normalize_symbol(symbol)
    snap = await get_stock_quote_cached(symbol)
    try:
        cur = float(snap["current_price"])
        prev = float(snap["previous_close"])
        if cur > 0 and prev > 0:
            return cur, "ok"
    except Exception:
        pass

    lkq = _get_last_known_quote(symbol)
    if lkq is not None:
        return float(lkq["current_price"]), "data_unavailable"

    return _mock_price(symbol), "data_unavailable"


def _fetch_history_close_series_yfinance_sync(symbol: str, period: str = "1y") -> "pd.Series":
    """
    Fetch close price series using yfinance.
    Returns a pandas Series indexed by datetime with name 'Close'.
    """
    # Local import to avoid hard dependency at import time in some envs
    import pandas as pd

    symbol = normalize_symbol(symbol)
    if not symbol:
        raise ValueError("Symbol is required")

    t = yf.Ticker(symbol)
    hist = t.history(period=period)
    if hist is None or hist.empty:
        return pd.Series(dtype=float)

    close = hist.get("Close")
    if close is None:
        return pd.Series(dtype=float)

    close = close.dropna()
    if close.empty:
        return pd.Series(dtype=float)
    return close


async def fetch_history_close_series_live(symbol: str, *, period: str = "1y"):
    """
    Async wrapper for yfinance history used by analytics endpoints.
    Cached per symbol+period to avoid repeated 1y pulls for risk/VaR.
    """
    from services.ttl_cache import history_1y_cache

    symbol = await resolve_symbol(symbol)
    if not symbol:
        return pd.Series(dtype=float)

    cache_key = f"{symbol}:{period}"
    cached = history_1y_cache.get(cache_key)
    if cached is not None:
        return cached.copy()

    try:
        series = await asyncio.to_thread(_fetch_history_close_series_yfinance_sync, symbol, period)
        if series is not None and not series.empty:
            history_1y_cache.set(cache_key, series, ttl=600)
        return series
    except Exception as e:
        logger.exception("Live history fetch failed for %s: %s", symbol, e)
        raise


def _fetch_history_df_max_yfinance_sync(symbol: str):
    """
    Fetch full available price history using yfinance.
    Returns pandas DataFrame (may be empty). Never raises for 'no data'.
    """
    import pandas as pd

    symbol = normalize_symbol(symbol)
    if not symbol:
        return pd.DataFrame()

    t = yf.Ticker(symbol)
    hist = t.history(period="max")
    if hist is None or hist.empty:
        return pd.DataFrame()
    return hist


async def fetch_history_df_max_cached(symbol: str):
    """
    yfinance-backed historical fetch for endpoints (/stock-history, /simulate).
    Requirements:
    - normalize symbol (append .NS if missing)
    - retry up to 3 times on request failure
    - cache per symbol for ~10 minutes
    - on failure: return empty DataFrame (never raise to caller)
    """
    import pandas as pd

    symbol = await resolve_symbol(symbol)
    now = datetime.now(timezone.utc)

    cached = history_cache_max.get(symbol)
    if cached is not None:
        ts = cached.get("timestamp")
        df = cached.get("df")
        if isinstance(ts, datetime) and isinstance(df, pd.DataFrame):
            if now - ts < timedelta(seconds=HISTORY_TTL_SECONDS):
                return df.copy()

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            df = await asyncio.to_thread(_fetch_history_df_max_yfinance_sync, symbol)
            if not isinstance(df, pd.DataFrame):
                df = pd.DataFrame()
            history_cache_max[symbol] = {"df": df, "timestamp": now}
            return df.copy()
        except Exception as e:
            last_err = e
            logger.warning("History max fetch failed (%s) attempt %d/3: %s", symbol, attempt + 1, e)

    logger.exception("History max fetch failed (%s) after retries: %s", symbol, last_err)
    empty = pd.DataFrame()
    history_cache_max[symbol] = {"df": empty, "timestamp": now}
    return empty


async def fetch_history_closes(symbol: str, period: str = "1mo", interval: str = "1d") -> list[tuple[str, float]]:
    """
    Returns list of (YYYY-MM-DD, close_price).
    """
    symbol = await resolve_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    resp = await _httpx_get_with_retries(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": period, "interval": interval},
        retries=3,
        backoff_base_s=0.35,
    )
    if resp is None:
        return []
    try:
        payload = resp.json()
    except Exception:
        return []

    chart = (payload.get("chart") or {}).get("result") or []
    if not chart:
        return []

    result = chart[0] or {}
    timestamps = result.get("timestamp") or []
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0] or {}).get("close") or []

    if not timestamps or not closes or len(timestamps) != len(closes):
        return []

    out: list[tuple[str, float]] = []
    for ts, c in zip(timestamps, closes):
        if c is None:
            continue
        date_str = datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
        out.append((date_str, float(c)))
    return out

