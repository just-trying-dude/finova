import React from "react";
import { Link, useLocation } from "react-router-dom";
import { APP_NAME, APP_TAGLINE, AppLogoMark } from "../layout/AppLogo.jsx";
import { ThemeToggle } from "../ui/ThemeToggle.jsx";

function AuthVisual({ dark }) {
  return (
    <aside className="auth-visual" aria-hidden>
      <div className="auth-visual__mesh" />
      <div className="auth-visual__grid" />
      <div className="auth-visual__orb auth-visual__orb--1" />
      <div className="auth-visual__orb auth-visual__orb--2" />
      <div className="auth-visual__orb auth-visual__orb--3" />

      <div className="auth-visual__content">
        <div className="auth-visual__brand">
          <AppLogoMark size={52} onLight className="app-logo-squircle--auth-glow" />
          <div>
            <h1 className="finova-wordmark finova-wordmark--hero">{APP_NAME}</h1>
            <p className="auth-visual__tagline">{APP_TAGLINE}</p>
          </div>
        </div>

        <p className="auth-visual__lead">
          Track markets, manage your portfolio, and invest with clarity — all in one refined workspace.
        </p>

        <ul className="auth-visual__features">
          <li>
            <span className="auth-visual__feature-icon" aria-hidden>
              ◆
            </span>
            Real-time portfolio insights
          </li>
          <li>
            <span className="auth-visual__feature-icon" aria-hidden>
              ◆
            </span>
            NSE &amp; BSE market overview
          </li>
          <li>
            <span className="auth-visual__feature-icon" aria-hidden>
              ◆
            </span>
            Secure, streamlined trading
          </li>
        </ul>

        <div className="auth-visual__chart" aria-hidden>
          <svg viewBox="0 0 320 80" fill="none" className="auth-visual__chart-svg">
            <defs>
              <linearGradient id="authChartGrad" x1="0" y1="0" x2="320" y2="0">
                <stop offset="0%" stopColor={dark ? "#2BB6FF" : "#1677FF"} stopOpacity="0.2" />
                <stop offset="50%" stopColor={dark ? "#7C5CFF" : "#6366F1"} stopOpacity="0.85" />
                <stop offset="100%" stopColor={dark ? "#3BE38B" : "#14B86E"} stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <path
              d="M0 58 L40 52 L80 44 L120 38 L160 42 L200 28 L240 22 L280 18 L320 12"
              stroke="url(#authChartGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M0 58 L40 52 L80 44 L120 38 L160 42 L200 28 L240 22 L280 18 L320 12 V80 H0 Z"
              fill="url(#authChartGrad)"
              fillOpacity="0.12"
            />
          </svg>
        </div>
      </div>
    </aside>
  );
}

export function AuthShell({ children, dark, footer, theme, setDark }) {
  const location = useLocation();
  return (
    <div className={`auth-page${dark ? " auth-page--dark" : " auth-page--light"}`}>
      <AuthVisual dark={dark} />
      <div className="auth-panel">
        <div className="auth-panel__inner">
          <div key={location.pathname} className="auth-card auth-card--enter">
            {children}
          </div>
          <div className="auth-panel__footer">
            {setDark && theme ? (
              <div className="auth-panel__theme">
                <ThemeToggle dark={dark} onToggle={setDark} theme={theme} fullWidth />
              </div>
            ) : null}
            {footer ? footer : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthCardHeader({ title, subtitle, dark, onLight }) {
  return (
    <header className="auth-card__header">
      <div className="auth-card__logo-row">
        <AppLogoMark size={44} onLight={onLight} className="app-logo-squircle--auth-glow-sm" />
        <div>
          <div className="finova-wordmark finova-wordmark--card">{APP_NAME}</div>
          <p className="auth-card__subtitle-brand">{APP_TAGLINE}</p>
        </div>
      </div>
      <h2 className="auth-card__title">{title}</h2>
      {subtitle ? <p className="auth-card__subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function AuthField({ label, id, type = "text", value, onChange, placeholder, autoComplete, onKeyDown, disabled }) {
  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="auth-field__input"
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
    </div>
  );
}

export function AuthAlert({ type = "error", children }) {
  if (!children) return null;
  return (
    <div className={`auth-alert auth-alert--${type}`} role={type === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function AuthSubmitButton({ children, loading, disabled, onClick, variant = "primary" }) {
  return (
    <button
      type="button"
      className={`auth-btn auth-btn--${variant}${loading ? " auth-btn--loading" : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <span className="auth-btn__text">{children}</span>
      {loading ? <span className="auth-btn__spinner" aria-hidden /> : null}
    </button>
  );
}

export function AuthSwitchLink({ to, children }) {
  return (
    <Link to={to} className="auth-switch-link">
      {children}
    </Link>
  );
}
