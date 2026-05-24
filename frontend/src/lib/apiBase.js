/**
 * API base URL for all backend requests.
 * Production (Vercel): set VITE_API_URL to your Render service URL at build time.
 * Local dev: defaults to http://127.0.0.1:8000
 */

function normalizeBaseUrl(raw) {
  if (!raw) return "";
  // Strip accidental quotes from Vercel/dashboard paste: "https://..."
  return raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const fromEnv = normalizeBaseUrl(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || ""
  );

  if (fromEnv) {
    return fromEnv;
  }

  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8000";
  }

  return "";
}

/** Shown on login for deployment debugging (value is baked in at build time). */
export function getApiConfigDebug() {
  return {
    apiBase: getApiBaseUrl() || "(not set — add VITE_API_URL in Vercel and redeploy)",
    envRaw: import.meta.env.VITE_API_URL || "(empty)",
    mode: import.meta.env.MODE,
    prod: import.meta.env.PROD
  };
}

export function apiUrl(path) {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    throw new Error(
      "VITE_API_URL is not configured. In Vercel → Settings → Environment Variables, add VITE_API_URL=https://YOUR-SERVICE.onrender.com for Production AND Preview, then redeploy."
    );
  }
  return `${base}${p}`;
}

/** Quick connectivity check (no auth). */
export async function checkBackendHealth() {
  const base = getApiBaseUrl();
  if (!base) {
    return { ok: false, status: 0, message: "VITE_API_URL is missing from this build. Redeploy Vercel after setting the variable." };
  }

  try {
    const resp = await fetch(`${base}/health`, { method: "GET" });
    const text = await resp.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!resp.ok) {
      return { ok: false, status: resp.status, message: `Backend returned ${resp.status}`, data };
    }
    return { ok: true, status: resp.status, message: "Backend reachable", data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err?.message || "Network error — check URL, CORS on Render, or wait for cold start",
      base
    };
  }
}
