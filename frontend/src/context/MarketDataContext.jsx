import React, { createContext, useMemo } from "react";
import { useMarketOverviewQuery } from "../hooks/queries/useMarketOverviewQuery.js";

export const MarketDataContext = createContext(null);

/** Single shared market overview fetch (45s poll, cached). */
export function MarketDataProvider({ children, enabled = true }) {
  const overview = useMarketOverviewQuery({ enabled });
  const value = useMemo(() => ({ overview }), [overview]);
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}
