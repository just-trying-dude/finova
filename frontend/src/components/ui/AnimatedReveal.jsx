import React from "react";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";

/** Fade + slide in when in view (once per session). */
export function AnimatedReveal({ children, delayMs = 0, style, className }) {
  const { ref, visible, animate } = useScrollReveal({ delayMs });
  const runTransition = animate && visible;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: runTransition
          ? "opacity 480ms ease-out, transform 480ms cubic-bezier(0.22, 1, 0.36, 1)"
          : "none",
        willChange: runTransition ? "opacity, transform" : "auto",
        ...style
      }}
    >
      {children}
    </div>
  );
}
