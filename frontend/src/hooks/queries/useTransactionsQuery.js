import { useQuery } from "@tanstack/react-query";
import { getTransactions } from "../../api.js";
import { STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useTransactionsQuery({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.transactions(),
    queryFn: getTransactions,
    enabled,
    staleTime: STALE.transactions,
    placeholderData: (prev) => prev,
    select: (res) => (Array.isArray(res?.transactions) ? res.transactions : [])
  });

  return {
    status: query.isPending && !query.data ? "loading" : query.isError ? "error" : "success",
    items: query.data || [],
    error: query.isError ? query.error?.message || "Failed to load transactions" : "",
    isFetching: query.isFetching,
    refetch: query.refetch
  };
}
