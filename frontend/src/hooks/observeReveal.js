import { markSessionAnimated, shouldAnimate } from "../lib/sessionAnimations.js";

export function isInViewport(el, marginPx = 0) {
  const rect = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < h - marginPx && rect.bottom > marginPx;
}

/** Attach IO + in-view check; calls onReveal once. Returns cleanup. */
export function observeReveal(el, { threshold, rootMargin, delayMs, onReveal, revealedRef }) {
  if (!el || revealedRef.current) return () => {};

  if (!shouldAnimate()) {
    revealedRef.current = true;
    onReveal();
    return () => {};
  }

  let delayTimer = null;

  const reveal = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    markSessionAnimated();
    if (delayMs > 0) {
      delayTimer = window.setTimeout(onReveal, delayMs);
    } else {
      onReveal();
    }
  };

  if (isInViewport(el, 4)) {
    reveal();
    return () => {
      if (delayTimer) window.clearTimeout(delayTimer);
    };
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        reveal();
        observer.disconnect();
      }
    },
    { threshold, rootMargin }
  );

  observer.observe(el);

  return () => {
    observer.disconnect();
    if (delayTimer) window.clearTimeout(delayTimer);
  };
}
