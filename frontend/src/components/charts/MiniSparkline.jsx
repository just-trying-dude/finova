import React, { useMemo } from "react";
import { Line, LineChart, YAxis } from "recharts";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";
import { normalizeChartSeries, trendColorFromSeries } from "../../utils/chartData.js";

function sparkYDomain(series) {
  if (!series.length) return [0, 1];
  const prices = series.map((d) => d.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  let span = max - min;
  if (!Number.isFinite(span) || span < 1e-9) {
    const mid = max || min || 1;
    span = mid * 0.025;
    min = mid - span / 2;
    max = mid + span / 2;
  }
  const pad = span * 0.14;
  return [min - pad, max + pad];
}

export function MiniSparkline({ data, theme, width = 88, height = 32, maxPoints = 36, animated = true }) {
  const { ref, visible } = useScrollReveal({ threshold: 0.05, rootMargin: "0px" });
  const series = useMemo(() => normalizeChartSeries(data).slice(-maxPoints), [data, maxPoints]);
  const stroke = trendColorFromSeries(series, theme);
  const yDomain = useMemo(() => sparkYDomain(series), [series]);
  const runAnim = animated && visible && shouldAnimate();

  if (!series.length) {
    return <div style={{ width, height, background: theme.chip, borderRadius: 6, flexShrink: 0 }} />;
  }

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        flexShrink: 0,
        overflow: "hidden",
        visibility: visible ? "visible" : "hidden"
      }}
    >
      <LineChart width={width} height={height} data={series} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <YAxis hide domain={yDomain} />
        <Line
          type="linear"
          dataKey="price"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={runAnim}
          animationDuration={runAnim ? 700 : 0}
          animationEasing="ease-out"
        />
      </LineChart>
    </div>
  );
}
