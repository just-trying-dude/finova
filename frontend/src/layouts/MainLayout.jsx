import React from "react";
import { ThemeToggle } from "../components/ui/ThemeToggle.jsx";
import { StockSearchAutocomplete } from "../components/search/StockSearchAutocomplete.jsx";
import { Card } from "../components/ui/Card.jsx";
import { Icon } from "../components/icons/Icon.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { MobileBottomNav } from "./MobileBottomNav.jsx";
import { SidebarBrand, getNavHint } from "../components/layout/SidebarBrand.jsx";

export function MainLayout({
  children,
  theme,
  dark,
  setDark,
  pageTitle,
  pageSubtitle = "Your portfolio at a glance",
  navItems,
  activeNav,
  onNav,
  routeByNav,
  username,
  currencySymbol = "INR",
  currencyLabel = "INR",
  onLogout,
  hidePageHeader = false,
  hideSearch = false,
  onSearchSelect,
  onNavPrefetch
}) {
  const isMobile = useIsMobile();

  const navStyle = {
    "--nav-chip": theme.chip,
    "--nav-chip-active": theme.chip,
    "--nav-border": theme.border,
    "--nav-border-active": theme.border,
    "--nav-icon-bg": theme.chip,
    "--nav-icon-border": theme.border,
    "--nav-muted": theme.muted
  };

  return (
    <div
      className="dashboard-shell"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
        gap: 18,
        padding: isMobile ? "12px 12px 72px" : 18,
        maxWidth: 1280,
        margin: "0 auto",
        minHeight: "100vh"
      }}
    >
      {!isMobile ? (
        <Card
          className="dashboard-sidebar"
          style={{
            background: theme.panel2,
            boxShadow: theme.shadow,
            border: `1px solid ${theme.border}`,
            padding: "12px 12px 14px",
            position: "sticky",
            top: 18,
            alignSelf: "start",
            height: "calc(100vh - 36px)",
            maxHeight: "calc(100vh - 36px)",
            overflow: "hidden",
            boxSizing: "border-box"
          }}
        >
          <div className="sidebar-shell">
            <div className="sidebar-shell__brand">
              <SidebarBrand theme={theme} dark={dark} />
            </div>

            <nav className="sidebar-nav sidebar-nav--fit" style={navStyle} aria-label="Main">
              {navItems.map((item) => {
                const active = item.label === activeNav;
                const hint = active ? "Current page" : getNavHint(item.label);
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`sidebar-nav__item${active ? " sidebar-nav__item--active" : ""}`}
                    onClick={() => onNav(item.label)}
                    onMouseEnter={() => onNavPrefetch?.(item.label)}
                    onFocus={() => onNavPrefetch?.(item.label)}
                    style={{ color: theme.text }}
                  >
                    <span className="sidebar-nav__icon">
                      <Icon name={item.icon} color={theme.icon} />
                    </span>
                    <span className="sidebar-nav__copy">
                      <span className="sidebar-nav__label">{item.label}</span>
                      {hint ? (
                        <span className={`sidebar-nav__hint${active ? "" : " sidebar-nav__hint--idle"}`}>
                          {hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-shell__footer" style={{ borderTopColor: theme.border }}>
              <div className="sidebar-account">
                <div className="sidebar-account__text">
                  <div className="sidebar-account__name" style={{ color: theme.text }}>
                    {username || "Account"}
                  </div>
                  <div className="sidebar-account__role" style={{ color: theme.muted }}>
                    Investor account
                  </div>
                </div>
                <div
                  className="sidebar-account__currency"
                  style={{
                    borderColor: theme.border,
                    background: theme.chip,
                    color: theme.muted
                  }}
                >
                  {currencyLabel || currencySymbol}
                </div>
              </div>

              <ThemeToggle dark={dark} onToggle={setDark} theme={theme} />

              {onLogout ? (
                <button
                  type="button"
                  className="sidebar-signout tv-btn tv-btn--neutral"
                  onClick={onLogout}
                  style={{
                    "--tv-accent": theme.accent,
                    "--tv-chip": theme.chip,
                    "--tv-text": theme.text,
                    borderColor: theme.border,
                    background: theme.chip,
                    color: theme.text
                  }}
                >
                  <Icon name="logout" color={theme.text} />
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {!hidePageHeader ? (
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 650, fontSize: 20, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{pageTitle}</div>
                <div style={{ color: theme.muted, fontSize: 12, marginTop: 4, fontWeight: 500 }}>{pageSubtitle}</div>
              </div>
              {isMobile ? <ThemeToggle dark={dark} onToggle={setDark} theme={theme} fullWidth={false} /> : null}
            </div>
          </Card>
        ) : null}

        {!hideSearch && onSearchSelect ? (
          <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, padding: 14 }}>
            <StockSearchAutocomplete
              theme={theme}
              placeholder="Search by company or symbol"
              onSelect={onSearchSelect}
            />
          </Card>
        ) : null}

        {children}
      </div>

      {isMobile ? (
        <MobileBottomNav theme={theme} activeNav={activeNav} onNav={onNav} routeByNav={routeByNav} />
      ) : null}
    </div>
  );
}
