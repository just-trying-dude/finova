import { useContext } from "react";
import { MarketDataContext } from "../context/MarketDataContext.jsx";
import { useMarketOverviewQuery } from "./queries/useMarketOverviewQuery.js";

/** Uses shared provider when available; otherwise fetches independently. */
export function useMarketOverview(opts = {}) {
  const ctx = useContext(MarketDataContext);
  const enabled = opts.enabled !== false && !ctx;
  const internal = useMarketOverviewQuery({ ...opts, enabled });
  return ctx?.overview ?? internal;
}

export { useMarketOverviewQuery as useMarketOverviewInternal } from "./queries/useMarketOverviewQuery.js";
