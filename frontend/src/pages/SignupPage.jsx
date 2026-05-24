import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../api.js";
import {
  AuthAlert,
  AuthCardHeader,
  AuthField,
  AuthShell,
  AuthSubmitButton,
  AuthSwitchLink
} from "../components/auth/AuthShell.jsx";

export function SignupPage({ dark, theme, setDark }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignup() {
    if (!username.trim() || password.length < 4) {
      setError(username.trim() ? "Password must be at least 4 characters." : "Please choose a username.");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await registerUser({ username: username.trim(), password });
      setSuccess("Your account is ready. Redirecting you to sign in…");
      window.setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e) {
      setError(e?.message || "Unable to create your account. Try a different username.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !username.trim() || password.length < 4;

  return (
    <AuthShell
      dark={dark}
      theme={theme}
      setDark={setDark}
      footer={<span className="auth-footer-note">Join thousands building wealth with clarity</span>}
    >
      <AuthCardHeader
        title="Create your account"
        subtitle="Start tracking markets and managing your portfolio."
        onLight={!dark}
      />

      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) handleSignup();
        }}
      >
        <AuthField
          id="signup-username"
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a unique username"
          autoComplete="username"
          disabled={loading}
        />
        <AuthField
          id="signup-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 4 characters"
          autoComplete="new-password"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) handleSignup();
          }}
        />

        <AuthAlert type="error">{error}</AuthAlert>
        <AuthAlert type="success">{success}</AuthAlert>

        <AuthSubmitButton loading={loading} disabled={disabled} onClick={handleSignup} variant="success">
          {loading ? "Creating account…" : "Create account"}
        </AuthSubmitButton>
      </form>

      <p className="auth-card__switch">
        Already have an account? <AuthSwitchLink to="/login">Sign in</AuthSwitchLink>
      </p>
    </AuthShell>
  );
}
