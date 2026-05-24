import React from "react";
import { AnimatedReveal } from "../ui/AnimatedReveal.jsx";

const SEVERITY_STYLE = {
  high: (t) => ({ border: t.red, bg: "rgba(244,63,94,0.1)" }),
  medium: (t) => ({ border: t.accent, bg: "rgba(43,182,255,0.08)" }),
  low: (t) => ({ border: t.border, bg: t.chip })
};

export function InsightsPanel({ insights, theme, loading, stagger = false }) {
  if (loading) {
    return <div style={{ color: theme.muted, fontSize: 13, fontWeight: 700 }}>Analyzing portfolio…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(insights || []).map((item, idx) => {
        const sev = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.low;
        const style = sev(theme);
        const card = (
          <div
            style={{
              borderRadius: 14,
              border: `1px solid ${style.border}`,
              background: style.bg,
              padding: "14px 16px"
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 850, color: theme.muted, textTransform: "uppercase" }}>{item.type}</div>
            <div style={{ marginTop: 4, fontWeight: 950, fontSize: 14 }}>{item.title}</div>
            <div style={{ marginTop: 6, color: theme.muted, fontSize: 13, lineHeight: 1.45, fontWeight: 650 }}>{item.body}</div>
          </div>
        );

        if (!stagger) return <div key={item.id || idx}>{card}</div>;

        return (
          <AnimatedReveal key={item.id || idx} delayMs={idx * 90}>
            {card}
          </AnimatedReveal>
        );
      })}
    </div>
  );
}
