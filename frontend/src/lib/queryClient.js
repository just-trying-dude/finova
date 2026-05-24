import { QueryClient } from "@tanstack/react-query";
import { GC_TIME } from "./cacheConfig.js";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: GC_TIME,
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
        structuralSharing: true
      },
      mutations: {
        retry: 0
      }
    }
  });
}
