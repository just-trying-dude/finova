import { useRiskQuery } from "./queries/useRiskQuery.js";

export function useRiskData({ enabled } = {}) {
  return useRiskQuery({ enabled });
}
