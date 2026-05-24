import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { endSession, getLastActivity, getValidToken, touchActivity } from "../auth.js";

/** 30 minutes idle → sign out (common fintech pattern). */
const IDLE_MS = 30 * 60 * 1000;
const CHECK_MS = 60 * 1000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"];

/**
 * Validates JWT on load, enforces idle timeout, redirects on session end.
 */
export function useAuthSession({ enabled = true } = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;

    getValidToken();

    function onSessionEnded(e) {
      const reason = e?.detail?.reason;
      if (reason === "idle") {
        navigate("/login", { replace: true, state: { message: "You were signed out after 30 minutes of inactivity." } });
      } else if (reason === "unauthorized") {
        navigate("/login", { replace: true, state: { message: "Your session expired. Please sign in again." } });
      } else {
        navigate("/login", { replace: true });
      }
    }

    window.addEventListener("auth:session-ended", onSessionEnded);
    return () => window.removeEventListener("auth:session-ended", onSessionEnded);
  }, [enabled, navigate]);

  useEffect(() => {
    if (!enabled) return;

    function onActivity() {
      if (!getValidToken()) return;
      touchActivity();
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    touchActivity();

    const timer = window.setInterval(() => {
      if (!getValidToken()) return;
      if (Date.now() - getLastActivity() >= IDLE_MS) {
        endSession("idle");
      }
    }, CHECK_MS);

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      window.clearInterval(timer);
    };
  }, [enabled]);
}
