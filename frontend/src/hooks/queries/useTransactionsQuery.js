import { useQuery } from "@tanstack/react-query";
import { fetchTransactionsList } from "../../lib/queryFetchers.js";
import { STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useTransactionsQuery({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.transactions(),
    queryFn: () => fetchTransactionsList(),
    enabled,
    staleTime: STALE.transactions,
    placeholderData: (prev) => prev
  });

  const items = Array.isArray(query.data)
    ? query.data
    : Array.isArray(query.data?.transactions)
      ? query.data.transactions
      : [];

  return {
    status: query.isPending && !query.data ? "loading" : query.isError ? "error" : "success",
    items,
    error: query.isError ? query.error?.message || "Failed to load transactions" : "",
    isFetching: query.isFetching,
    refetch: query.refetch
  };
}
