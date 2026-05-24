import React from "react";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber.js";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";

export function AnimatedStatValue({
  value,
  theme,
  delayMs = 0,
  format = (n) => String(n),
  style
}) {
  const { ref, visible } = useScrollReveal({ delayMs });
  const num = Number(value);
  const animated = useAnimatedNumber(visible && Number.isFinite(num) ? num : 0, {
    durationMs: 520,
    enabled: visible && shouldAnimate()
  });

  return (
    <div ref={ref}>
      <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, letterSpacing: "-0.02em", ...style }}>
        {Number.isFinite(num) ? format(animated) : "—"}
      </div>
    </div>
  );
}
