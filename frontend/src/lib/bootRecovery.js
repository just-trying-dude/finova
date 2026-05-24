import { clearChunkReloadFlag, handleChunkLoadFailure, isChunkLoadError } from "./chunkReload.js";

const BLANK_RELOAD_KEY = "tv-blank-reload";
const APP_MARKER = ".finova-app-mounted";

export function isAppMounted() {
  return Boolean(document.querySelector(APP_MARKER));
}

export function isRootBlank() {
  const root = document.getElementById("root");
  if (!root) return true;
  if (isAppMounted()) return false;

  const text = (root.textContent || "").trim();
  const onlyPlaceholder = text === "" || text === "Loading…" || text === "Loading...";
  if (root.childElementCount === 0 && onlyPlaceholder) return true;

  const hasShell = root.querySelector(".auth-page, .dashboard-shell");
  return !hasShell;
}

function hardReloadWithCacheBust(storageKey) {
  try {
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_finova_cb", String(Date.now()));
  window.location.replace(url.pathname + url.search + url.hash);
  return true;
}

function showBootFailureMessage() {
  const root = document.getElementById("root");
  if (!root || isAppMounted()) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;background:#0B1220;color:#EAF0FF;text-align:center">
      <div style="max-width:360px">
        <p style="font-weight:700;margin:0 0 8px">Finova could not load</p>
        <p style="opacity:0.75;font-size:14px;margin:0 0 16px">Try a hard refresh (Ctrl+Shift+R) or clear cache for this site.</p>
        <button type="button" onclick="location.reload()" style="padding:10px 18px;border-radius:10px;border:none;background:#2BB6FF;color:#fff;font-weight:700;cursor:pointer">Reload</button>
      </div>
    </div>
  `;
}

/** If React never paints the shell, reload once (stale chunks after deploy). */
export function installBootRecovery() {
  const checks = [2500, 5000];

  for (const delay of checks) {
    window.setTimeout(() => {
      if (!isRootBlank()) {
        try {
          sessionStorage.removeItem(BLANK_RELOAD_KEY);
          clearChunkReloadFlag();
        } catch {
          /* ignore */
        }
        return;
      }

      if (hardReloadWithCacheBust(BLANK_RELOAD_KEY)) return;

      if (delay === checks[checks.length - 1]) {
        showBootFailureMessage();
      }
    }, delay);
  }
}

export function installChunkErrorHandlers() {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    handleChunkLoadFailure(event?.payload || new Error("preload"));
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      handleChunkLoadFailure(event.reason);
    }
  });
}
