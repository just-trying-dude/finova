import React, { useEffect, useState } from "react";
import { getStockHistory } from "../../api.js";
import { trendColorFromSeries } from "../../utils/chartData.js";
import { FintechLineChart } from "./FintechLineChart.jsx";

export function StockHistoryChart({ symbol, theme, currencySymbol = "INR", height = 160 }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) {
      setSeries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await getStockHistory(symbol);
        const rows = Array.isArray(res?.history) ? res.history : [];
        if (!cancelled) setSeries(rows);
      } catch {
        if (!cancelled) setSeries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div style={{ height, display: "grid", placeItems: "center", color: theme.muted, fontSize: 12, fontWeight: 750 }}>
        Loading chart…
      </div>
    );
  }

  const color = trendColorFromSeries(
    series.map((r) => ({ price: Number(r.price) })),
    theme
  );

  return (
    <FintechLineChart
      data={series}
      theme={theme}
      color={color}
      currencySymbol={currencySymbol}
      height={height}
      valueMode="currency"
    />
  );
}
