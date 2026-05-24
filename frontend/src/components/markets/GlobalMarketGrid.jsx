import React from "react";
import { FintechLineChart } from "../charts/FintechLineChart.jsx";
import { formatIndexValue } from "../../utils/chartData.js";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { ChartSkeleton } from "../ui/Skeleton.jsx";

export function GlobalMarketGrid({ markets, theme, loading, error, onSelect }) {
  if (loading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              padding: 16
            }}
          >
            <ChartSkeleton theme={theme} height={120} />
          </div>
        ))}
      </div>
    );
  }
  if (error) return <div style={{ color: theme.red, padding: 16 }}>{error}</div>;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14
      }}
    >
      {markets.map((m) => {
        const up = (m.change_pct ?? 0) >= 0;
        const color = up ? theme.green : theme.red;
        return (
          <div
            key={m.key || m.symbol}
            role={onSelect ? "button" : undefined}
            onClick={() => onSelect?.(m)}
            style={{
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              boxShadow: theme.shadow,
              overflow: "visible",
              cursor: onSelect ? "pointer" : "default",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div style={{ padding: "14px 16px 6px", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>{m.title || m.index_name}</div>
                  <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{m.region}</div>
                </div>
                <span style={{ fontWeight: 900, fontSize: 12, color }}>
                  {up ? "+" : ""}
                  {Number(m.change_pct).toFixed(2)}%
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: 22, fontWeight: 950 }}>{formatIndexValue(m.current_value)}</div>
            </div>
            <div
              style={{
                height: 112,
                padding: "0 10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                position: "relative"
              }}
            >
              <div style={{ width: "100%", height: 96, display: "flex", alignItems: "center" }}>
                <FintechLineChart
                  data={m.chart || []}
                  theme={theme}
                  color={color}
                  valueMode="index"
                  height={96}
                  showRangeSelector={false}
                  showFooterDates={false}
                  compact
                  showTooltip
                  animated={shouldAnimate()}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
