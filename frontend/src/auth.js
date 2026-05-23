const TOKEN_KEY = "access_token";

export function setToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("auth:changed"));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("auth:changed"));
}

export function isAuthenticated() {
  return Boolean(getToken());
}

