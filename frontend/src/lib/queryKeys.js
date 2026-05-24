export const queryKeys = {
  dashboard: () => ["portfolio", "dashboard"],
  watchlist: () => ["watchlist"],
  watchlistSnapshot: () => ["watchlist", "snapshot"],
  transactions: () => ["transactions"],
  marketOverview: () => ["market", "overview"],
  marketPage: (newsLimit = 8) => ["market", "page", newsLimit],
  marketNews: (symbol = "", limit = 6) => ["market", "news", symbol, limit],
  risk: () => ["risk"],
  var: () => ["var"],
  monteCarlo: () => ["monte-carlo"],
  portfolioBundle: () => ["portfolio", "bundle"],
  portfolioInsights: () => ["portfolio", "insights"],
  portfolioAnalytics: () => ["portfolio", "analytics"],
  stock: (symbol) => ["stock", symbol],
  me: () => ["user", "me"]
};
