import { isTokenExpired } from "./utils/jwt.js";

const TOKEN_KEY = "access_token";
const LAST_ACTIVITY_KEY = "tv-last-activity";

export function setToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  touchActivity();
  window.dispatchEvent(new Event("auth:changed"));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

/** Returns token only if present and not expired; clears storage if expired. */
export function getValidToken() {
  const t = getToken();
  if (!t) return "";
  if (isTokenExpired(t)) {
    removeToken();
    return "";
  }
  return t;
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("auth:changed"));
}

export function isAuthenticated() {
  return Boolean(getValidToken());
}

export function touchActivity() {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function getLastActivity() {
  try {
    const n = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

/** Sign out and notify the app (idle, 401, or explicit logout). */
export function endSession(reason = "logout") {
  localStorage.removeItem(TOKEN_KEY);
  try {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("auth:changed"));
  window.dispatchEvent(new CustomEvent("auth:session-ended", { detail: { reason } }));
}
