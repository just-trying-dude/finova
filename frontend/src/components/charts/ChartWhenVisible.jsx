import React from "react";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";

/**
 * Keeps chart mounted but hidden until in view, then runs draw animation once per session.
 */
export function ChartWhenVisible({ children, style, minHeight = 0 }) {
  const sessionDone = !shouldAnimate();
  const { ref, visible } = useScrollReveal({ threshold: 0.06, disabled: sessionDone });
  const show = visible || sessionDone;
  const runChartAnim = shouldAnimate() && show;

  const child =
    React.isValidElement(children) && children.type
      ? React.cloneElement(children, { animated: runChartAnim })
      : children;

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        minHeight: minHeight || undefined,
        visibility: show ? "visible" : "hidden",
        ...style
      }}
      aria-hidden={!show}
    >
      {child}
    </div>
  );
}
