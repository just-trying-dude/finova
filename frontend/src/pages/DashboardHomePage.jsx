import React from "react";
import { PortfolioTrendChart } from "../components/charts/PortfolioTrendChart.jsx";
import { StockLink } from "../components/stocks/StockLink.jsx";
import { TradeButtons } from "../components/trade/TradeButtons.jsx";
import { Card } from "../components/ui/Card.jsx";
import { AnimatedReveal } from "../components/ui/AnimatedReveal.jsx";
import { AnimatedStatValue } from "../components/ui/AnimatedStatValue.jsx";
import { displayCompanyName } from "../utils/company.js";
import { formatMoney } from "../utils/currency.js";

export function DashboardHomePage({
  theme,
  dark,
  loading,
  holdingsLoading,
  error,
  portfolio,
  changeColor,
  currencyCode,
  dashboard,
  filteredHoldings,
  onOpenTrade,
  tradeBusy,
  onAction
}) {
  return (
    <>
      {error ? (
        <Card
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow,
            padding: 14
          }}
        >
          <div style={{ color: theme.red, fontSize: 13, fontWeight: 850 }}>{error}</div>
        </Card>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14
        }}
      >
        <AnimatedReveal delayMs={0}>
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
            <div style={{ padding: 16 }}>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Total portfolio value</div>
              {loading ? (
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8 }}>—</div>
              ) : (
                <AnimatedStatValue
                  value={portfolio.total}
                  theme={theme}
                  delayMs={60}
                  format={(n) => formatMoney(n, { currency: currencyCode, decimals: 0 })}
                  style={{ fontSize: 28, marginTop: 8, letterSpacing: "-0.8px" }}
                />
              )}
              <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>Updated from your holdings</div>
            </div>
          </Card>
        </AnimatedReveal>

        <AnimatedReveal delayMs={120}>
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
            <div style={{ padding: 16 }}>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Daily P&amp;L</div>
              {loading ? (
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8, color: changeColor }}>—</div>
              ) : (
                <AnimatedStatValue
                  value={portfolio.dayChange}
                  theme={theme}
                  delayMs={140}
                  format={(n) => `${portfolio.positive ? "+" : ""}${formatMoney(n, { currency: currencyCode, decimals: 0 })}`}
                  style={{ fontSize: 28, marginTop: 8, letterSpacing: "-0.8px", color: changeColor }}
                />
              )}
              <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                {loading ? "—" : `${portfolio.positive ? "+" : ""}${Number(portfolio.dayChangePct || 0).toFixed(2)}% today`}
              </div>
            </div>
          </Card>
        </AnimatedReveal>

        <AnimatedReveal delayMs={240}>
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
            <div style={{ padding: 16 }}>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Available balance</div>
              {loading ? (
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8 }}>—</div>
              ) : (
                <AnimatedStatValue
                  value={dashboard.balance || 0}
                  theme={theme}
                  delayMs={220}
                  format={(n) => formatMoney(n, { currency: currencyCode, decimals: 0 })}
                  style={{ fontSize: 28, marginTop: 8, letterSpacing: "-0.8px" }}
                />
              )}
              <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>Ready to deploy</div>
            </div>
          </Card>
        </AnimatedReveal>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginTop: 14
        }}
      >
        <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, minWidth: 0 }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Top holdings</div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Top 3 by value</div>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {(!loading && !error
                ? [...filteredHoldings]
                    .map((h) => ({
                      ...h,
                      value: (h.price ? Number(h.price) : 0) * Number(h.qty || 0)
                    }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 3)
                : []
              ).map((h) => {
                const up = (h.changePct ?? 0) >= 0;
                const c = up ? theme.green : theme.red;
                return (
                  <div
                    key={h.symbol}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 0.7fr",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.chip
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <StockLink symbol={h.symbol} theme={theme} style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>
                        {h.symbol}
                      </StockLink>
                      <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                        <StockLink symbol={h.symbol} theme={theme} style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}>
                          {displayCompanyName(h.symbol, h.name) || "Holding"}
                        </StockLink>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: theme.muted, fontSize: 11, fontWeight: 800 }}>Holdings</div>
                      <div style={{ fontWeight: 950, marginTop: 3 }}>
                        {formatMoney(h.value, { currency: currencyCode, decimals: 0 })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", color: c, fontWeight: 950 }}>
                      {h.changePct == null ? "—" : `${up ? "+" : ""}${Number(h.changePct).toFixed(2)}%`}
                    </div>
                  </div>
                );
              })}

              {!loading && !error && filteredHoldings.length === 0 ? (
                <div style={{ padding: "12px 2px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>No holdings yet.</div>
              ) : null}

              {loading ? (
                <div style={{ padding: "12px 2px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>Loading holdings…</div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, minWidth: 0 }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Performance</div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Trend</div>
            </div>
            <div
              style={{
                marginTop: 12,
                borderRadius: 16,
                overflow: "hidden",
                border: `1px solid ${theme.border}`,
                padding: "8px 4px 4px",
                background: dark ? "rgba(43,182,255,0.04)" : "rgba(22,119,255,0.04)",
                width: "100%",
                minWidth: 1,
                minHeight: 200
              }}
            >
              <PortfolioTrendChart
                data={portfolio.chart}
                theme={theme}
                color={changeColor}
                currencySymbol={currencyCode}
                height={200}
              />
            </div>
            <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
              {loading ? "Loading portfolio…" : "Portfolio value trend"}
            </div>
          </div>
        </Card>
      </div>

      <Card
        style={{
          marginTop: 14,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadow
        }}
      >
        <div
          style={{
            padding: 18,
            paddingBottom: 10,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline"
          }}
        >
          <div>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Holdings</div>
            <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
              {holdingsLoading ? "Loading…" : `${filteredHoldings.length} stocks`}
            </div>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: `1px solid ${theme.border}`,
              background: theme.chip,
              color: theme.muted,
              fontSize: 12,
              fontWeight: 750
            }}
          >
            {holdingsLoading ? "Loading portfolio…" : error ? error : "Overview"}
          </div>
        </div>

        <div style={{ padding: 12, paddingTop: 0 }}>
          <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "visible" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr 0.9fr 0.9fr 0.8fr",
                gap: 10,
                padding: "12px 14px",
                background: theme.chip,
                color: theme.muted,
                fontSize: 11,
                fontWeight: 850,
                textTransform: "uppercase",
                letterSpacing: "0.9px"
              }}
            >
              <div>Symbol</div>
              <div style={{ textAlign: "right" }}>Qty</div>
              <div style={{ textAlign: "right" }}>Price</div>
              <div style={{ textAlign: "right" }}>% Change</div>
              <div style={{ textAlign: "right" }}>Action</div>
            </div>

            {!holdingsLoading && !error && filteredHoldings.length === 0 ? (
              <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>No stocks in portfolio.</div>
            ) : null}

            {(holdingsLoading || error ? [] : filteredHoldings).map((h, idx) => {
              const up = (h.changePct ?? 0) >= 0;
              const c = up ? theme.green : theme.red;
              return (
                <div
                  key={h.symbol}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.8fr 0.9fr 0.9fr 0.8fr",
                    gap: 10,
                    padding: "12px 14px",
                    borderTop: idx === 0 ? "none" : `1px solid ${theme.border}`,
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
                      {h.symbol.slice(0, 2)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <StockLink symbol={h.symbol} theme={theme} style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>
                        {h.symbol}
                      </StockLink>
                      <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>NSE · Equity</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 850 }}>{h.qty}</div>
                  <div style={{ textAlign: "right", fontWeight: 850 }}>
                    {h.price == null ? "—" : formatMoney(h.price, { currency: currencyCode })}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 950, color: c }}>
                    {h.changePct == null ? "—" : `${up ? "+" : ""}${Number(h.changePct).toFixed(2)}%`}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <TradeButtons
                      symbol={h.symbol}
                      ownedQty={h.qty}
                      onOpenTrade={onOpenTrade}
                      tradeBusy={tradeBusy}
                      theme={theme}
                      onAction={onAction}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
