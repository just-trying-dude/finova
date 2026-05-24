/** sessionStorage flag: one hard reload after stale lazy-chunk errors post-deploy. */
export const CHUNK_RELOAD_KEY = "tv-chunk-reload";

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i;

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || "");
  return CHUNK_ERROR_RE.test(msg);
}

export function reloadOnceForStaleAssets() {
  try {
    if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      const url = new URL(window.location.href);
      url.searchParams.set("_finova_cb", String(Date.now()));
      window.location.replace(url.pathname + url.search + url.hash);
      return true;
    }
    console.warn("[Finova] Lazy chunk failed to load after reload.");
  } catch {
    window.location.reload();
    return true;
  }
  return false;
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function handleChunkLoadFailure(err) {
  if (!isChunkLoadError(err)) return false;
  return reloadOnceForStaleAssets();
}
