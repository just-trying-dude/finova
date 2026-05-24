import React from "react";
import { StockOverviewCard } from "./StockOverviewCard.jsx";

export function StockListSection({ title, subtitle, items, theme, emptyLabel = "No data available" }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: theme.shadow,
        overflow: "hidden"
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontWeight: 950, fontSize: 15 }}>{title}</div>
        {subtitle ? (
          <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>{subtitle}</div>
        ) : null}
      </div>

      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        {list.length === 0 ? (
          <div style={{ padding: "8px 4px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>{emptyLabel}</div>
        ) : (
          list.map((stock) => <StockOverviewCard key={stock.symbol} stock={stock} theme={theme} />)
        )}
      </div>
    </div>
  );
}
