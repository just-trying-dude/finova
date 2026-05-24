import { getMarketOverview, getMarketPage } from "../api.js";
import { STALE } from "./cacheConfig.js";
import {
  fetchPortfolioBundle,
  fetchPortfolioDashboard,
  fetchRisk,
  fetchTransactionsList,
  fetchWatchlistSnapshot,
  fetchWatchlistSymbols
} from "./queryFetchers.js";
import { queryKeys } from "./queryKeys.js";

/** Public market data — safe before login (NIFTY/SENSEX/gainers/losers/trending). */
export function prefetchPublicMarketData(queryClient) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.marketOverview(),
    queryFn: getMarketOverview,
    staleTime: STALE.marketOverview
  });
}

/** Full markets page bundle (global indices, heatmap, news). */
export function prefetchMarketsPage(queryClient, newsLimit = 8) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.marketPage(newsLimit),
    queryFn: () => getMarketPage(newsLimit),
    staleTime: STALE.marketPage
  });
}

/** Parallel bootstrap after authentication. */
export async function prefetchAuthenticatedApp(queryClient) {
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard(),
      queryFn: () => fetchPortfolioDashboard({ background: true }),
      staleTime: STALE.dashboard
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.watchlist(),
      queryFn: () => fetchWatchlistSymbols({ background: true }),
      staleTime: STALE.watchlist
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.watchlistSnapshot(),
      queryFn: () => fetchWatchlistSnapshot({ background: true }),
      staleTime: STALE.watchlistSnapshot
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.transactions(),
      queryFn: () => fetchTransactionsList({ background: true }),
      staleTime: STALE.transactions
    }),
    prefetchPublicMarketData(queryClient),
    prefetchMarketsPage(queryClient)
  ]);
}

const ROUTE_PREFETCH = {
  Dashboard: (qc) =>
    qc.prefetchQuery({
      queryKey: queryKeys.dashboard(),
      queryFn: () => fetchPortfolioDashboard(),
      staleTime: STALE.dashboard
    }),
  Markets: (qc) => prefetchMarketsPage(qc),
  Portfolio: (qc) =>
    qc.prefetchQuery({
      queryKey: queryKeys.portfolioBundle(),
      queryFn: () => fetchPortfolioBundle(),
      staleTime: STALE.portfolioBundle
    }),
  Explore: (qc) => prefetchPublicMarketData(qc),
  Watchlist: (qc) =>
    Promise.all([
      qc.prefetchQuery({
        queryKey: queryKeys.watchlistSnapshot(),
        queryFn: () => fetchWatchlistSnapshot(),
        staleTime: STALE.watchlistSnapshot
      }),
      qc.prefetchQuery({
        queryKey: queryKeys.watchlist(),
        queryFn: () => fetchWatchlistSymbols(),
        staleTime: STALE.watchlist
      })
    ]),
  Transactions: (qc) =>
    qc.prefetchQuery({
      queryKey: queryKeys.transactions(),
      queryFn: () => fetchTransactionsList(),
      staleTime: STALE.transactions
    })
};

export function prefetchNavRoute(queryClient, label) {
  const fn = ROUTE_PREFETCH[label];
  if (!fn) return;
  void fn(queryClient);
}

/** Preload lazy route chunks on sidebar hover. */
export function prefetchRouteChunk(label) {
  switch (label) {
    case "Markets":
      void import("../pages/MarketsPage.jsx");
      break;
    case "Portfolio":
      void import("../components/portfolio/PortfolioAnalyticsSection.jsx");
      break;
    case "Explore":
      void import("../components/explore/ExplorePage.jsx");
      break;
    default:
      void import("../pages/DashboardHomePage.jsx");
      break;
  }
}
