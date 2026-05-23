import { fetchJson } from "./client.js";

export async function fetchMe({ token } = {}) {
  // Backend might not have this endpoint; caller should handle 404.
  return await fetchJson("/me", { token });
}

