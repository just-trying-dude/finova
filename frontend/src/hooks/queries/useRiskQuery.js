import { useQuery } from "@tanstack/react-query";
import { getRisk } from "../../api.js";
import { STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useRiskQuery({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.risk(),
    queryFn: getRisk,
    enabled,
    staleTime: STALE.risk,
    placeholderData: (prev) => prev
  });

  return {
    loading: query.isPending && !query.data,
    isFetching: query.isFetching,
    error: query.isError ? query.error?.message || "Failed to load risk" : "",
    data: query.data ?? null
  };
}
