import React, { memo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Clickable stock symbol / label — navigates to `/stock/:symbol`.
 */
export const StockLink = memo(function StockLink({ symbol, children, theme, style, onClick }) {
  const navigate = useNavigate();
  const sym = (symbol || "").trim();
  if (!sym) return <span style={style}>{children}</span>;

  const go = (e) => {
    e?.stopPropagation?.();
    onClick?.(e);
    navigate(`/stock/${encodeURIComponent(sym)}`);
  };

  return (
    <button
      type="button"
      onClick={go}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        color: theme?.accent || "#2bb6ff",
        font: "inherit",
        fontWeight: "inherit",
        textAlign: "inherit",
        textDecoration: "none",
        ...style
      }}
    >
      {children ?? sym}
    </button>
  );
});
