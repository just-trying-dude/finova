/**
 * Shared React Query fetchers — must match the shape each hook stores in cache.
 * Prefetch and hooks must use the same function or cache corruption crashes the UI.
 */
import {
  getPortfolioBundle,
  getPortfolioDashboard,
  getRisk,
  getTransactions,
  getWatchlist,
  getWatchlistSnapshot
} from "../api.js";

export function normSymbol(s) {
  return (s || "").trim().toUpperCase();
}

export async function fetchWatchlistSymbols({ background = false } = {}) {
  const r = await getWatchlist({ background });
  const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : [];
  return Array.from(new Set(items));
}

export async function fetchTransactionsList({ background = false } = {}) {
  const r = await getTransactions({ background });
  return Array.isArray(r?.transactions) ? r.transactions : [];
}

export async function fetchWatchlistSnapshot({ background = false } = {}) {
  return getWatchlistSnapshot({ background });
}

export async function fetchPortfolioDashboard({ background = false } = {}) {
  return getPortfolioDashboard({ background });
}

export async function fetchPortfolioBundle({ background = false } = {}) {
  return getPortfolioBundle({ background });
}

export async function fetchRisk({ background = false } = {}) {
  return getRisk({ background });
}
