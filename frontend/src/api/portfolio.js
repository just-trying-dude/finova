import { fetchJson } from "./client.js";

export async function fetchPortfolio({ token }) {
  // GET /portfolio (auth required)
  return await fetchJson("/portfolio", { token });
}

