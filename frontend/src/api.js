import { endSession, getToken, touchActivity } from "./auth.js";
import { apiUrl, getApiBaseUrl } from "./lib/apiBase.js";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatApiError(data, status, path) {
  let detail = data?.detail ?? data?.error;
  if (Array.isArray(detail)) {
    detail = detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
  }
  if (detail && typeof detail !== "string") {
    detail = String(detail);
  }

  if (status === 401 && path === "/login") {
    return detail || "Invalid username or password.";
  }
  if (status === 401) {
    return detail || "Session expired. Please sign in again.";
  }
  if (status === 503) {
    return detail || "Server unavailable. The database may be down — check Render logs.";
  }
  if (status === 404) {
    return `API not found (404) at ${path}. Check VITE_API_URL points to your Render backend (no /api prefix).`;
  }

  return detail || `Request failed (${status})`;
}

async function request(
  path,
  { method = "GET", body, auth = true, responseType = "json", endSessionOn401 = true } = {}
) {
  const headers = { Accept: responseType === "blob" ? "*/*" : "application/json" };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    if (err?.message?.includes("VITE_API_URL is not configured")) {
      throw err;
    }
    const base = getApiBaseUrl();
    const msg = err?.message || "fetch failed";
    if (!base) {
      throw new Error(
        "VITE_API_URL is not set. In Vercel, add your Render URL (e.g. https://your-api.onrender.com) and redeploy the frontend."
      );
    }
    const corsHint =
      msg === "Failed to fetch"
        ? " This usually means CORS: on Render set VERCEL_FRONTEND_URL to your exact Vercel URL (or ENV=production and redeploy the API)."
        : "";
    throw new Error(
      `Cannot reach the API at ${base}${path}. Check CORS on Render, cold start, or VITE_API_URL. (${msg})${corsHint}`
    );
  }

  let data = null;
  if (responseType === "blob") {
    data = await resp.blob();
  } else {
    const text = await resp.text();
    data = text ? safeJsonParse(text) : null;
  }

  // Only clear session on 401 for user-facing calls (not background prefetch right after login).
  if (resp.status === 401 && auth && endSessionOn401) {
    endSession("unauthorized");
  }

  if (!resp.ok) {
    const detail = formatApiError(data, resp.status, path);
    throw new Error(detail);
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
export async function getPortfolioDashboard({ background = false } = {}) {
  return await request("/portfolio/dashboard", { endSessionOn401: !background });
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

export async function getMarketIndexProfile(key) {
  const k = encodeURIComponent(String(key || "").trim());
  return await request(`/market/index/${k}`, { auth: false });
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

export async function getPortfolioBundle({ background = false } = {}) {
  return await request("/portfolio/bundle", { endSessionOn401: !background });
}

export async function getStockHistory(symbol, { days } = {}) {
  const sym = encodeURIComponent(symbol);
  const params = new URLSearchParams();
  if (days != null && Number(days) > 0) params.set("days", String(days));
  const qs = params.toString();
  return await request(`/stock-history/${sym}${qs ? `?${qs}` : ""}`, { auth: false });
}

export async function getRisk({ background = false } = {}) {
  return await request("/risk", { endSessionOn401: !background });
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

export async function getWatchlist({ background = false } = {}) {
  return await request("/watchlist", { endSessionOn401: !background });
}

export async function getWatchlistSnapshot({ background = false } = {}) {
  return await request("/watchlist/snapshot", { endSessionOn401: !background });
}

export async function getTransactions({ background = false } = {}) {
  return await request("/transactions", { endSessionOn401: !background });
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
export async function getMe({ background = false } = {}) {
  return await request("/me", { endSessionOn401: !background });
}

