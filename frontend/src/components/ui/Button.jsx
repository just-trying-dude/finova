import React from "react";

function buttonVariantStyle(variant, theme) {
  switch (variant) {
    case "sell":
      return {
        background: "linear-gradient(180deg, #FB7185 0%, #E11D48 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 4px 12px rgba(225, 29, 72, 0.2)"
      };
    case "accent":
      return {
        background: "linear-gradient(180deg, #C4B5FD 0%, #7C3AED 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 4px 12px rgba(124, 58, 237, 0.18)"
      };
    case "success":
      return {
        background: "linear-gradient(180deg, #4ADE80 0%, #16A34A 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 4px 12px rgba(22, 163, 74, 0.18)"
      };
    case "neutral":
      return {
        background: theme.chip,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        boxShadow: "none"
      };
    case "ghost":
      return {
        background: "transparent",
        color: theme.muted,
        border: `1px solid ${theme.border}`,
        boxShadow: "none"
      };
  }
  return {
    background: "linear-gradient(180deg, #38BDF8 0%, #0284C7 100%)",
    color: "#FFFFFF",
    border: "none",
    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.2)"
  };
}

const VARIANT_CLASS = {
  sell: "tv-btn--sell",
  accent: "tv-btn--accent",
  success: "tv-btn--success",
  neutral: "tv-btn--neutral",
  ghost: "tv-btn--ghost",
  primary: "tv-btn--primary"
};

export function Button({
  children,
  onClick,
  style,
  variant = "primary",
  theme,
  disabled = false,
  type = "button",
  className = ""
}) {
  const variantStyle = buttonVariantStyle(variant, theme || {});
  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`tv-btn ${variantClass} ${className}`.trim()}
      style={{
        "--tv-accent": theme?.accent || "#2bb6ff",
        "--tv-chip": theme?.chip || "#f1f5f9",
        "--tv-text": theme?.text || "#0f172a",
        borderRadius: 12,
        padding: "10px 12px",
        fontWeight: 650,
        fontSize: 13,
        letterSpacing: "0.1px",
        ...variantStyle,
        ...style
      }}
    >
      {children}
    </button>
  );
}
