import { lazy } from "react";
import { clearChunkReloadFlag, handleChunkLoadFailure, isChunkLoadError } from "./chunkReload.js";

/**
 * Lazy-load a route chunk; on stale-build 404, trigger one hard reload then retry.
 */
export function lazyWithRetry(importer, label = "route") {
  return lazy(async () => {
    const attempt = async () => {
      try {
        const mod = await importer();
        clearChunkReloadFlag();
        return mod;
      } catch (err) {
        if (isChunkLoadError(err) && handleChunkLoadFailure(err)) {
          return new Promise(() => {});
        }
        throw err;
      }
    };

    try {
      return await attempt();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;
      await new Promise((r) => setTimeout(r, 120));
      return attempt();
    }
  });
}
