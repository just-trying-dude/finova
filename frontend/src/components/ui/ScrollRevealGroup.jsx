import React, { useLayoutEffect, useRef, useState } from "react";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { ScrollRevealGroupContext } from "../../hooks/scrollRevealGroupContext.js";
import { observeReveal } from "../../hooks/observeReveal.js";

/**
 * One reveal for every child (e.g. all watchlist sparklines animate together).
 */
export function ScrollRevealGroup({
  children,
  delayMs = 0,
  threshold = 0.06,
  rootMargin = "0px 0px -6% 0px",
  style,
  className
}) {
  const ref = useRef(null);
  const sessionDone = !shouldAnimate();
  const [visible, setVisible] = useState(sessionDone);
  const revealedRef = useRef(sessionDone);

  useLayoutEffect(() => {
    if (sessionDone) return;
    const el = ref.current;
    if (!el) return;

    return observeReveal(el, {
      threshold,
      rootMargin,
      delayMs,
      revealedRef,
      onReveal: () => setVisible(true)
    });
  }, [delayMs, threshold, rootMargin, sessionDone]);

  return (
    <ScrollRevealGroupContext.Provider value={visible || sessionDone}>
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    </ScrollRevealGroupContext.Provider>
  );
}
