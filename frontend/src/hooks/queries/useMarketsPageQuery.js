import { useQuery } from "@tanstack/react-query";
import { getMarketPage } from "../../api.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useMarketsPageQuery({ enabled = true, newsLimit = 8, refetchInterval = POLL.marketPage } = {}) {
  const query = useQuery({
    queryKey: queryKeys.marketPage(newsLimit),
    queryFn: () => getMarketPage(newsLimit),
    enabled,
    staleTime: STALE.marketPage,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev
  });

  const payload = query.data;

  return {
    isLoading: query.isPending && !payload,
    isFetching: query.isFetching,
    error: query.isError ? query.error?.message || "Failed to load markets" : "",
    global: {
      markets: payload?.global?.markets || [],
      loading: query.isPending && !payload?.global,
      error: ""
    },
    heatmap: {
      data: payload?.heatmap ?? null,
      loading: query.isPending && !payload?.heatmap,
      error: ""
    },
    news: {
      items: payload?.news?.news || [],
      loading: query.isPending && !payload?.news,
      error: ""
    }
  };
}
