import { useContext, useLayoutEffect, useRef, useState } from "react";
import { shouldAnimate } from "../lib/sessionAnimations.js";
import { ScrollRevealGroupContext } from "./scrollRevealGroupContext.js";
import { observeReveal } from "./observeReveal.js";

function initialVisible(disabled) {
  return disabled || !shouldAnimate();
}

/**
 * Reveal on mount if already in the viewport; otherwise when scrolled into view.
 * Inside a ScrollRevealGroup, visibility follows the group (one animation wave).
 * After the first animation wave in a session, content shows instantly.
 */
export function useScrollReveal({
  delayMs = 0,
  threshold = 0.08,
  rootMargin = "0px 0px -4% 0px",
  disabled = false
} = {}) {
  const groupVisible = useContext(ScrollRevealGroupContext);
  const ref = useRef(null);
  const [localVisible, setLocalVisible] = useState(() => initialVisible(disabled));
  const revealedRef = useRef(initialVisible(disabled));

  const inGroup = groupVisible !== undefined;

  useLayoutEffect(() => {
    if (disabled || inGroup || !shouldAnimate()) return;
    const el = ref.current;
    if (!el) return;

    return observeReveal(el, {
      threshold,
      rootMargin,
      delayMs,
      revealedRef,
      onReveal: () => setLocalVisible(true)
    });
  }, [delayMs, threshold, rootMargin, disabled, inGroup]);

  const visible = disabled ? true : inGroup ? groupVisible || !shouldAnimate() : localVisible;

  return { ref, visible, animate: shouldAnimate() };
}
