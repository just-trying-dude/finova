import { useEffect, useMemo, useState } from "react";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api.js";

function normSymbol(s) {
  return (s || "").trim().toUpperCase();
}

export function useWatchlist({ enabled } = {}) {
  const [state, setState] = useState({
    loading: false,
    error: "",
    items: []
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));

    (async () => {
      try {
        const r = await getWatchlist();
        const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : [];
        if (!cancelled) setState({ loading: false, error: "", items: Array.from(new Set(items)) });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e?.message || "Failed to load watchlist" }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function add(symbolRaw) {
    const symbol = normSymbol(symbolRaw);
    if (!symbol) return { ok: false, error: "Enter a symbol." };

    const prev = state.items;
    const next = prev.includes(symbol) ? prev : [symbol, ...prev];
    setState((s) => ({ ...s, items: next, error: "" }));

    try {
      const r = await addToWatchlist(symbol);
      const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : next;
      setState((s) => ({ ...s, items: Array.from(new Set(items)) }));
      return { ok: true };
    } catch (e) {
      // rollback
      setState((s) => ({ ...s, items: prev, error: e?.message || "Failed to add" }));
      return { ok: false, error: e?.message || "Failed to add" };
    }
  }

  async function remove(symbolRaw) {
    const symbol = normSymbol(symbolRaw);
    if (!symbol) return;

    const prev = state.items;
    const next = prev.filter((x) => x !== symbol);
    setState((s) => ({ ...s, items: next, error: "" }));

    try {
      const r = await removeFromWatchlist(symbol);
      const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : next;
      setState((s) => ({ ...s, items: Array.from(new Set(items)) }));
    } catch (e) {
      // rollback
      setState((s) => ({ ...s, items: prev, error: e?.message || "Failed to remove" }));
    }
  }

  return useMemo(
    () => ({
      loading: state.loading,
      error: state.error,
      items: state.items,
      add,
      remove
    }),
    [state.loading, state.error, state.items]
  );
}

