import React, { memo, useMemo } from "react";
import { FintechLineChart } from "../charts/FintechLineChart.jsx";
import { ChartWhenVisible } from "../charts/ChartWhenVisible.jsx";
import { InsightsPanel } from "./InsightsPanel.jsx";
import { SectorAllocationChart } from "./SectorAllocationChart.jsx";
import { ChartSkeleton, StatSkeleton } from "../ui/Skeleton.jsx";
import { AnimatedReveal } from "../ui/AnimatedReveal.jsx";
import { AnimatedStatValue } from "../ui/AnimatedStatValue.jsx";
import { Card } from "../ui/Card.jsx";
import { formatMoney } from "../../utils/currency.js";
import { usePortfolioBundleQuery } from "../../hooks/queries/usePortfolioBundleQuery.js";
import { POLL } from "../../lib/cacheConfig.js";

function riskLevel(vol) {
  if (!Number.isFinite(vol) || vol <= 0) return "—";
  if (vol < 0.18) return "Low";
  if (vol < 0.32) return "Moderate";
  return "High";
}

function metricCard(theme, label, children, delayMs = 0) {
  return (
    <AnimatedReveal delayMs={delayMs}>
      <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: theme.muted, fontWeight: 800, letterSpacing: "0.04em" }}>{label}</div>
          {children}
        </div>
      </Card>
    </AnimatedReveal>
  );
}

function PortfolioAnalyticsSectionInner({ theme, currencySymbol: currencyCode = "INR", enabled }) {
  const bundle = usePortfolioBundleQuery({
    enabled,
    refetchInterval: false
  });

  const analytics = bundle.data?.analytics;
  const insights = bundle.data?.insights?.insights || [];
  const risk = bundle.data?.risk;
  const varData = bundle.data?.var;
  const monte = bundle.data?.monte_carlo;

  const sectors = analytics?.sectors || [];
  const divScore = analytics?.diversification_score ?? 0;
  const volRaw = risk?.portfolio_volatility;
  const volPct = volRaw != null ? Number(volRaw) * 100 : null;

  const changeColor = useMemo(
    () => ((analytics?.history?.length || 0) >= 2 ? theme.accent : theme.muted),
    [analytics?.history?.length, theme.accent, theme.muted]
  );

  if (bundle.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <StatSkeleton theme={theme} count={4} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <ChartSkeleton theme={theme} height={88} />
          <ChartSkeleton theme={theme} height={88} />
          <ChartSkeleton theme={theme} height={88} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.85fr", gap: 14 }}>
          <ChartSkeleton theme={theme} height={260} />
          <ChartSkeleton theme={theme} height={260} />
        </div>
        <ChartSkeleton theme={theme} height={120} />
      </div>
    );
  }

  if (bundle.error) {
    return (
      <div style={{ padding: 16, color: theme.red, fontSize: 13, fontWeight: 750 }}>{bundle.error}</div>
    );
  }

  const riskHint =
    !risk && (analytics?.holdings?.length || 0) > 0
      ? "Risk metrics are updating — refresh in a moment or check that holdings have recent price history."
      : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 14 }}>
      {riskHint ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: theme.chip,
            border: `1px solid ${theme.border}`,
            color: theme.muted,
            fontSize: 12,
            fontWeight: 650
          }}
        >
          {riskHint}
        </div>
      ) : null}

      {/* Risk metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {metricCard(
          theme,
          "Portfolio volatility",
          volPct != null ? (
            <AnimatedStatValue
              value={volPct}
              theme={theme}
              delayMs={0}
              format={(n) => `${n.toFixed(1)}%`}
              style={{ color: theme.text }}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>—</div>
          ),
          0
        )}
        {metricCard(
          theme,
          "Value at Risk (95%)",
          varData?.VaR_95 != null ? (
            <AnimatedStatValue
              value={varData.VaR_95}
              theme={theme}
              delayMs={80}
              format={(n) => formatMoney(n, { currency: currencyCode, decimals: 0 })}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>—</div>
          ),
          80
        )}
        {metricCard(
          theme,
          "Risk level",
          <AnimatedReveal delayMs={160}>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{riskLevel(volRaw)}</div>
          </AnimatedReveal>,
          160
        )}
        {metricCard(
          theme,
          "Diversification",
          <AnimatedStatValue value={divScore} theme={theme} delayMs={240} format={(n) => `${Math.round(n)}/100`} />,
          240
        )}
      </div>

      {/* Monte Carlo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {[
          { label: "Expected (median)", value: monte?.expected_value, delay: 320 },
          { label: "Pessimistic (5th %ile)", value: monte?.worst_case, delay: 400 },
          { label: "Optimistic (95th %ile)", value: monte?.best_case, delay: 480 }
        ].map((mc) =>
          metricCard(
            theme,
            mc.label,
            mc.value != null ? (
              <AnimatedStatValue
                value={mc.value}
                theme={theme}
                delayMs={mc.delay}
                format={(n) => formatMoney(n, { currency: currencyCode, decimals: 0 })}
              />
            ) : (
              <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>—</div>
            ),
            mc.delay
          )
        )}
      </div>

      {/* History + sector allocation */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 14,
          alignItems: "stretch"
        }}
      >
        <AnimatedReveal delayMs={120}>
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, height: "100%" }}>
            <div style={{ padding: 18 }}>
              <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 12 }}>Portfolio history</div>
              <ChartWhenVisible minHeight={240}>
                <FintechLineChart
                  data={analytics?.history || []}
                  theme={theme}
                  color={changeColor}
                  currencySymbol={currencyCode}
                  height={240}
                  showRangeSelector
                  animated
                />
              </ChartWhenVisible>
            </div>
          </Card>
        </AnimatedReveal>

        <AnimatedReveal delayMs={200}>
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, height: "100%" }}>
            <div style={{ padding: 18 }}>
              <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 12 }}>Sector allocation</div>
              <SectorAllocationChart sectors={sectors} theme={theme} />
            </div>
          </Card>
        </AnimatedReveal>
      </div>

      {/* Insights */}
      <AnimatedReveal delayMs={280}>
        <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Portfolio insights</div>
              <div style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}>Refreshes with live quotes</div>
            </div>
            <InsightsPanel insights={insights} theme={theme} stagger />
          </div>
        </Card>
      </AnimatedReveal>
    </div>
  );
}

export const PortfolioAnalyticsSection = memo(PortfolioAnalyticsSectionInner);
