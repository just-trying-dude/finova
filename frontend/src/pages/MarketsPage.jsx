import React from "react";
import { useNavigate } from "react-router-dom";
import { GlobalMarketGrid } from "../components/markets/GlobalMarketGrid.jsx";
import { MarketHeatmap } from "../components/markets/MarketHeatmap.jsx";
import { NewsFeed } from "../components/news/NewsFeed.jsx";
import { ChartSkeleton } from "../components/ui/Skeleton.jsx";
import { useMarketsPageQuery } from "../hooks/queries/useMarketsPageQuery.js";

export function MarketsPage({ theme }) {
  const navigate = useNavigate();
  const { global, heatmap, news } = useMarketsPageQuery({ enabled: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 950 }}>Global markets</h2>
        <GlobalMarketGrid
          markets={global.markets}
          theme={theme}
          loading={global.loading && !global.markets.length}
          error={global.error}
        />
      </section>

      <section
        style={{
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.panel,
          padding: 16
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 950 }}>Market heatmap</h2>
        {heatmap.loading && !heatmap.data ? (
          <ChartSkeleton theme={theme} height={280} />
        ) : heatmap.error && !heatmap.data ? (
          <div style={{ color: theme.red }}>{heatmap.error}</div>
        ) : (
          <MarketHeatmap
            sectors={heatmap.data?.sectors}
            stocks={[...(heatmap.data?.gainers || []), ...(heatmap.data?.losers || [])]}
            theme={theme}
            onStockClick={(sym) => navigate(`/stock/${encodeURIComponent(sym)}`)}
          />
        )}
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 950 }}>Market news</h2>
        <NewsFeed
          items={news.items}
          theme={theme}
          loading={news.loading && !news.items.length}
          error={news.error}
        />
      </section>
    </div>
  );
}
