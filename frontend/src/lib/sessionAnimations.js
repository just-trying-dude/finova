/** Entrance animations run on every full page load / refresh. */
export function shouldAnimate() {
  return true;
}

export function markSessionAnimated() {
  /* no-op — animations are not suppressed across in-app navigation */
}
