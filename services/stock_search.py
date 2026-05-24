"""
Fast fuzzy stock search (local index + optional Yahoo Finance lookup).
"""

from __future__ import annotations

import re
import time
from difflib import SequenceMatcher

import httpx

# Re-use the app's async HTTP client when available.
try:
    from services.stock_service import async_client
except Exception:  # pragma: no cover
    async_client = httpx.AsyncClient(timeout=2.5)

_search_cache: dict[str, tuple[list[dict], float]] = {}
_SEARCH_CACHE_TTL = 45


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def _tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[\s.\-_]+", (text or "").lower()) if len(t) >= 2]


# symbol, company, exchange, search aliases (lowercase)
_STOCK_INDEX: list[dict] = [
    {"symbol": "TCS.NS", "company": "Tata Consultancy Services", "exchange": "NSE", "aliases": ["tata", "tcs", "consultancy"]},
    {"symbol": "TATASTEEL.NS", "company": "Tata Steel", "exchange": "NSE", "aliases": ["tata", "steel", "tatasteel"]},
    {"symbol": "TATAMOTORS.NS", "company": "Tata Motors", "exchange": "NSE", "aliases": ["tata", "motors", "tatamotors"]},
    {"symbol": "TATAPOWER.NS", "company": "Tata Power", "exchange": "NSE", "aliases": ["tata", "power"]},
    {"symbol": "RELIANCE.NS", "company": "Reliance Industries", "exchange": "NSE", "aliases": ["reliance", "ril", "ambani"]},
    {"symbol": "INFY.NS", "company": "Infosys", "exchange": "NSE", "aliases": ["infy", "infosys"]},
    {"symbol": "HDFCBANK.NS", "company": "HDFC Bank", "exchange": "NSE", "aliases": ["hdfc", "hdfcbank", "bank"]},
    {"symbol": "ICICIBANK.NS", "company": "ICICI Bank", "exchange": "NSE", "aliases": ["icici", "icicibank"]},
    {"symbol": "SBIN.NS", "company": "State Bank of India", "exchange": "NSE", "aliases": ["sbi", "state bank"]},
    {"symbol": "ITC.NS", "company": "ITC", "exchange": "NSE", "aliases": ["itc"]},
    {"symbol": "LT.NS", "company": "Larsen & Toubro", "exchange": "NSE", "aliases": ["larsen", "toubro", "l&t", "lt"]},
    {"symbol": "BHARTIARTL.NS", "company": "Bharti Airtel", "exchange": "NSE", "aliases": ["airtel", "bharti"]},
    {"symbol": "ASIANPAINT.NS", "company": "Asian Paints", "exchange": "NSE", "aliases": ["asian", "paints"]},
    {"symbol": "HINDUNILVR.NS", "company": "Hindustan Unilever", "exchange": "NSE", "aliases": ["hul", "unilever", "hindustan"]},
    {"symbol": "KOTAKBANK.NS", "company": "Kotak Mahindra Bank", "exchange": "NSE", "aliases": ["kotak", "kotakbank"]},
    {"symbol": "AXISBANK.NS", "company": "Axis Bank", "exchange": "NSE", "aliases": ["axis", "axisbank"]},
    {"symbol": "WIPRO.NS", "company": "Wipro", "exchange": "NSE", "aliases": ["wipro"]},
    {"symbol": "MARUTI.NS", "company": "Maruti Suzuki", "exchange": "NSE", "aliases": ["maruti", "suzuki"]},
    {"symbol": "BAJFINANCE.NS", "company": "Bajaj Finance", "exchange": "NSE", "aliases": ["bajaj", "finance"]},
    {"symbol": "SUNPHARMA.NS", "company": "Sun Pharmaceutical", "exchange": "NSE", "aliases": ["sun", "pharma", "sunpharma"]},
    {"symbol": "HCLTECH.NS", "company": "HCL Technologies", "exchange": "NSE", "aliases": ["hcl", "hcltech"]},
    {"symbol": "ADANIENT.NS", "company": "Adani Enterprises", "exchange": "NSE", "aliases": ["adani"]},
    {"symbol": "ADANIPORTS.NS", "company": "Adani Ports", "exchange": "NSE", "aliases": ["adani", "ports"]},
    {"symbol": "NTPC.NS", "company": "NTPC", "exchange": "NSE", "aliases": ["ntpc", "power"]},
    {"symbol": "POWERGRID.NS", "company": "Power Grid Corporation", "exchange": "NSE", "aliases": ["powergrid", "power"]},
    {"symbol": "ONGC.NS", "company": "Oil and Natural Gas Corporation", "exchange": "NSE", "aliases": ["ongc", "oil"]},
    {"symbol": "COALINDIA.NS", "company": "Coal India", "exchange": "NSE", "aliases": ["coal", "coalindia"]},
    {"symbol": "TECHM.NS", "company": "Tech Mahindra", "exchange": "NSE", "aliases": ["tech", "mahindra", "techm"]},
    {"symbol": "ULTRACEMCO.NS", "company": "UltraTech Cement", "exchange": "NSE", "aliases": ["ultra", "cement", "ultratech"]},
    # BSE mirrors (lower priority via exchange score)
    {"symbol": "TCS.BO", "company": "Tata Consultancy Services", "exchange": "BSE", "aliases": ["tata", "tcs"]},
    {"symbol": "RELIANCE.BO", "company": "Reliance Industries", "exchange": "BSE", "aliases": ["reliance", "ril"]},
    {"symbol": "INFY.BO", "company": "Infosys", "exchange": "BSE", "aliases": ["infy", "infosys"]},
    {"symbol": "HDFCBANK.BO", "company": "HDFC Bank", "exchange": "BSE", "aliases": ["hdfc"]},
    # US equities
    {"symbol": "AAPL", "company": "Apple", "exchange": "NASDAQ", "aliases": ["apple", "aapl"]},
    {"symbol": "MSFT", "company": "Microsoft", "exchange": "NASDAQ", "aliases": ["microsoft", "msft"]},
    {"symbol": "GOOGL", "company": "Alphabet", "exchange": "NASDAQ", "aliases": ["google", "alphabet", "googl"]},
    {"symbol": "GOOG", "company": "Alphabet Class C", "exchange": "NASDAQ", "aliases": ["google", "alphabet", "goog"]},
    {"symbol": "AMZN", "company": "Amazon", "exchange": "NASDAQ", "aliases": ["amazon", "amzn"]},
    {"symbol": "TSLA", "company": "Tesla", "exchange": "NASDAQ", "aliases": ["tesla", "tsla"]},
    {"symbol": "META", "company": "Meta Platforms", "exchange": "NASDAQ", "aliases": ["meta", "facebook", "fb"]},
    {"symbol": "NVDA", "company": "NVIDIA", "exchange": "NASDAQ", "aliases": ["nvidia", "nvda"]},
    {"symbol": "NFLX", "company": "Netflix", "exchange": "NASDAQ", "aliases": ["netflix", "nflx"]},
    {"symbol": "JPM", "company": "JPMorgan Chase", "exchange": "NYSE", "aliases": ["jpmorgan", "chase", "jpm"]},
    {"symbol": "V", "company": "Visa", "exchange": "NYSE", "aliases": ["visa"]},
    {"symbol": "JNJ", "company": "Johnson & Johnson", "exchange": "NYSE", "aliases": ["johnson", "jnj"]},
]


def _score_entry(query: str, entry: dict) -> float:
    q = _norm(query)
    if not q or len(q) < 1:
        return 0.0

    symbol = entry["symbol"].upper()
    company = entry["company"]
    base = symbol.split(".")[0].lower()
    company_n = _norm(company)
    aliases = entry.get("aliases") or []

    score = 0.0

    if q == _norm(symbol):
        score = max(score, 100.0)
    if q == company_n:
        score = max(score, 98.0)
    if base == q or q == base:
        score = max(score, 95.0)

    if company_n.startswith(q):
        score = max(score, 88.0)
    if q in company_n:
        score = max(score, 82.0)

    sym_plain = _norm(symbol)
    if sym_plain.startswith(q):
        score = max(score, 86.0)
    if q in sym_plain:
        score = max(score, 78.0)

    for alias in aliases:
        a = _norm(alias)
        if not a:
            continue
        if q == a:
            score = max(score, 92.0)
        elif a.startswith(q) or q.startswith(a):
            score = max(score, 85.0)
        elif q in a or a in q:
            score = max(score, 75.0)

    for tok in _tokens(query):
        if len(tok) < 2:
            continue
        if tok in company_n or tok in sym_plain:
            score = max(score, 70.0)
        for alias in aliases:
            if tok in _norm(alias):
                score = max(score, 72.0)

    ratio = SequenceMatcher(None, q, company_n).ratio()
    if ratio > 0.55:
        score = max(score, 60.0 + ratio * 30.0)

    ratio_sym = SequenceMatcher(None, q, sym_plain).ratio()
    if ratio_sym > 0.6:
        score = max(score, 58.0 + ratio_sym * 28.0)

    # Prefer NSE / US over BSE duplicates for same company prefix
    if entry.get("exchange") == "NSE":
        score += 2.0
    elif entry.get("exchange") in ("NASDAQ", "NYSE"):
        score += 1.5

    return score


def _local_search(query: str, limit: int) -> list[dict]:
    scored: list[tuple[float, dict]] = []
    for entry in _STOCK_INDEX:
        s = _score_entry(query, entry)
        if s >= 55.0:
            scored.append(
                (
                    s,
                    {
                        "symbol": entry["symbol"],
                        "company": entry["company"],
                        "exchange": entry["exchange"],
                    },
                )
            )

    scored.sort(key=lambda x: (-x[0], x[1]["company"]))
    seen: set[str] = set()
    out: list[dict] = []
    for _s, row in scored:
        key = row["symbol"].upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= limit:
            break
    return out


def _map_yahoo_exchange(raw: str | None) -> str:
    if not raw:
        return "—"
    r = raw.upper()
    if "NSE" in r or r == "NSI":
        return "NSE"
    if "BSE" in r or r == "BOM":
        return "BSE"
    if "NASDAQ" in r or r == "NMS":
        return "NASDAQ"
    if "NYSE" in r:
        return "NYSE"
    return raw


async def _yahoo_search(query: str, limit: int) -> list[dict]:
    try:
        resp = await async_client.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": query, "quotesCount": limit, "newsCount": 0, "listsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    out: list[dict] = []
    for q in data.get("quotes") or []:
        symbol = q.get("symbol")
        if not symbol:
            continue
        qtype = (q.get("quoteType") or "").upper()
        if qtype and qtype not in ("EQUITY", "ETF", "MUTUALFUND"):
            continue
        company = q.get("shortname") or q.get("longname") or symbol
        exchange = _map_yahoo_exchange(q.get("exchange") or q.get("exchDisp"))
        out.append({"symbol": str(symbol).upper(), "company": str(company), "exchange": exchange})
        if len(out) >= limit:
            break
    return out


async def search_stocks(query: str, *, limit: int = 10) -> list[dict]:
    q = (query or "").strip()
    if len(q) < 1:
        return []

    cache_key = f"{_norm(q)}:{limit}"
    cached = _search_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < _SEARCH_CACHE_TTL:
        return cached[0]

    local = _local_search(q, limit=limit)

    merged: list[dict] = []
    seen: set[str] = set()

    for row in local:
        sym = row["symbol"].upper()
        if sym not in seen:
            seen.add(sym)
            merged.append(row)

    if len(merged) < limit:
        try:
            remote = await _yahoo_search(q, limit=limit)
            for row in remote:
                sym = row["symbol"].upper()
                if sym in seen:
                    continue
                seen.add(sym)
                merged.append(row)
                if len(merged) >= limit:
                    break
        except Exception:
            pass

    _search_cache[cache_key] = (merged, time.time())
    return merged
