import { useWatchlistQuery } from "./queries/useWatchlistQueries.js";

export function useWatchlist(opts = {}) {
  return useWatchlistQuery(opts);
}
