"""Rule-based portfolio insights (no external AI API)."""

from __future__ import annotations

import numpy as np


SECTOR_BY_SYMBOL: dict[str, str] = {
    "TCS.NS": "Technology",
    "INFY.NS": "Technology",
    "WIPRO.NS": "Technology",
    "HCLTECH.NS": "Technology",
    "TECHM.NS": "Technology",
    "HDFCBANK.NS": "Financials",
    "ICICIBANK.NS": "Financials",
    "SBIN.NS": "Financials",
    "KOTAKBANK.NS": "Financials",
    "AXISBANK.NS": "Financials",
    "BAJFINANCE.NS": "Financials",
    "RELIANCE.NS": "Energy",
    "ONGC.NS": "Energy",
    "ITC.NS": "Consumer",
    "HINDUNILVR.NS": "Consumer",
    "ASIANPAINT.NS": "Consumer",
    "MARUTI.NS": "Consumer",
    "LT.NS": "Industrials",
    "BHARTIARTL.NS": "Telecom",
    "SUNPHARMA.NS": "Healthcare",
    "TATASTEEL.NS": "Materials",
    "ULTRACEMCO.NS": "Materials",
    "NTPC.NS": "Utilities",
    "POWERGRID.NS": "Utilities",
}


def _sector(sym: str) -> str:
    s = (sym or "").upper()
    return SECTOR_BY_SYMBOL.get(s) or SECTOR_BY_SYMBOL.get(s.replace(".BO", ".NS")) or "Other"


def generate_portfolio_insights(
    holdings: list[dict],
    *,
    volatility_pct: float | None = None,
    var_95: float | None = None,
) -> list[dict]:
    """holdings: [{symbol, qty, price, changePct, name}]"""
    if not holdings:
        return [
            {
                "id": "empty",
                "type": "info",
                "title": "Build your portfolio",
                "body": "Add holdings to unlock diversification and risk insights.",
                "severity": "low",
            }
        ]

    insights: list[dict] = []
    values = []
    for h in holdings:
        v = float(h.get("price") or 0) * float(h.get("qty") or 0)
        if v > 0:
            values.append((h.get("symbol", ""), v, h))

    if not values:
        return insights

    total = sum(v for _, v, _ in values)
    weights = [(s, v / total, h) for s, v, h in values]
    weights.sort(key=lambda x: x[1], reverse=True)

    top_sym, top_w, top_h = weights[0]
    if top_w >= 0.45:
        insights.append(
            {
                "id": "concentration",
                "type": "risk",
                "title": "High concentration risk",
                "body": f"{top_sym} represents {top_w * 100:.0f}% of portfolio value. Consider diversifying.",
                "severity": "high",
            }
        )
    elif top_w >= 0.30:
        insights.append(
            {
                "id": "concentration-moderate",
                "type": "risk",
                "title": "Moderate concentration",
                "body": f"{top_sym} is {top_w * 100:.0f}% of your portfolio. Monitor sector exposure.",
                "severity": "medium",
            }
        )

    sector_vals: dict[str, float] = {}
    for sym, v, _ in values:
        sec = _sector(sym)
        sector_vals[sec] = sector_vals.get(sec, 0) + v / total

    if sector_vals:
        top_sector = max(sector_vals.items(), key=lambda x: x[1])
        if top_sector[1] >= 0.55:
            insights.append(
                {
                    "id": "sector",
                    "type": "risk",
                    "title": f"Sector overexposure: {top_sector[0]}",
                    "body": f"{top_sector[0]} accounts for {top_sector[1] * 100:.0f}% of holdings. Spread across sectors.",
                    "severity": "high",
                }
            )

    n = len(values)
    hhi = sum(w**2 for _, w, _ in weights)
    div_score = max(0, min(100, int((1 - hhi) * 120)))
    if div_score < 40:
        insights.append(
            {
                "id": "diversification-low",
                "type": "recommendation",
                "title": "Low diversification score",
                "body": f"Score {div_score}/100. Adding uncorrelated assets may reduce portfolio risk.",
                "severity": "medium",
            }
        )
    else:
        insights.append(
            {
                "id": "diversification-ok",
                "type": "positive",
                "title": "Diversification score",
                "body": f"Your portfolio scores {div_score}/100 on diversification across {n} holdings.",
                "severity": "low",
            }
        )

    performers = sorted(
        [(h.get("symbol"), h.get("changePct")) for _, _, h in weights if h.get("changePct") is not None],
        key=lambda x: x[1] if x[1] is not None else -999,
        reverse=True,
    )
    if performers:
        best_sym, best_chg = performers[0]
        if best_chg is not None and best_chg > 0:
            best_name = best_sym
            for _, _, h in weights:
                if (h.get("symbol") or "").upper() == (best_sym or "").upper():
                    best_name = h.get("name") or best_sym
                    break
            insights.append(
                {
                    "id": f"top-performer-{best_sym}-{round(best_chg, 2)}",
                    "type": "positive",
                    "title": "Top performer today",
                    "body": f"{best_name} is up {best_chg:.2f}% today — leading your holdings.",
                    "severity": "low",
                }
            )

    if volatility_pct is not None and volatility_pct > 25:
        insights.append(
            {
                "id": "volatility",
                "type": "risk",
                "title": "Elevated volatility",
                "body": f"Portfolio volatility is {volatility_pct:.1f}%. Expect larger daily swings.",
                "severity": "medium",
            }
        )

    if var_95 is not None and var_95 > 0:
        insights.append(
            {
                "id": "var",
                "type": "analytics",
                "title": "Value at Risk (95%)",
                "body": f"Estimated 1-day loss at 95% confidence: {var_95:.2f}% of portfolio value.",
                "severity": "low",
            }
        )

    return insights[:8]
