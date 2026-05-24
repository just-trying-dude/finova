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

  const data = query.data ?? null;
  const failed =
    query.isError && !data
      ? query.error?.message || "Failed to load risk"
      : "";

  return {
    loading: query.isPending && !data,
    isFetching: query.isFetching,
    error: failed,
    data
  };
}
