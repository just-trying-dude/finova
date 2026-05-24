/**
 * API base URL for all backend requests.
 * Production (Vercel): set VITE_API_URL to your Render service URL at build time.
 * Local dev: defaults to http://127.0.0.1:8000
 */
export function getApiBaseUrl() {
  const fromEnv =
    import.meta.env.VITE_API_URL?.trim() || import.meta.env.VITE_API_BASE_URL?.trim() || "";

  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8000";
  }

  return "";
}

export function apiUrl(path) {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    throw new Error(
      "VITE_API_URL is not configured. Set it to your Render backend URL (e.g. https://your-app.onrender.com)."
    );
  }
  return `${base}${p}`;
}
