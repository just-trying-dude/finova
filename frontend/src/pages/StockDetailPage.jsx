import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addToWatchlist, getStockProfile } from "../api.js";
import { FintechLineChart } from "../components/charts/FintechLineChart.jsx";
import { NewsFeed } from "../components/news/NewsFeed.jsx";
import { TradeButtons } from "../components/trade/TradeButtons.jsx";
import { STOCK_DETAIL_CHART_RANGES } from "../utils/chartData.js";
import { ChartSkeleton, StatSkeleton } from "../components/ui/Skeleton.jsx";
import { displayCompanyName } from "../utils/company.js";
import { formatMoney, formatMoneyCompact, resolveCurrencyCode } from "../utils/currency.js";
import { Button } from "../components/ui/Button.jsx";

function Stat({ label, value, theme }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.chip }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: theme.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 950, fontSize: 14 }}>{value ?? "—"}</div>
    </div>
  );
}


export function StockDetailPage({
  theme,
  onOpenTrade,
  tradeBusy,
  ownedBySymbol = {},
  watchlistSymbols = [],
  onAddToWatchlist,
  onAction
}) {
  const { symbol: rawSymbol } = useParams();
  const navigate = useNavigate();
  const symbol = decodeURIComponent(rawSymbol || "").toUpperCase();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setState({ loading: true, error: "", data: null });
    (async () => {
      try {
        const data = await getStockProfile(symbol);
        if (!cancelled) setState({ loading: false, error: "", data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Failed to load", data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const d = state.data;
  const displayName = d ? displayCompanyName(symbol, d.name) : symbol;
  const up = (d?.change_pct ?? 0) >= 0;
  const color = up ? theme.green : theme.red;
  const currencyCode = resolveCurrencyCode(d?.currency, d?.currency_symbol);
  const inWatchlist = watchlistSymbols.some((s) => String(s || "").toUpperCase() === symbol);
  const ownedQty = ownedBySymbol[symbol] || 0;

  async function handleWatchlist() {
    if (inWatchlist) return;
    try {
      if (onAddToWatchlist) await onAddToWatchlist(symbol);
      else await addToWatchlist(symbol);
    } catch {
      // parent shows error toast when using onAddToWatchlist
    }
  }

  if (state.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
        <ChartSkeleton theme={theme} height={56} />
        <ChartSkeleton theme={theme} height={280} />
        <StatSkeleton theme={theme} count={6} />
      </div>
    );
  }
  if (state.error || !d) {
    return (
      <div style={{ padding: 24 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
            background: "none",
            border: "none",
            color: theme.accent,
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 14
          }}
        >
          ← Back
        </button>
        <div style={{ color: theme.red, fontWeight: 800 }}>{state.error || "Stock not found"}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        className="tv-btn tv-btn--neutral"
        onClick={() => navigate(-1)}
        style={{
          "--tv-accent": theme.accent,
          "--tv-chip": theme.chip,
          "--tv-text": theme.text,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          background: theme.chip,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: "8px 14px",
          color: theme.text,
          fontWeight: 800,
          fontSize: 13
        }}
      >
        ← Back
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 26, letterSpacing: "-0.5px" }}>{displayName}</div>
          <div style={{ color: theme.muted, fontSize: 13, marginTop: 4, fontWeight: 700 }}>
            {symbol} · {d.exchange || "—"} · {d.sector || "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 950 }}>
            {formatMoney(d.current_price, { currency: currencyCode })}
          </div>
          <div style={{ marginTop: 4, fontWeight: 900, color, fontSize: 15 }}>
            {up ? "+" : ""}
            {Number(d.change_pct).toFixed(2)}% today
          </div>
        </div>
      </div>

      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.panel,
          padding: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "flex-start"
        }}
      >
        <TradeButtons
          symbol={symbol}
          ownedQty={ownedQty}
          onOpenTrade={onOpenTrade}
          tradeBusy={tradeBusy}
          theme={theme}
          size="lg"
          onAction={onAction}
        />
        <Button
          variant={inWatchlist ? "ghost" : "neutral"}
          theme={theme}
          disabled={inWatchlist}
          onClick={handleWatchlist}
          style={{ padding: "14px 22px", borderRadius: 14, fontSize: 15, fontWeight: 900, minWidth: 160 }}
        >
          {inWatchlist ? "On watchlist" : "Add to watchlist"}
        </Button>
      </div>

      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.panel,
          padding: "12px 12px 16px"
        }}
      >
        <FintechLineChart
          key={symbol}
          data={d.chart || []}
          theme={theme}
          color={color}
          currencySymbol={currencyCode}
          height={280}
          ranges={STOCK_DETAIL_CHART_RANGES}
          defaultRangeId="1Y"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <Stat label="Market cap" value={formatMoneyCompact(d.market_cap, { currency: currencyCode })} theme={theme} />
        <Stat label="P/E ratio" value={d.pe_ratio != null ? Number(d.pe_ratio).toFixed(2) : "—"} theme={theme} />
        <Stat
          label="52W high"
          value={d.fifty_two_week_high != null ? formatMoney(d.fifty_two_week_high, { currency: currencyCode }) : "—"}
          theme={theme}
        />
        <Stat
          label="52W low"
          value={d.fifty_two_week_low != null ? formatMoney(d.fifty_two_week_low, { currency: currencyCode }) : "—"}
          theme={theme}
        />
        <Stat label="Volume" value={d.volume != null ? Number(d.volume).toLocaleString("en-IN") : "—"} theme={theme} />
        <Stat label="Beta" value={d.beta != null ? Number(d.beta).toFixed(2) : "—"} theme={theme} />
      </div>

      {d.description ? (
        <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.panel, padding: 16 }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>About</div>
          <p style={{ margin: 0, color: theme.muted, fontSize: 13, lineHeight: 1.55, fontWeight: 650 }}>{d.description}</p>
        </div>
      ) : null}

      <div>
        <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>Related news</div>
        <NewsFeed items={d.news || []} theme={theme} compact />
      </div>
    </div>
  );
}
