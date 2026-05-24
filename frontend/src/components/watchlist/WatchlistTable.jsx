import React, { memo, useMemo } from "react";
import { displayCompanyName } from "../../utils/company.js";
import { formatMoney, resolveCurrencyCode } from "../../utils/currency.js";
import { StockLink } from "../stocks/StockLink.jsx";
import { MiniSparkline } from "../charts/MiniSparkline.jsx";
import { ScrollRevealGroup } from "../ui/ScrollRevealGroup.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";

const WatchlistRow = memo(function WatchlistRow({ row, theme, onRemove, onOpenTrade, tradeBusy, ownedQty }) {
  const symbol = row?.symbol || "";
  const quote = row || {};
  const up =
    quote.current_price != null && quote.previous_close != null
      ? quote.current_price >= quote.previous_close
      : true;
  const pct =
    quote.current_price != null && quote.previous_close > 0
      ? ((quote.current_price - quote.previous_close) / quote.previous_close) * 100
      : null;
  const color = up ? theme.green : theme.red;
  const currencyCode = resolveCurrencyCode(quote.currency, quote.currency_symbol);
  const company = displayCompanyName(symbol, quote.name);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 12,
        alignItems: "center",
        padding: "12px 14px",
        borderRadius: 14,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        marginBottom: 8
      }}
    >
      <div style={{ minWidth: 0 }}>
        <StockLink symbol={symbol} theme={theme} style={{ fontWeight: 950, fontSize: 14, color: theme.text, display: "block", textAlign: "left" }}>
          {symbol}
        </StockLink>
        <StockLink
          symbol={symbol}
          theme={theme}
          style={{
            color: theme.muted,
            fontSize: 11,
            marginTop: 2,
            fontWeight: 650,
            display: "block",
            textAlign: "left",
            width: "100%"
          }}
        >
          {company || "—"}
        </StockLink>
      </div>
      <MiniSparkline data={row.sparkline || []} theme={theme} maxPoints={36} />
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 950 }}>
          {quote.current_price != null
            ? formatMoney(quote.current_price, { currency: currencyCode })
            : "—"}
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: pct != null ? color : theme.muted }}>
          {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
        </div>
      </div>
      <button
        type="button"
        className="tv-btn tv-btn--ghost"
        onClick={() => onRemove(symbol)}
        style={{
          "--tv-accent": theme.accent,
          "--tv-chip": theme.chip,
          "--tv-text": theme.text,
          border: `1px solid ${theme.border}`,
          background: "transparent",
          color: theme.muted,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 800
        }}
      >
        Remove
      </button>
    </div>
  );
});

export function WatchlistTable({ items, loading, theme, onRemove }) {
  const sorted = useMemo(() => {
    const list = [...(items || [])];
    list.sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")));
    return list;
  }, [items]);

  if (loading && !sorted.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: 14,
              borderRadius: 14,
              border: `1px solid ${theme.border}`,
              background: theme.panel
            }}
          >
            <Skeleton width="40%" height={14} theme={theme} />
            <Skeleton width="60%" height={10} theme={theme} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return <div style={{ color: theme.muted, fontSize: 13, fontWeight: 650 }}>No symbols in watchlist.</div>;
  }

  return (
    <ScrollRevealGroup>
      <div>
        {sorted.map((row) => (
          <WatchlistRow key={row.symbol} row={row} theme={theme} onRemove={onRemove} />
        ))}
      </div>
    </ScrollRevealGroup>
  );
}
