import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginUser } from "../api.js";
import { setToken } from "../auth.js";
import { getQueryClient } from "../providers/QueryProvider.jsx";
import { checkBackendHealth, getApiConfigDebug } from "../lib/apiBase.js";
import { prefetchAuthenticatedApp, prefetchPublicMarketData } from "../lib/prefetch.js";
import {
  AuthAlert,
  AuthCardHeader,
  AuthField,
  AuthShell,
  AuthSubmitButton,
  AuthSwitchLink
} from "../components/auth/AuthShell.jsx";

const REMEMBER_PREF_KEY = "tv-remember-me";

export function LoginPage({ dark, theme, setDark, onLoggedIn }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionMessage = location.state?.message || "";

  useEffect(() => {
    void prefetchPublicMarketData(getQueryClient());
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(sessionMessage);
  const apiDebug = getApiConfigDebug();
  const [apiStatus, setApiStatus] = useState({ checking: true, ok: null, message: "" });

  useEffect(() => {
    if (sessionMessage) setError(sessionMessage);
  }, [sessionMessage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await checkBackendHealth();
      if (cancelled) return;
      setApiStatus({
        checking: false,
        ok: result.ok,
        message: result.ok
          ? `API OK (${apiDebug.apiBase})`
          : `${result.message}${result.base ? ` — ${result.base}` : ""}`
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [apiDebug.apiBase]);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const resp = await loginUser({
        username: username.trim(),
        password,
        remember_me: rememberMe
      });
      const t = resp?.access_token;
      if (!t) throw new Error("Sign-in succeeded but session could not be started.");
      try {
        localStorage.setItem(REMEMBER_PREF_KEY, rememberMe ? "1" : "0");
      } catch {
        /* ignore */
      }
      setToken(t);
      onLoggedIn(t);
      navigate("/dashboard", { replace: true });
      void prefetchAuthenticatedApp(getQueryClient());
    } catch (e) {
      setError(e?.message || "Unable to sign in. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !username.trim() || !password;

  return (
    <AuthShell
      dark={dark}
      theme={theme}
      setDark={setDark}
      footer={<span className="auth-footer-note">Secure access · Encrypted session</span>}
    >
      <AuthCardHeader
        title="Welcome back"
        subtitle="Sign in to access your portfolio and markets."
        onLight={!dark}
      />

      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) handleLogin();
        }}
      >
        <AuthField
          id="login-username"
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          autoComplete="username"
          disabled={loading}
        />
        <AuthField
          id="login-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) handleLogin();
          }}
        />

        <label
          className="auth-remember"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
            cursor: loading ? "not-allowed" : "pointer",
            userSelect: "none"
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            disabled={loading}
            onChange={(e) => setRememberMe(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: theme.accent }}
          />
          <span style={{ fontSize: 13, fontWeight: 650, color: theme.muted }}>
            Remember me for 30 days
          </span>
        </label>

        {!apiStatus.checking && apiStatus.ok === false ? (
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: theme.chip,
              fontSize: 11,
              color: theme.muted,
              lineHeight: 1.45
            }}
          >
            <div style={{ fontWeight: 800, color: theme.red, marginBottom: 4 }}>API not reachable</div>
            <div>{apiStatus.message}</div>
            <div style={{ marginTop: 6 }}>
              Built with API: <code style={{ fontSize: 10 }}>{apiDebug.apiBase}</code>
            </div>
            <div style={{ marginTop: 4 }}>
              In Vercel, set <code style={{ fontSize: 10 }}>VITE_API_URL</code> to your Render URL (no{" "}
              <code>/api</code>), enable for <strong>Production + Preview</strong>, then redeploy.
            </div>
          </div>
        ) : null}

        <AuthAlert type="error">{error}</AuthAlert>

        <AuthSubmitButton loading={loading} disabled={disabled} onClick={handleLogin}>
          {loading ? "Signing in…" : "Sign in"}
        </AuthSubmitButton>
      </form>

      <p className="auth-card__switch">
        New to Finova? <AuthSwitchLink to="/signup">Create an account</AuthSwitchLink>
      </p>
    </AuthShell>
  );
}
