import React from "react";

function cellColor(pct, theme) {
  const v = Number(pct) || 0;
  if (v >= 2) return theme.green;
  if (v >= 0.5) return "rgba(52,211,153,0.75)";
  if (v > -0.5) return theme.muted;
  if (v > -2) return "rgba(244,63,94,0.65)";
  return theme.red;
}

function cellBg(pct) {
  const v = Number(pct) || 0;
  const alpha = Math.min(0.28, 0.06 + Math.abs(v) / 12);
  return v >= 0 ? `rgba(52,211,153,${alpha})` : `rgba(244,63,94,${alpha})`;
}

function MoversGrid({ title, stocks, theme, onStockClick }) {
  if (!stocks?.length) return null;
  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8, color: theme.muted }}>{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: 6
        }}
      >
        {stocks.map((s) => {
          const up = (s.change_pct ?? 0) >= 0;
          return (
            <button
              key={s.symbol}
              type="button"
              onClick={() => onStockClick?.(s.symbol)}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "10px 8px",
                background: cellBg(s.change_pct),
                cursor: onStockClick ? "pointer" : "default",
                textAlign: "left",
                color: theme.text
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.8 }}>{String(s.symbol).replace(".NS", "")}</div>
              <div style={{ marginTop: 4, fontWeight: 950, fontSize: 12, color: up ? theme.green : theme.red }}>
                {up ? "+" : ""}
                {Number(s.change_pct).toFixed(2)}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MarketHeatmap({ sectors, gainers, losers, theme, onStockClick }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {sectors?.length ? (
        <div>
          <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 10 }}>Sector performance</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 8
            }}
          >
            {sectors.map((s) => (
              <div
                key={s.sector}
                title={`${s.count} stocks`}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  padding: "12px 10px",
                  background: cellBg(s.change_pct),
                  minHeight: 72
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: theme.muted }}>{s.sector}</div>
                <div style={{ marginTop: 6, fontWeight: 950, fontSize: 16, color: cellColor(s.change_pct, theme) }}>
                  {(s.change_pct ?? 0) >= 0 ? "+" : ""}
                  {Number(s.change_pct).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {gainers?.length || losers?.length ? (
        <div>
          <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 10 }}>Market movers</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <MoversGrid title="Top gainers" stocks={gainers} theme={theme} onStockClick={onStockClick} />
            <MoversGrid title="Top losers" stocks={losers} theme={theme} onStockClick={onStockClick} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
