import { useEffect, useMemo, useState } from "react";
import { getMonteCarlo } from "../api.js";

export function useMonteCarloData({ enabled } = {}) {
  const [state, setState] = useState({ loading: false, error: "", data: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ loading: true, error: "", data: null });

    (async () => {
      try {
        const r = await getMonteCarlo();
        if (!cancelled) setState({ loading: false, error: "", data: r });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Failed to load Monte Carlo", data: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => state, [state]);
}

