import { endSession, getToken, touchActivity } from "./auth.js";

const BASE_URL = "http://127.0.0.1:8000";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, auth = true, responseType = "json" } = {}) {
  const headers = { Accept: responseType === "blob" ? "*/*" : "application/json" };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Network error. Is the backend running on http://127.0.0.1:8000?");
  }

  let data = null;
  if (responseType === "blob") {
    data = await resp.blob();
  } else {
    const text = await resp.text();
    data = text ? safeJsonParse(text) : null;
  }

  if (resp.status === 401) {
    endSession("unauthorized");
  }

  if (!resp.ok) {
    const detail =
      (data && (data.detail || data.error)) ||
      (resp.status === 401 ? "Unauthorized (token missing/expired)" : "") ||
      `Request failed (${resp.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }

  if (auth && resp.ok) {
    touchActivity();
  }

  return data;
}

export async function loginUser({ username, password, remember_me = false }) {
  return await request("/login", {
    method: "POST",
    body: { username, password, remember_me: Boolean(remember_me) },
    auth: false
  });
}

export async function registerUser({ username, password }) {
  return await request("/register", { method: "POST", body: { username, password }, auth: false });
}

export async function getPortfolio() {
  return await request("/portfolio");
}

/** Single request for dashboard home (holdings, chart, allocations). */
export async function getPortfolioDashboard() {
  return await request("/portfolio/dashboard");
}

export async function getPortfolioHistory() {
  return await request("/portfolio/history");
}

export async function getStock(symbol) {
  const sym = encodeURIComponent(symbol);
  return await request(`/stock/${sym}`, { auth: false });
}

export async function searchStocks(q, limit = 10) {
  const params = new URLSearchParams({ q: String(q || "").trim(), limit: String(limit) });
  return await request(`/search?${params.toString()}`, { auth: false });
}

export async function getMarketTopStocks() {
  return await request("/market/top-stocks", { auth: false });
}

export async function getMarketOverview() {
  return await request("/market/overview", { auth: false });
}

export async function getMarketGlobal() {
  return await request("/market/global", { auth: false });
}

export async function getMarketNews(symbol = "", limit = 12) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbol) params.set("symbol", symbol);
  return await request(`/market/news?${params.toString()}`, { auth: false });
}

export async function getMarketHeatmap() {
  return await request("/market/heatmap", { auth: false });
}

/** Batched markets page payload (global + heatmap + news) in one request. */
export async function getMarketPage(newsLimit = 8) {
  const params = new URLSearchParams({ news_limit: String(newsLimit) });
  return await request(`/market/page?${params.toString()}`, { auth: false });
}

export async function getStockProfile(symbol) {
  const sym = encodeURIComponent(symbol);
  return await request(`/stock/${sym}/profile`, { auth: false });
}

export async function getPortfolioInsights() {
  return await request("/portfolio/insights");
}

export async function getPortfolioAnalytics() {
  return await request("/portfolio/analytics");
}

export async function getPortfolioBundle() {
  return await request("/portfolio/bundle");
}

export async function getStockHistory(symbol, { days } = {}) {
  const sym = encodeURIComponent(symbol);
  const params = new URLSearchParams();
  if (days != null && Number(days) > 0) params.set("days", String(days));
  const qs = params.toString();
  return await request(`/stock-history/${sym}${qs ? `?${qs}` : ""}`, { auth: false });
}

export async function getRisk() {
  return await request("/risk");
}

export async function getVar() {
  return await request("/var");
}

export async function getMonteCarlo() {
  return await request("/monte-carlo");
}

export async function getPlotPortfolioHistory() {
  return await request("/plot/portfolio-history", { responseType: "blob" });
}

export async function getPlotReturnsDistribution() {
  return await request("/plot/returns-distribution", { responseType: "blob" });
}

export async function getPlotMonteCarlo() {
  return await request("/plot/monte-carlo", { responseType: "blob" });
}

export async function getWatchlist() {
  return await request("/watchlist");
}

export async function getWatchlistSnapshot() {
  return await request("/watchlist/snapshot");
}

export async function getTransactions() {
  return await request("/transactions");
}

export async function addToWatchlist(symbol) {
  return await request("/watchlist/add", { method: "POST", body: { symbol } });
}

export async function removeFromWatchlist(symbol) {
  return await request("/watchlist/remove", { method: "POST", body: { symbol } });
}

export async function buyStock({ symbol, quantity, password }) {
  return await request("/buy", { method: "POST", body: { symbol, quantity, password } });
}

export async function sellStock({ symbol, quantity, password }) {
  return await request("/sell", { method: "POST", body: { symbol, quantity, password } });
}

// Optional user endpoint (may not exist on backend)
export async function getMe() {
  return await request("/me");
}

