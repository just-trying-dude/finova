import React from "react";
import { APP_NAME, APP_TAGLINE, AppLogoMark } from "./AppLogo.jsx";

const NAV_HINTS = {
  Dashboard: "Overview",
  Markets: "Global indices",
  Portfolio: "Holdings & analytics",
  Explore: "Discover stocks",
  Watchlist: "Tracked symbols",
  Transactions: "Activity history"
};

export function getNavHint(label) {
  return NAV_HINTS[label] || "";
}

/** Premium sidebar brand block for Finova. */
export function SidebarBrand({ theme, dark = true }) {
  return (
    <div className={`sidebar-brand${dark ? " sidebar-brand--dark" : " sidebar-brand--light"}`}>
      <div className="sidebar-brand__mark-wrap">
        <AppLogoMark size={40} onLight={!dark} className="sidebar-brand__logo" />
      </div>
      <div className="sidebar-brand__text">
        <span className="finova-wordmark finova-wordmark--sidebar">{APP_NAME}</span>
        <span className="sidebar-brand__tagline">{APP_TAGLINE}</span>
      </div>
    </div>
  );
}
