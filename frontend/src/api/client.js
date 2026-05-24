import { getToken, endSession, touchActivity } from "../auth.js";
import { apiUrl, getApiBaseUrl } from "../lib/apiBase.js";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchJson(path, { token, method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  const auth = token ?? getToken();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let resp;
  try {
    resp = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    const hint = getApiBaseUrl() || "VITE_API_URL (Render backend)";
    throw new Error(`Network error (${err?.message || "fetch failed"}). Check ${hint}.`);
  }

  const text = await resp.text();
  const data = text ? safeJsonParse(text) : null;

  if (resp.status === 401) {
    endSession("unauthorized");
  }

  if (!resp.ok) {
    const detail =
      (data && (data.detail || data.error)) ||
      (resp.status === 401 ? "Unauthorized (token missing/expired)" : "") ||
      `Request failed (${resp.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }

  if (auth && resp.ok) {
    touchActivity();
  }

  return data;
}
