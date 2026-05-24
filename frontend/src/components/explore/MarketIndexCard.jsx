import React from "react";
import { FintechLineChart } from "../charts/FintechLineChart.jsx";
import { formatIndexValue } from "../../utils/chartData.js";

export function MarketIndexCard({ market, theme, onSelect }) {
  if (!market || !theme) return null;

  const up = (market.change_pct ?? 0) >= 0;
  const color = up ? theme.green : theme.red;
  const value = Number(market.current_value);
  const pct = Number(market.change_pct);
  const chart = Array.isArray(market.chart) ? market.chart : [];
  const clickable = Boolean(onSelect && (market.key || market.symbol));

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => clickable && onSelect(market)}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(market);
        }
      }}
      style={{
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: theme.shadow,
        overflow: "hidden",
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease"
      }}
    >
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 15 }}>{market.title}</div>
            <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>{market.index_name}</div>
          </div>
          <span
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: `1px solid ${theme.border}`,
              background: up ? "rgba(52,211,153,0.12)" : "rgba(244,63,94,0.10)",
              color,
              fontSize: 12,
              fontWeight: 900
            }}
          >
            {Number.isFinite(pct) ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
          </span>
        </div>

        <div style={{ marginTop: 12, fontSize: 28, fontWeight: 950, letterSpacing: "-0.6px", color: theme.text }}>
          {formatIndexValue(value, { withUnit: true, decimals: 2 })}
        </div>
        <div style={{ marginTop: 4, color: theme.muted, fontSize: 11, fontWeight: 700 }}>
          Index level · today&apos;s change
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          background: up ? "rgba(52,211,153,0.03)" : "rgba(244,63,94,0.03)"
        }}
      >
        <div style={{ padding: "10px 12px 12px", minWidth: 0, width: "100%" }}>
          <FintechLineChart data={chart} theme={theme} color={color} height={200} valueMode="index" />
        </div>
      </div>
    </div>
  );
}
