import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(value, { durationMs = 280, enabled = true } = {}) {
  const target = Number(value);
  const [display, setDisplay] = useState(Number.isFinite(target) ? target : 0);
  const rafRef = useRef(0);
  const fromRef = useRef(display);

  useEffect(() => {
    if (!enabled) {
      const to = Number.isFinite(target) ? target : 0;
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const to = Number.isFinite(target) ? target : 0;
    const from = Number.isFinite(fromRef.current) ? fromRef.current : 0;
    if (from === to) return;

    const start = performance.now();
    const dur = Math.max(120, Number(durationMs) || 280);

    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, enabled]);

  return display;
}

