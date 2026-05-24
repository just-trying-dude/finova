import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPortfolioDashboard } from "../../api.js";
import { getToken } from "../../auth.js";
import { POLL, STALE } from "../../lib/cacheConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";
import { resolveCurrencyCode } from "../../utils/currency.js";

function mapDashboard(data) {
  const currency = resolveCurrencyCode(data?.currency, data?.currency_symbol);
  return {
    loading: false,
    error: "",
    username: data?.username || "",
    currency,
    currencySymbol: currency,
    balance: data?.balance_unlimited ? null : Number(data?.balance || 0) || 0,
    balanceUnlimited: Boolean(data?.balance_unlimited),
    portfolio: data?.portfolio || {},
    holdings: Array.isArray(data?.holdings) ? data.holdings : [],
    totalNow: Number(data?.total_portfolio_value) || 0,
    dayChange: Number(data?.day_change) || 0,
    dayChangePct: Number(data?.day_change_pct) || 0,
    chart: Array.isArray(data?.chart) ? data.chart : [],
    allocations: Array.isArray(data?.allocations) ? data.allocations : []
  };
}

const EMPTY = {
  loading: true,
  error: "",
  username: "",
  currency: "INR",
  currencySymbol: "INR",
  balance: 0,
  balanceUnlimited: true,
  portfolio: {},
  holdings: [],
  totalNow: 0,
  dayChange: 0,
  dayChangePct: 0,
  chart: [],
  allocations: []
};

export function useDashboardQuery({ token, enabled = true, refetchInterval = POLL.dashboard } = {}) {
  const queryClient = useQueryClient();
  const authToken = token ?? getToken();
  const isEnabled = Boolean(enabled && authToken);

  const query = useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: getPortfolioDashboard,
    enabled: isEnabled,
    staleTime: STALE.dashboard,
    refetchInterval: isEnabled && refetchInterval ? refetchInterval : false,
    placeholderData: (prev) => prev
  });

  const applyPortfolioUpdate = useCallback(
    (portfolioObj, balance) => {
      queryClient.setQueryData(queryKeys.dashboard(), (old) => {
        const base = old && typeof old === "object" ? old : {};
        const portfolio = portfolioObj && typeof portfolioObj === "object" ? portfolioObj : base.portfolio || {};
        const prevHoldings = Array.isArray(base.holdings) ? base.holdings : [];
        const prevBySym = Object.fromEntries(prevHoldings.map((h) => [h.symbol, h]));
        const symbols = Object.keys(portfolio).filter((sym) => Number(portfolio[sym]) > 0);
        const holdings = symbols.map((symbol) => {
          const prev = prevBySym[symbol];
          const qty = Number(portfolio[symbol]) || 0;
          return {
            symbol,
            name: prev?.name || "",
            qty,
            price: prev?.price ?? null,
            previousClose: prev?.previousClose ?? null,
            changePct: prev?.changePct ?? null
          };
        });
        const totalNow = holdings.reduce((acc, h) => acc + (h.price ? h.price * h.qty : 0), 0);
        const totalPrev = holdings.reduce((acc, h) => acc + (h.previousClose ? h.previousClose * h.qty : 0), 0);
        const dayChange = totalNow - totalPrev;
        const dayChangePct = totalPrev > 0 ? (dayChange / totalPrev) * 100 : 0;
        return {
          ...base,
          portfolio,
          balance: balance != null ? Number(balance) : base.balance,
          holdings,
          total_portfolio_value: totalNow,
          day_change: dayChange,
          day_change_pct: dayChangePct
        };
      });
    },
    [queryClient]
  );

  const reload = useCallback(
    (options = {}) => {
      if (options.silent) void query.refetch();
      else void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
    },
    [query, queryClient]
  );

  const state = useMemo(() => {
    if (!isEnabled) return { ...EMPTY, loading: false };
    if (query.isPending && !query.data) return { ...EMPTY, loading: true, error: query.error?.message || "" };
    if (query.isError && !query.data) {
      return { ...EMPTY, loading: false, error: query.error?.message || "Failed to load dashboard data" };
    }
    if (query.data) return { ...mapDashboard(query.data), loading: false };
    return EMPTY;
  }, [isEnabled, query.isPending, query.isError, query.data, query.error]);

  return useMemo(() => ({ ...state, reload, applyPortfolioUpdate, isFetching: query.isFetching }), [
    state,
    reload,
    applyPortfolioUpdate,
    query.isFetching
  ]);
}
