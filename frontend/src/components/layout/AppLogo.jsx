import React from "react";

export const APP_NAME = "Finova";
export const APP_TAGLINE = "Invest in your Future";

/** finova logo on a white squircle plate (iOS-style app icon). */
export function AppLogoMark({ size = 44, onLight = false, style, className = "" }) {
  const inset = Math.max(5, Math.round(size * 0.16));
  const logoSize = size - inset * 2;

  return (
    <div
      className={`app-logo-squircle${onLight ? " app-logo-squircle--on-light" : ""} ${className}`.trim()}
      style={{
        width: size,
        height: size,
        ...style
      }}
      aria-hidden
    >
      <img src="/finova-logo.png" alt="" width={logoSize} height={logoSize} draggable={false} />
    </div>
  );
}

/** Logo + wordmark row for auth screens and marketing headers. */
export function AppLogoRow({ theme, title, subtitle, size = 48, onLight = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <AppLogoMark size={size} onLight={onLight} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 950,
            fontSize: 20,
            letterSpacing: "-0.4px",
            lineHeight: 1.1,
            color: theme.text
          }}
        >
          {APP_NAME}
        </div>
        {title ? (
          <div style={{ fontWeight: 900, fontSize: 15, marginTop: 4, color: theme.text }}>{title}</div>
        ) : null}
        {subtitle ? (
          <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
