import { useContext, useEffect, useRef } from "react";
import { AuthContext } from "../authContext.jsx";
import { getMe } from "../api.js";
import { usernameFromJwt } from "../utils/jwt.js";

export function useUserProfile({ enabled } = {}) {
  const { token, setUsername } = useContext(AuthContext);
  const ranForToken = useRef("");

  useEffect(() => {
    if (!enabled) return;
    if (!token) return;
    if (ranForToken.current === token) return;
    ranForToken.current = token;

    let cancelled = false;

    async function run() {
      try {
        const me = await getMe();
        const u = me?.username;
        if (!cancelled && typeof u === "string" && u.trim()) setUsername(u);
      } catch (e) {
        // If /me doesn't exist (404) or any failure, fall back to JWT decoding.
        const u = usernameFromJwt(token);
        if (!cancelled) setUsername(u);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, token, setUsername]);
}

