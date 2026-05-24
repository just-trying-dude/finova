import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addToWatchlist, getWatchlist, removeFromWatchlist, getWatchlistSnapshot } from "../../api.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

function normSymbol(s) {
  return (s || "").trim().toUpperCase();
}

export function useWatchlistQuery({ enabled = true } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.watchlist(),
    queryFn: async () => {
      const r = await getWatchlist();
      const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : [];
      return Array.from(new Set(items));
    },
    enabled,
    staleTime: STALE.watchlist,
    placeholderData: (prev) => prev
  });

  const add = useCallback(
    async (symbolRaw) => {
      const symbol = normSymbol(symbolRaw);
      if (!symbol) return { ok: false, error: "Enter a symbol." };
      const prev = query.data || [];
      queryClient.setQueryData(queryKeys.watchlist(), [symbol, ...prev.filter((x) => x !== symbol)]);
      try {
        const r = await addToWatchlist(symbol);
        const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : [];
        queryClient.setQueryData(queryKeys.watchlist(), Array.from(new Set(items)));
        void queryClient.invalidateQueries({ queryKey: queryKeys.watchlistSnapshot() });
        return { ok: true };
      } catch (e) {
        queryClient.setQueryData(queryKeys.watchlist(), prev);
        return { ok: false, error: e?.message || "Failed to add" };
      }
    },
    [query.data, queryClient]
  );

  const remove = useCallback(
    async (symbolRaw) => {
      const symbol = normSymbol(symbolRaw);
      if (!symbol) return { ok: false, error: "Invalid symbol." };
      const prev = query.data || [];
      queryClient.setQueryData(
        queryKeys.watchlist(),
        prev.filter((x) => x !== symbol)
      );
      try {
        const r = await removeFromWatchlist(symbol);
        const items = Array.isArray(r?.watchlist) ? r.watchlist.map(normSymbol).filter(Boolean) : [];
        queryClient.setQueryData(queryKeys.watchlist(), Array.from(new Set(items)));
        void queryClient.invalidateQueries({ queryKey: queryKeys.watchlistSnapshot() });
        return { ok: true };
      } catch (e) {
        queryClient.setQueryData(queryKeys.watchlist(), prev);
        return { ok: false, error: e?.message || "Failed to remove" };
      }
    },
    [query.data, queryClient]
  );

  return useMemo(
    () => ({
      loading: query.isPending && !query.data,
      error: query.isError ? query.error?.message || "" : "",
      items: query.data || [],
      add,
      remove,
      reload: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlist() })
    }),
    [query.isPending, query.isError, query.error, query.data, add, remove, queryClient]
  );
}

export function useWatchlistSnapshotQuery({
  enabled = true,
  refetchInterval = POLL.watchlistSnapshot
} = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.watchlistSnapshot(),
    queryFn: getWatchlistSnapshot,
    enabled,
    staleTime: STALE.watchlistSnapshot,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev
  });

  return useMemo(
    () => ({
      loading: query.isPending && !(query.data?.items?.length),
      isFetching: query.isFetching,
      items: Array.isArray(query.data?.items) ? query.data.items : [],
      error: query.isError ? query.error?.message || "Failed to load watchlist" : "",
      reload: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchlistSnapshot() })
    }),
    [query.isPending, query.isFetching, query.data, query.isError, query.error, queryClient]
  );
}
