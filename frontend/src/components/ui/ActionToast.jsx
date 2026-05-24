import React, { useEffect } from "react";

/** Side notification for trades, watchlist, and other confirmations. */
export function ActionToast({ message, error, theme, onDismiss }) {
  const visible = Boolean(message || error);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => onDismiss?.(), 4000);
    return () => window.clearTimeout(id);
  }, [visible, message, error, onDismiss]);

  if (!visible) return null;

  const isError = Boolean(error);
  const text = error || message;
  const accent = isError ? theme.red : theme.green;
  const title = isError ? "Action failed" : "Confirmed";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 10000,
        width: "min(92vw, 340px)",
        padding: "16px 18px 16px 20px",
        borderRadius: 14,
        border: `1px solid ${isError ? `${theme.red}55` : theme.border}`,
        borderLeft: `4px solid ${accent}`,
        background: theme.panel,
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0,0,0,0.04)",
        pointerEvents: "none",
        animation: "tv-toast-in 220ms ease-out"
      }}
    >
      <style>{`
        @keyframes tv-toast-in {
          from {
            opacity: 0;
            transform: translateX(12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            background: isError ? `${theme.red}18` : `${theme.green}18`,
            color: accent,
            fontSize: 15,
            fontWeight: 900
          }}
        >
          {isError ? "!" : "✓"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: accent,
              marginBottom: 4
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 650,
              lineHeight: 1.45,
              color: theme.text
            }}
          >
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
