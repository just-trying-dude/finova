import React, { memo, useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CHART_RANGES,
  DEFAULT_CHART_RANGE_ID,
  filterChartSeriesByDays,
  formatChartCurrency,
  formatChartDate,
  formatChartDateShort,
  formatCurrencyAxisTick,
  formatIndexAxisTick,
  formatIndexValue,
  getChartRangeById,
  normalizeChartSeries,
  trendColorFromSeries
} from "../../utils/chartData.js";
import { ChartRangeToolbar } from "./ChartRangeToolbar.jsx";

function makeTooltipPosition(compact) {
  return (coordinate, _payload, _index, _payloads, viewBox) => {
    if (!coordinate || !viewBox) return undefined;
    const boxW = compact ? 120 : 176;
    const boxH = compact ? 58 : 78;
    const pad = 6;
    const x = Math.min(Math.max(coordinate.x - boxW / 2, pad), Math.max(pad, viewBox.width - boxW - pad));

    if (compact) {
      const y = pad;
      return { x, y };
    }

    const y = Math.max(coordinate.y - boxH - 12, pad);
    return { x, y };
  };
}

function ChartTooltip({ active, payload, theme, valueMode, currencySymbol, compact: compactTip }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const up = (row.changePct ?? 0) >= 0;
  const changeColor = up ? theme.green : theme.red;
  const isIndex = valueMode === "index";

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: theme.shadow,
        padding: compactTip ? "8px 10px" : "10px 12px",
        minWidth: compactTip ? 128 : 168,
        pointerEvents: "none"
      }}
    >
      <div style={{ color: theme.muted, fontSize: compactTip ? 10 : 11, fontWeight: 750 }}>{formatChartDate(row.date)}</div>
      <div
        style={{
          marginTop: compactTip ? 4 : 6,
          fontSize: compactTip ? 14 : 17,
          fontWeight: 950,
          color: theme.text,
          letterSpacing: "-0.3px"
        }}
      >
        {isIndex ? formatIndexValue(row.price) : formatChartCurrency(row.price, currencySymbol)}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, color: changeColor }}>
        {Number.isFinite(row.changePct) ? `${up ? "+" : ""}${row.changePct.toFixed(2)}%` : "—"}
        <span style={{ color: theme.muted, fontWeight: 650, marginLeft: 6 }}>vs prior</span>
      </div>
    </div>
  );
}

function downsampleSeries(points, maxPoints = 400) {
  if (!points?.length || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function FintechLineChartInner({
  data: rawData,
  theme,
  height = 200,
  currencySymbol = "INR",
  valueMode = "currency",
  color,
  showRangeSelector = true,
  defaultRangeId = DEFAULT_CHART_RANGE_ID,
  rangeId: controlledRangeId,
  onRangeChange,
  showFooterDates = true,
  ranges = CHART_RANGES,
  compact = false,
  showTooltip = true,
  animated = true
}) {
  const gradientId = useId().replace(/:/g, "");

  const [internalRangeId, setInternalRangeId] = useState(defaultRangeId);
  const rangeId = controlledRangeId ?? internalRangeId;

  const setRangeId = (id) => {
    if (controlledRangeId === undefined) setInternalRangeId(id);
    onRangeChange?.(id);
  };

  const range = getChartRangeById(rangeId, ranges);

  const filteredRaw = useMemo(
    () => filterChartSeriesByDays(rawData, range.days),
    [rawData, range.days]
  );

  const series = useMemo(
    () => downsampleSeries(normalizeChartSeries(filteredRaw)),
    [filteredRaw]
  );
  const stroke = color || trendColorFromSeries(series, theme);
  const isIndex = valueMode === "index";

  const yDomain = useMemo(() => {
    if (!series.length) return [0, 1];
    const prices = series.map((d) => d.price).filter((n) => Number.isFinite(n));
    if (!prices.length) return [0, 1];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min;
    const pad = span > 0 ? span * 0.06 : Math.abs(max) * 0.008 || (isIndex ? 50 : 1);
    return [min - pad, max + pad];
  }, [series, isIndex]);

  const xTicks = useMemo(() => {
    if (series.length < 2) return series[0]?.label ? [series[0].label] : [];
    if (series.length <= 24) {
      const last = series[series.length - 1]?.label;
      return last ? [series[0]?.label, last].filter(Boolean) : [];
    }
    const mid = Math.floor(series.length / 2);
    return [series[0]?.label, series[mid]?.label, series[series.length - 1]?.label].filter(Boolean);
  }, [series]);

  useEffect(() => {
    if (controlledRangeId !== undefined) setInternalRangeId(controlledRangeId);
  }, [controlledRangeId]);

  useEffect(() => {
    setInternalRangeId(defaultRangeId);
  }, [defaultRangeId]);

  const tooltipPos = useMemo(() => makeTooltipPosition(compact), [compact]);

  const startLabel = series.length ? formatChartDateShort(series[0]?.date) : "";
  const endLabel = series.length ? formatChartDateShort(series[series.length - 1]?.date) : "";
  const yTickFormatter = isIndex
    ? formatIndexAxisTick
    : (v) => formatCurrencyAxisTick(v, currencySymbol);
  const chartMargins = compact
    ? { top: 6, right: 4, left: 4, bottom: 4 }
    : { top: 12, right: 4, left: 4, bottom: 20 };
  const yAxisWidth = compact ? 44 : 52;

  const plotHeight = Math.max(40, height);
  const hasSeries = series.length > 0;

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      {showRangeSelector ? (
        <div style={{ marginBottom: 8 }}>
          <ChartRangeToolbar
            rangeId={rangeId}
            onRangeChange={setRangeId}
            theme={theme}
            accentColor={stroke}
            ranges={ranges}
          />
        </div>
      ) : null}

      <div
        className="fintech-chart-host"
        style={{
          width: "100%",
          height: plotHeight,
          minHeight: plotHeight,
          minWidth: 0,
          flexShrink: 0,
          position: "relative"
        }}
      >
        {!hasSeries ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: theme.muted,
              fontSize: 12,
              fontWeight: 650
            }}
          >
            Data unavailable
          </div>
        ) : (
          <ComposedChart
            responsive
            style={{ width: "100%", height: "100%", maxWidth: "100%" }}
            data={series}
            margin={chartMargins}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={theme.border} strokeDasharray="3 6" vertical={false} opacity={0.55} />

            {!compact ? (
              <XAxis
                dataKey="label"
                ticks={xTicks}
                tick={{ fill: theme.muted, fontSize: 10, fontWeight: 650 }}
                axisLine={{ stroke: theme.border, strokeOpacity: 0.5 }}
                tickLine={false}
                dy={8}
                interval={0}
                minTickGap={28}
                tickMargin={6}
              />
            ) : null}

            {!compact ? (
              <YAxis
                domain={yDomain}
                orientation="right"
                tick={{ fill: theme.muted, fontSize: 10, fontWeight: 650 }}
                axisLine={false}
                tickLine={false}
                width={yAxisWidth}
                tickCount={4}
                tickFormatter={yTickFormatter}
              />
            ) : (
              <YAxis hide domain={yDomain} />
            )}

            {showTooltip ? (
              <Tooltip
                position={tooltipPos}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{
                  outline: "none",
                  zIndex: 30,
                  pointerEvents: "none",
                  overflow: "visible"
                }}
                content={
                  <ChartTooltip
                    theme={theme}
                    valueMode={valueMode}
                    currencySymbol={currencySymbol}
                    compact={compact}
                  />
                }
                cursor={{ stroke: theme.border, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
            ) : null}

            <Area
              type="linear"
              dataKey="price"
              stroke="none"
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={animated}
              animationDuration={animated ? 900 : 0}
              animationEasing="ease-out"
            />

            <Line
              type="linear"
              dataKey="price"
              stroke={stroke}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: theme.panel,
                stroke,
                strokeWidth: 2.5
              }}
              isAnimationActive={animated}
              animationDuration={animated ? 1100 : 0}
              animationEasing="ease-out"
            />
          </ComposedChart>
        )}
      </div>

      {showFooterDates && hasSeries ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            padding: "0 4px",
            fontSize: 10,
            fontWeight: 700,
            color: theme.muted
          }}
        >
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export const FintechLineChart = memo(FintechLineChartInner);

export function SparklineChart(props) {
  return <FintechLineChart {...props} data={props.points ?? props.data} color={props.stroke ?? props.color} />;
}
