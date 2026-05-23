import { useEffect, useMemo, useState } from "react";
import { getStockSnapshot, subscribeStock } from "../stocks/stockStore.js";

function computeChangePct(currentPrice, previousClose) {
  const cur = Number(currentPrice);
  const prev = Number(previousClose);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function useStockPrice(symbol, { pollMs = 8000, freshMs = 5000 } = {}) {
  const sym = (symbol || "").trim();
  const [snap, setSnap] = useState(() => getStockSnapshot(sym));

  useEffect(() => {
    if (!sym) {
      setSnap({ symbol: "", data: null, ts: 0, loading: false, error: "" });
      return;
    }
    return subscribeStock(sym, setSnap, { pollMs, freshMs });
  }, [sym, pollMs, freshMs]);

  return useMemo(() => {
    const data = snap.data || null;
    const currentPrice = data && data.current_price != null ? Number(data.current_price) : null;
    const previousClose = data && data.previous_close != null ? Number(data.previous_close) : null;
    const currency = data?.currency || "";
    const currencySymbol = data?.currency_symbol || "";
    const name = data?.name || "";
    const changePct = computeChangePct(currentPrice, previousClose);

    return {
      currentPrice,
      previousClose,
      currency,
      currencySymbol,
      name,
      changePct,
      loading: Boolean(snap.loading) && !data,
      refreshing: Boolean(snap.loading) && Boolean(data),
      error: snap.error || ""
    };
  }, [snap]);
}

