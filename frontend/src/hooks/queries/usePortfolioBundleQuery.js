import { useQuery } from "@tanstack/react-query";
import { getPortfolioBundle } from "../../api.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function usePortfolioBundleQuery({ enabled = true, refetchInterval = POLL.dashboard } = {}) {
  const query = useQuery({
    queryKey: queryKeys.portfolioBundle(),
    queryFn: getPortfolioBundle,
    enabled,
    staleTime: STALE.portfolioBundle,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev
  });

  return {
    loading: query.isPending && !query.data,
    isFetching: query.isFetching,
    data: query.data ?? null,
    error: query.isError ? query.error?.message || "Failed" : ""
  };
}
