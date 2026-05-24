const SYMBOL_TO_CODE = {
  "₹": "INR",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY"
};

/** Resolve ISO currency code from API fields (prefer `currency` over symbol). */
export function resolveCurrencyCode(currency, currencySymbol) {
  const c = String(currency || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return c;
  const sym = String(currencySymbol || "").trim();
  if (SYMBOL_TO_CODE[sym]) return SYMBOL_TO_CODE[sym];
  if (sym && /^[A-Z]{3}$/i.test(sym)) return sym.toUpperCase();
  return "INR";
}

/** Trading-style price: `INR 1,234.56` */
export function formatMoney(value, { currency, currencySymbol, decimals = 2 } = {}) {
  const code = resolveCurrencyCode(currency, currencySymbol);
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const num = n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
  return `${code} ${num}`;
}

export function formatMoneyAxisTick(value, { currency, currencySymbol } = {}) {
  const code = resolveCurrencyCode(currency, currencySymbol);
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${code} ${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${code} ${(n / 1_000).toFixed(1)}k`;
  return `${code} ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatMoneyCompact(value, { currency, currencySymbol } = {}) {
  const code = resolveCurrencyCode(currency, currencySymbol);
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e12) return `${code} ${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${code} ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${code} ${(v / 1e6).toFixed(2)}M`;
  return formatMoney(v, { currency: code, decimals: 0 });
}
