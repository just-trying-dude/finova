const COMPANY_BY_SYMBOL = {
  "TCS.NS": "Tata Consultancy Services",
  "INFY.NS": "Infosys",
  "RELIANCE.NS": "Reliance Industries",
  "HDFCBANK.NS": "HDFC Bank",
  "ICICIBANK.NS": "ICICI Bank",
  "SBIN.NS": "State Bank of India",
  "ITC.NS": "ITC",
  "LT.NS": "Larsen & Toubro",
  "BHARTIARTL.NS": "Bharti Airtel",
  "ASIANPAINT.NS": "Asian Paints",
  "KOTAKBANK.NS": "Kotak Mahindra Bank",
  "HINDUNILVR.NS": "Hindustan Unilever",
  "AXISBANK.NS": "Axis Bank",
  "WIPRO.NS": "Wipro",
  "MARUTI.NS": "Maruti Suzuki",
  "TITAN.NS": "Titan Company",
  "BAJFINANCE.NS": "Bajaj Finance",
  "SUNPHARMA.NS": "Sun Pharmaceutical",
  "TATAMOTORS.NS": "Tata Motors",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  RELIANCE: "Reliance Industries",
  HDFCBANK: "HDFC Bank",
  ICICIBANK: "ICICI Bank",
  SBIN: "State Bank of India",
  ITC: "ITC",
  KOTAKBANK: "Kotak Mahindra Bank",
  HINDUNILVR: "Hindustan Unilever",
  AXISBANK: "Axis Bank",
  WIPRO: "Wipro"
};

function baseTicker(symbol) {
  return (symbol || "").toUpperCase().trim().replace(/\.(NS|BO)$/i, "");
}

export function companyNameForSymbol(symbol) {
  const s = (symbol || "").toUpperCase().trim();
  if (!s) return "";
  return COMPANY_BY_SYMBOL[s] || COMPANY_BY_SYMBOL[baseTicker(s)] || "";
}

/** Prefer API name unless it is just the ticker repeated. */
export function displayCompanyName(symbol, apiName) {
  const sym = (symbol || "").toUpperCase().trim();
  const base = baseTicker(sym);
  const raw = (apiName || "").trim();
  if (raw) {
    const norm = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const symNorm = sym.replace(/[^A-Z0-9]/g, "");
    const baseNorm = base.replace(/[^A-Z0-9]/g, "");
    if (norm !== symNorm && norm !== baseNorm) return raw;
  }
  const mapped = companyNameForSymbol(sym);
  if (mapped) return mapped;
  if (!base) return sym;
  return base.charAt(0) + base.slice(1).toLowerCase();
}

export function normalizeStockInput(raw) {
  return (raw || "").trim().toUpperCase();
}
