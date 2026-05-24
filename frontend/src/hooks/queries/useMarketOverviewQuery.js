import { useQuery } from "@tanstack/react-query";
import { getMarketOverview } from "../../api.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useMarketOverviewQuery({ enabled = true, refetchInterval = POLL.marketOverview } = {}) {
  const query = useQuery({
    queryKey: queryKeys.marketOverview(),
    queryFn: getMarketOverview,
    enabled,
    staleTime: STALE.marketOverview,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev
  });

  return {
    loading: query.isPending && !query.data,
    isFetching: query.isFetching,
    error: query.isError ? query.error?.message || "Failed to load market overview" : "",
    data: query.data ?? null
  };
}
