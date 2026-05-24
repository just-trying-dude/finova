/** Day change % from live price vs previous close (matches broker P/L basis). */
export function dayChangePct(price, previousClose) {
  const p = Number(price);
  const prev = Number(previousClose);
  if (!Number.isFinite(p) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((p - prev) / prev) * 100;
}

export function resolveChangePct(holding) {
  const fromFields = dayChangePct(holding?.price, holding?.previousClose);
  if (fromFields != null) return fromFields;
  const cached = Number(holding?.changePct);
  return Number.isFinite(cached) ? cached : null;
}
