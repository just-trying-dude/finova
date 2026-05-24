/** Stale-while-revalidate windows (ms). */
export const STALE = {
  dashboard: 12_000,
  watchlist: 30_000,
  watchlistSnapshot: 10_000,
  marketOverview: 45_000,
  marketPage: 45_000,
  marketNews: 90_000,
  transactions: 60_000,
  risk: 120_000,
  portfolioBundle: 25_000,
  portfolioInsights: 90_000,
  stock: 12_000
};

/** Background refetch intervals while queries are active (ms). */
export const POLL = {
  dashboard: 15_000,
  watchlistSnapshot: 12_000,
  marketOverview: 45_000,
  marketPage: 60_000,
  stockPrice: 12_000
};

export const GC_TIME = 30 * 60_000;
