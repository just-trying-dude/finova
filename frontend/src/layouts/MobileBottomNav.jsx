import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Markets", path: "/markets" },
  { label: "Explore", path: "/dashboard?view=explore" },
  { label: "Portfolio", path: "/dashboard?view=portfolio" },
  { label: "Watchlist", path: "/dashboard?view=watchlist" }
];

export function MobileBottomNav({ theme, activeNav, onNav, routeByNav }) {
  const navigate = useNavigate();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 6px max(8px, env(safe-area-inset-bottom))",
        background: theme.panel,
        borderTop: `1px solid ${theme.border}`,
        boxShadow: "0 -8px 24px rgba(0,0,0,0.12)"
      }}
    >
      {TABS.map((tab) => {
        const active = activeNav === tab.label;
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => {
              onNav(tab.label);
              navigate(routeByNav[tab.label] || tab.path);
            }}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: active ? theme.accent : theme.muted,
              fontSize: 10,
              fontWeight: active ? 900 : 700,
              padding: "6px 4px",
              cursor: "pointer"
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
