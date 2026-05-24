import { formatMoney, formatMoneyAxisTick } from "./currency.js";

export function formatChartDate(isoDate) {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return String(isoDate);
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(d);
  } catch {
    return String(isoDate);
  }
}

export function formatChartCurrency(value, currencyCode = "INR") {
  return formatMoney(value, { currency: currencyCode });
}

/** Market index level (points, not currency). */
export function formatIndexValue(value, { withUnit = true, decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
  return withUnit ? `${formatted} pts` : formatted;
}

/** Compact Y-axis tick for large index values (e.g. 24.8k). */
export function formatIndexAxisTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatChartDateShort(isoDate) {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return String(isoDate);
    return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(d);
  } catch {
    return String(isoDate);
  }
}

/** Keep rows with date on or after (today - days). `days: null` = full series (since inception). */
export function filterChartSeriesByDays(rows, days) {
  if (!rows?.length) return [];
  if (days == null) return rows;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = rows.filter((r) => {
    const d = new Date(r.date);
    return !Number.isNaN(d.getTime()) && d >= cutoff;
  });
  return filtered.length >= 2 ? filtered : rows.slice(-Math.min(days, rows.length));
}

export const STOCK_DETAIL_CHART_RANGES = [
  { id: "1W", label: "1W", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "MAX", label: "All", days: null }
];

export const CHART_RANGES = [
  { id: "1W", label: "1W", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 90 },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "3Y", label: "3Y", days: 365 * 3 },
  { id: "MAX", label: "All", days: null }
];

export const DEFAULT_CHART_RANGE_ID = "1Y";

/** @deprecated Use CHART_RANGES */
export const INDEX_CHART_RANGES = CHART_RANGES;

export function getChartRangeById(rangeId, ranges = CHART_RANGES) {
  return ranges.find((r) => r.id === rangeId) ?? ranges.find((r) => r.id === DEFAULT_CHART_RANGE_ID);
}

/** Compact Y-axis tick for currency values. */
export function formatCurrencyAxisTick(value, currencyCode = "INR") {
  return formatMoneyAxisTick(value, { currency: currencyCode });
}

/**
 * Accepts number[] or { date, price }[] and returns enriched rows for Recharts.
 */
export function normalizeChartSeries(raw, { points } = {}) {
  if (!raw?.length) return [];

  let rows = [];

  if (typeof raw[0] === "number") {
    const n = points ?? raw.length;
    const now = new Date();
    rows = raw.map((price, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (raw.length - 1 - i));
      return { date: d.toISOString().slice(0, 10), price: Number(price) };
    });
  } else {
    rows = raw.map((row) => ({
      date: row.date ?? row.label ?? "",
      price: Number(row.price ?? row.value)
    }));
  }

  rows = rows.filter((r) => Number.isFinite(r.price));

  const first = rows[0]?.price ?? 0;

  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1].price : row.price;
    const changePct = prev > 0 ? ((row.price - prev) / prev) * 100 : 0;
    const changeFromStartPct = first > 0 ? ((row.price - first) / first) * 100 : 0;
    return {
      ...row,
      label: formatChartDate(row.date),
      changePct,
      changeFromStartPct
    };
  });
}

export function trendColorFromSeries(data, theme) {
  if (!data?.length) return theme?.accent || "#2BB6FF";
  const first = data[0].price;
  const last = data[data.length - 1].price;
  const up = last >= first;
  return up ? theme?.green || "#14B86E" : theme?.red || "#E5485D";
}
