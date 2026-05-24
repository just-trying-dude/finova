import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMarketIndexProfile } from "../api.js";
import { FintechLineChart } from "../components/charts/FintechLineChart.jsx";
import { NewsFeed } from "../components/news/NewsFeed.jsx";
import { ChartSkeleton, StatSkeleton } from "../components/ui/Skeleton.jsx";
import { STOCK_DETAIL_CHART_RANGES, formatIndexValue } from "../utils/chartData.js";

function Stat({ label, value, theme }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.chip }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: theme.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 950, fontSize: 14 }}>{value ?? "—"}</div>
    </div>
  );
}

export function MarketIndexDetailPage({ theme }) {
  const { key: rawKey } = useParams();
  const navigate = useNavigate();
  const marketKey = decodeURIComponent(rawKey || "").trim().toLowerCase();
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    if (!marketKey) return;
    let cancelled = false;
    setState({ loading: true, error: "", data: null });
    (async () => {
      try {
        const data = await getMarketIndexProfile(marketKey);
        if (!cancelled) setState({ loading: false, error: "", data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Failed to load", data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketKey]);

  const d = state.data;
  const up = (d?.change_pct ?? 0) >= 0;
  const color = up ? theme.green : theme.red;
  const title = d?.title || d?.index_name || marketKey.toUpperCase();

  const dayChangePts = useMemo(() => {
    const cur = Number(d?.current_value);
    const prev = Number(d?.previous_close);
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    return cur - prev;
  }, [d?.current_value, d?.previous_close]);

  if (state.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
        <ChartSkeleton theme={theme} height={56} />
        <ChartSkeleton theme={theme} height={280} />
        <StatSkeleton theme={theme} count={4} />
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
        <div style={{ color: theme.red, fontWeight: 800 }}>{state.error || "Market not found"}</div>
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
          <div style={{ fontWeight: 950, fontSize: 26, letterSpacing: "-0.5px" }}>{title}</div>
          <div style={{ color: theme.muted, fontSize: 13, marginTop: 4, fontWeight: 700 }}>
            {d.region || "—"} · Index · {d.symbol || marketKey}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 950 }}>{formatIndexValue(d.current_value, { withUnit: true })}</div>
          <div style={{ marginTop: 4, fontWeight: 900, color, fontSize: 15 }}>
            {up ? "+" : ""}
            {Number(d.change_pct).toFixed(2)}% today
            {dayChangePts != null ? (
              <span style={{ color: theme.muted, fontWeight: 700, marginLeft: 8 }}>
                ({up ? "+" : ""}
                {dayChangePts.toLocaleString("en-IN", { maximumFractionDigits: 2 })} pts)
              </span>
            ) : null}
          </div>
        </div>
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
          key={marketKey}
          data={d.chart || []}
          theme={theme}
          color={color}
          valueMode="index"
          height={280}
          ranges={STOCK_DETAIL_CHART_RANGES}
          defaultRangeId="1Y"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        <Stat label="Previous close" value={formatIndexValue(d.previous_close, { withUnit: true })} theme={theme} />
        <Stat label="Region" value={d.region || "—"} theme={theme} />
        <Stat
          label="52W high"
          value={
            d.fifty_two_week_high != null ? formatIndexValue(d.fifty_two_week_high, { withUnit: true }) : "—"
          }
          theme={theme}
        />
        <Stat
          label="52W low"
          value={d.fifty_two_week_low != null ? formatIndexValue(d.fifty_two_week_low, { withUnit: true }) : "—"}
          theme={theme}
        />
      </div>

      <div>
        <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>Related news</div>
        <NewsFeed items={d.news || []} theme={theme} compact />
      </div>
    </div>
  );
}
