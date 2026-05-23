import { useEffect, useMemo, useState } from "react";
import { getToken } from "../auth.js";
import { getPortfolio, getStock } from "../api.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeChangePct(currentPrice, previousClose) {
  const cur = Number(currentPrice);
  const prev = Number(previousClose);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function buildPortfolioSeries(values, points = 16) {
  // No history endpoint requested here; generate a smooth-ish series
  // that lands at "current" value and reflects daily delta subtly.
  const vNow = Number(values?.totalNow);
  const vPrev = Number(values?.totalPrev);
  if (!Number.isFinite(vNow) || vNow <= 0) return [];
  const start = Number.isFinite(vPrev) && vPrev > 0 ? vPrev : vNow * 0.985;
  const drift = (vNow - start) / Math.max(points - 1, 1);

  const seedStr = (values?.seed || "seed").toString();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1000) / 1000;
  };

  const out = [];
  for (let i = 0; i < points; i++) {
    const noise = (rand() - 0.5) * 0.015; // +/- 0.75%
    const t = start + drift * i;
    out.push(t * (1 + noise));
  }
  // Ensure last point equals current value.
  out[out.length - 1] = vNow;
  return out;
}

export function useDashboardData({ token } = {}) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    username: "",
    currencySymbol: "₹",
    balance: 0,
    portfolio: {},
    holdings: [],
    totalNow: 0,
    dayChange: 0,
    dayChangePct: 0,
    chart: [],
    allocations: []
  });
  const authToken = token ?? getToken();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!authToken) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "",
            username: "",
            balance: 0,
            portfolio: {},
            holdings: [],
            totalNow: 0,
            dayChange: 0,
            dayChangePct: 0,
            chart: [],
            allocations: []
          }));
        }
        return;
      }

      try {
        if (!cancelled) setState((s) => ({ ...s, loading: true, error: "" }));

        const p = await getPortfolio();
        const portfolioObj = (p && p.portfolio) || {};
        const symbols = Object.keys(portfolioObj);

        const flatHoldings = symbols
          .map((symbol) => ({
            symbol,
            qty: Number(portfolioObj[symbol])
          }))
          .filter((h) => Number.isFinite(h.qty) && h.qty > 0);

        if (flatHoldings.length === 0) {
          if (!cancelled) {
            setState((s) => ({
              ...s,
              loading: false,
              error: "",
              username: p?.username || "",
              currencySymbol: p?.currency_symbol || "₹",
              balance: Number(p?.balance || 0) || 0,
              portfolio: portfolioObj,
              holdings: [],
              totalNow: 0,
              dayChange: 0,
              dayChangePct: 0,
              chart: [],
              allocations: []
            }));
          }
          return;
        }

        const quotes = await Promise.all(
          flatHoldings.map(async (h) => {
            try {
              const q = await getStock(h.symbol);
              return { symbol: h.symbol, quote: q, ok: true };
            } catch (e) {
              return { symbol: h.symbol, quote: null, ok: false, error: e?.message || "Quote fetch failed" };
            }
          })
        );

        const merged = flatHoldings.map((h) => {
          const match = quotes.find((q) => q.symbol === h.symbol);
          const q = match?.quote;
          const price = q && Number.isFinite(Number(q.current_price)) ? Number(q.current_price) : null;
          const prev = q && Number.isFinite(Number(q.previous_close)) ? Number(q.previous_close) : null;
          const changePct = computeChangePct(price, prev);
          return {
            symbol: h.symbol,
            name: q?.name || "",
            qty: h.qty,
            price,
            previousClose: prev,
            changePct
          };
        });

        const totalNow = merged.reduce((acc, h) => acc + (h.price ? h.price * h.qty : 0), 0);
        const totalPrev = merged.reduce((acc, h) => acc + (h.previousClose ? h.previousClose * h.qty : 0), 0);
        const dayChange = totalNow - totalPrev;
        const dayChangePct = totalPrev > 0 ? (dayChange / totalPrev) * 100 : 0;

        // Allocation by current value.
        const allocRaw = merged
          .map((h) => ({
            symbol: h.symbol,
            value: (h.price ? h.price : 0) * h.qty
          }))
          .filter((x) => x.value > 0)
          .sort((a, b) => b.value - a.value);

        const allocTop = allocRaw.slice(0, 4);
        const allocTotal = allocTop.reduce((a, x) => a + x.value, 0) || 1;
        const palette = ["#2BB6FF", "#7C5CFF", "#34D399", "#FF8A4C"];
        const allocations = allocTop.map((a, i) => ({
          symbol: a.symbol,
          name: merged.find((m) => m.symbol === a.symbol)?.name || a.symbol,
          pct: clamp(Math.round((a.value / allocTotal) * 100), 0, 100),
          color: palette[i % palette.length]
        }));

        const currencySymbol = p?.currency_symbol || "₹";
        const chart = buildPortfolioSeries({
          totalNow,
          totalPrev,
          seed: merged.map((x) => `${x.symbol}:${x.qty}`).join("|")
        });

        const finalTotal = Number.isFinite(Number(p?.total_portfolio_value))
          ? Number(p.total_portfolio_value)
          : totalNow;

        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            username: p?.username || "",
            currencySymbol,
            balance: Number(p?.balance || 0) || 0,
            portfolio: portfolioObj,
            holdings: merged,
            totalNow: finalTotal,
            dayChange,
            dayChangePct,
            chart,
            allocations
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: e?.message || "Failed to load dashboard data"
          }));
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  return useMemo(() => state, [state]);
}

