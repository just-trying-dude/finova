import { fetchJson } from "./client.js";

export async function fetchStockQuote(symbol, { token } = {}) {
  const sym = encodeURIComponent(symbol);
  return await fetchJson(`/stock/${sym}`, { token });
}

