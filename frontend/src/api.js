import { getToken, removeToken } from "./auth.js";

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
    removeToken();
  }

  if (!resp.ok) {
    const detail =
      (data && (data.detail || data.error)) ||
      (resp.status === 401 ? "Unauthorized (token missing/expired)" : "") ||
      `Request failed (${resp.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }

  return data;
}

export async function loginUser({ username, password }) {
  return await request("/login", { method: "POST", body: { username, password }, auth: false });
}

export async function registerUser({ username, password }) {
  return await request("/register", { method: "POST", body: { username, password }, auth: false });
}

export async function getPortfolio() {
  return await request("/portfolio");
}

export async function getStock(symbol) {
  const sym = encodeURIComponent(symbol);
  return await request(`/stock/${sym}`, { auth: false });
}

export async function getMarketTopStocks() {
  return await request("/market/top-stocks", { auth: false });
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

export async function getTransactions() {
  return await request("/transactions");
}

export async function addToWatchlist(symbol) {
  return await request("/watchlist/add", { method: "POST", body: { symbol } });
}

export async function removeFromWatchlist(symbol) {
  return await request("/watchlist/remove", { method: "POST", body: { symbol } });
}

export async function buyStock({ symbol, quantity }) {
  return await request("/buy", { method: "POST", body: { symbol, quantity } });
}

// Optional user endpoint (may not exist on backend)
export async function getMe() {
  return await request("/me");
}

