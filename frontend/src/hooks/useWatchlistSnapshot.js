import { useWatchlistSnapshotQuery } from "./queries/useWatchlistQueries.js";

export function useWatchlistSnapshot(opts = {}) {
  return useWatchlistSnapshotQuery(opts);
}
