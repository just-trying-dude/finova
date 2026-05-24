import React from "react";
import { useNavigate } from "react-router-dom";
import { displayCompanyName } from "../../utils/company.js";
import { formatMoney, resolveCurrencyCode } from "../../utils/currency.js";

export function StockOverviewCard({ stock, theme, onClick }) {
  const navigate = useNavigate();
  if (!stock) return null;

  const up = (stock.change_pct ?? 0) >= 0;
  const color = up ? theme.green : theme.red;
  const sym = String(stock.symbol || "");
  const name = displayCompanyName(sym, stock.name);
  const currencyCode = resolveCurrencyCode(stock.currency, stock.currency_symbol);
  const price = Number(stock.current_price);
  const pct = Number(stock.change_pct);

  const go = () => {
    if (onClick) onClick(stock);
    else if (sym) navigate(`/stock/${encodeURIComponent(sym)}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => e.key === "Enter" && go()}
      style={{
        borderRadius: 14,
        border: `1px solid ${theme.border}`,
        background: theme.chip,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "center",
        cursor: "pointer"
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              display: "grid",
              placeItems: "center",
              fontWeight: 950,
              fontSize: 11,
              flexShrink: 0
            }}
          >
            {sym.slice(0, 2)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 13 }}>{sym}</div>
            <div
              style={{
                color: theme.muted,
                fontSize: 11,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {name}
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 950, fontSize: 13 }}>
          {Number.isFinite(price) ? formatMoney(price, { currency: currencyCode }) : "—"}
        </div>
        <div style={{ marginTop: 4, fontWeight: 900, fontSize: 12, color: Number.isFinite(pct) ? color : theme.muted }}>
          {Number.isFinite(pct) ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
        </div>
      </div>
    </div>
  );
}
