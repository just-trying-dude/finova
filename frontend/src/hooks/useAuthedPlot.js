import { useEffect, useMemo, useState } from "react";

export function useAuthedPlot(fetchBlobFn, { enabled } = {}) {
  const [state, setState] = useState({ loading: false, error: "", url: "" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let objectUrl = "";
    setState({ loading: true, error: "", url: "" });

    (async () => {
      try {
        const blob = await fetchBlobFn();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setState({ loading: false, error: "", url: objectUrl });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Failed to load chart", url: "" });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, fetchBlobFn]);

  return useMemo(() => state, [state]);
}

