import { useEffect, useMemo, useState } from "react";
import { getVar } from "../api.js";

export function useVarData({ enabled } = {}) {
  const [state, setState] = useState({ loading: false, error: "", data: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ loading: true, error: "", data: null });

    (async () => {
      try {
        const r = await getVar();
        if (!cancelled) setState({ loading: false, error: "", data: r });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Failed to load VaR", data: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(() => state, [state]);
}

