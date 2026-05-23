import { getToken, removeToken } from "../auth.js";

const BASE_URL = "http://127.0.0.1:8000";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function getAuthToken() {
  // Back-compat shim: prefer the new auth utility.
  return getToken();
}

export async function fetchJson(path, { token, method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  const auth = token ?? getToken();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let resp;
  try {
    resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) {
    throw new Error("Network error. Is the backend running on http://127.0.0.1:8000?");
  }

  const text = await resp.text();
  const data = text ? safeJsonParse(text) : null;

  if (resp.status === 401) {
    // Global auth handling: clear token and let the app redirect to login.
    removeToken();
  }

  if (!resp.ok) {
    const detail =
      (data && (data.detail || data.error)) ||
      (resp.status === 401 ? "Unauthorized (token missing/expired)" : "") ||
      `Request failed (${resp.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }

  return data;
}

