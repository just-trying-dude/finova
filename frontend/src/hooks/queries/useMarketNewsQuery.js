import { useQuery } from "@tanstack/react-query";
import { getMarketNews } from "../../api.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useMarketNewsQuery({
  enabled = true,
  symbol = "",
  limit = 6,
  refetchInterval = POLL.marketOverview
} = {}) {
  const query = useQuery({
    queryKey: queryKeys.marketNews(symbol, limit),
    queryFn: () => getMarketNews(symbol, limit),
    enabled,
    staleTime: STALE.marketNews,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev,
    select: (r) => r?.news || []
  });

  return {
    loading: query.isPending && !query.data,
    isFetching: query.isFetching,
    items: query.data || [],
    error: query.isError ? query.error?.message || "" : ""
  };
}
