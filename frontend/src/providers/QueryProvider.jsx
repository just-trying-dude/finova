import React, { useEffect, useMemo } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { AuthContext } from "../authContext.jsx";
import { createAppQueryClient } from "../lib/queryClient.js";
import { prefetchAuthenticatedApp, prefetchPublicMarketData } from "../lib/prefetch.js";
import { getToken, getValidToken } from "../auth.js";

function BootstrapQueries({ children }) {
  const queryClient = useQueryClient();
  const { token } = useContext(AuthContext);

  useEffect(() => {
    void prefetchPublicMarketData(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!token && !getValidToken()) return;
    void prefetchAuthenticatedApp(queryClient);
  }, [token, queryClient]);

  useEffect(() => {
    function onAuthChanged() {
      const t = getValidToken();
      if (t) void prefetchAuthenticatedApp(queryClient);
      else queryClient.clear();
    }
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, [queryClient]);

  return children;
}

let appQueryClient;

export function getQueryClient() {
  if (!appQueryClient) appQueryClient = createAppQueryClient();
  return appQueryClient;
}

export function QueryProvider({ children }) {
  const client = useMemo(() => getQueryClient(), []);
  return (
    <QueryClientProvider client={client}>
      <BootstrapQueries>{children}</BootstrapQueries>
    </QueryClientProvider>
  );
}
