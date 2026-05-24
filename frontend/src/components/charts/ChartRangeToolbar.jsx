import React from "react";
import { CHART_RANGES } from "../../utils/chartData.js";

export function ChartRangeToolbar({ rangeId, onRangeChange, theme, accentColor, ranges = CHART_RANGES }) {
  const activeColor = accentColor || theme.accent;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {ranges.map((r) => {
        const active = r.id === rangeId;
        return (
          <button
            key={r.id}
            type="button"
            className={`tv-btn tv-btn--chip${active ? " tv-btn--active" : ""}`}
            title={r.id === "MAX" ? "Since inception" : undefined}
            aria-label={r.id === "MAX" ? "Since inception" : r.label}
            onClick={() => onRangeChange(r.id)}
            style={{
              "--tv-accent": activeColor,
              "--tv-chip": theme.chip,
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px solid ${active ? activeColor : theme.border}`,
              background: active ? `${activeColor}22` : "transparent",
              color: active ? activeColor : theme.muted,
              fontSize: 11,
              fontWeight: 900
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
