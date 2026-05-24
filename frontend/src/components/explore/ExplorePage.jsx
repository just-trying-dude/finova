import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addToWatchlist, getStock } from "../../api.js";
import { StockHistoryChart } from "../charts/StockHistoryChart.jsx";
import { useMarketOverview } from "../../hooks/useMarketOverview.js";
import { displayCompanyName } from "../../utils/company.js";
import { formatMoney, resolveCurrencyCode } from "../../utils/currency.js";
import { StockLink } from "../stocks/StockLink.jsx";
import { Button } from "../ui/Button.jsx";
import { TradeButtons } from "../trade/TradeButtons.jsx";
import { StockSearchAutocomplete } from "../search/StockSearchAutocomplete.jsx";
import { MarketIndexCard } from "./MarketIndexCard.jsx";
import { StockListSection } from "./StockListSection.jsx";

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function ExploreSearchCard({
  theme,
  ownedBySymbol,
  openTradeModal,
  tradeBusy,
  watchlistItems,
  initialPick,
  onAddToWatchlist,
  onAction
}) {
  const [search, setSearch] = useState({ status: "idle", data: null, error: "" });
  const [notice, setNotice] = useState({ message: "", error: "" });
  const pickedRef = useRef("");

  async function loadSelection(item) {
    if (!item?.symbol) return;
    setSearch({ status: "loading", data: null, error: "" });
    setNotice({ message: "", error: "" });
    try {
      const q = await getStock(item.symbol);
      setSearch({ status: "success", data: q, error: "" });
    } catch (e) {
      setSearch({ status: "error", data: null, error: e?.message || "Stock not found" });
    }
  }

  const result = search.status === "success" ? search.data : null;

  useEffect(() => {
    const sym = initialPick?.symbol;
    if (!sym || pickedRef.current === sym) return;
    pickedRef.current = sym;
    loadSelection(initialPick);
  }, [initialPick]);

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: theme.shadow,
        padding: 16
      }}
    >
      <div style={{ fontWeight: 950, fontSize: 15 }}>Search stocks</div>
      <div style={{ color: theme.muted, fontSize: 12, marginTop: 4, fontWeight: 650 }}>
        Search by company name or symbol — no ticker format needed
      </div>

      <div style={{ marginTop: 12 }}>
        <StockSearchAutocomplete
          theme={theme}
          placeholder="Try tata, google, infy, reliance…"
          onSelect={loadSelection}
        />
      </div>

      {search.status === "loading" ? (
        <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 750 }}>Looking up…</div>
      ) : null}

      {search.status === "error" ? (
        <div style={{ marginTop: 10, color: theme.red, fontSize: 12, fontWeight: 850 }}>{search.error}</div>
      ) : null}

      {result ? (
        <div style={{ marginTop: 12, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
          {(() => {
            const cur = Number(result.current_price);
            const prev = Number(result.previous_close);
            const pct = prev > 0 && Number.isFinite(cur) && Number.isFinite(prev) ? ((cur - prev) / prev) * 100 : null;
            const up = (pct ?? 0) >= 0;
            const c = up ? theme.green : theme.red;
            const symbol = result.symbol;
            const name = displayCompanyName(symbol, result.name);
            const currencyCode = resolveCurrencyCode(result.currency, result.currency_symbol);
            const inWatchlist = (watchlistItems || []).some(
              (x) => String(x || "").toUpperCase() === String(symbol || "").toUpperCase()
            );

            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.65fr 0.5fr auto",
                  gap: 10,
                  padding: "12px 14px",
                  alignItems: "center"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 16,
                      background: theme.chip,
                      border: `1px solid ${theme.border}`,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 950,
                      fontSize: 12
                    }}
                  >
                    {String(symbol).slice(0, 2)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <StockLink symbol={symbol} theme={theme} style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>
                      {symbol}
                    </StockLink>
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
                      <StockLink symbol={symbol} theme={theme} style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}>
                        {name}
                      </StockLink>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right", fontWeight: 850 }}>
                  {formatMoney(cur, { currency: currencyCode })}
                </div>

                <div style={{ textAlign: "right", fontWeight: 950, color: pct == null ? theme.muted : c, fontSize: 13 }}>
                  {pct == null ? "—" : `${up ? "+" : ""}${pct.toFixed(2)}%`}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <Button
                    variant="accent"
                    theme={theme}
                    onClick={async () => {
                      if (inWatchlist) return;
                      try {
                        if (onAddToWatchlist) await onAddToWatchlist(symbol);
                        else {
                          await addToWatchlist(symbol);
                          onAction?.(`Added ${symbol} to watchlist`);
                        }
                        setNotice({ message: "Added to watchlist.", error: "" });
                      } catch (e) {
                        setNotice({ message: "", error: e?.message || "Failed to add to watchlist." });
                        if (!onAddToWatchlist) onAction?.(e?.message || "Failed to add to watchlist", "error");
                      }
                    }}
                    disabled={inWatchlist}
                    style={{ padding: "8px 10px", borderRadius: 12, fontSize: 12 }}
                  >
                    {inWatchlist ? "In watchlist" : "Watchlist"}
                  </Button>
                  <TradeButtons
                    symbol={symbol}
                    ownedQty={ownedBySymbol[String(symbol || "").toUpperCase()] || 0}
                    onOpenTrade={openTradeModal}
                    tradeBusy={tradeBusy}
                    theme={theme}
                    onAction={onAction}
                  />
                </div>
              </div>
            );
          })()}
          {result?.symbol ? (
            <div style={{ borderTop: `1px solid ${theme.border}`, padding: "10px 12px 12px" }}>
              <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850, marginBottom: 8 }}>Price history</div>
              <StockHistoryChart
                symbol={result.symbol}
                theme={theme}
                currencySymbol={resolveCurrencyCode(result.currency, result.currency_symbol)}
                height={170}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {notice.message ? (
        <div
          style={{
            marginTop: 10,
            padding: "9px 12px",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: theme.chip,
            color: theme.green,
            fontSize: 12,
            fontWeight: 850
          }}
        >
          {notice.message}
        </div>
      ) : null}

      {notice.error ? (
        <div
          style={{
            marginTop: 10,
            padding: "9px 12px",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: theme.chip,
            color: theme.red,
            fontSize: 12,
            fontWeight: 850
          }}
        >
          {notice.error}
        </div>
      ) : null}
    </div>
  );
}

export function ExplorePage({
  theme,
  ownedBySymbol,
  openTradeModal,
  tradeBusy,
  watchlistItems,
  onAddToWatchlist,
  onAction
}) {
  const location = useLocation();
  const searchPick = location.state?.searchPick ?? null;
  const market = useMarketOverview({ enabled: true });
  const isMobile = useIsMobile();

  return (
    <div style={{ width: "100%" }}>
      <div>
        <ExploreSearchCard
          theme={theme}
          ownedBySymbol={ownedBySymbol}
          openTradeModal={openTradeModal}
          tradeBusy={tradeBusy}
          watchlistItems={watchlistItems}
          initialPick={searchPick}
          onAddToWatchlist={onAddToWatchlist}
          onAction={onAction}
        />
      </div>

      {market.loading ? (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 18,
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            color: theme.muted,
            fontSize: 13,
            fontWeight: 750
          }}
        >
          Loading market overview…
        </div>
      ) : null}

      {market.error ? (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 18,
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            color: theme.red,
            fontSize: 13,
            fontWeight: 850
          }}
        >
          {market.error}
        </div>
      ) : null}

      {market.data ? (
        <>
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 14
            }}
          >
            {market.data.nse ? <MarketIndexCard market={market.data.nse} theme={theme} /> : null}
            {market.data.bse ? <MarketIndexCard market={market.data.bse} theme={theme} /> : null}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 14
            }}
          >
            <StockListSection
              title="Top Gainers"
              subtitle="Highest % change today"
              items={market.data.top_gainers}
              theme={theme}
              emptyLabel="No gainers today"
            />
            <StockListSection
              title="Top Losers"
              subtitle="Largest declines today"
              items={market.data.top_losers}
              theme={theme}
              emptyLabel="No losers today"
            />
            <div style={{ gridColumn: isMobile ? "auto" : "span 1" }}>
              <StockListSection
                title="Trending Stocks"
                subtitle="Most active by movement"
                items={market.data.trending}
                theme={theme}
                emptyLabel="No trending stocks"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
