import React, { Suspense, useContext, useEffect, useMemo, useState } from "react";
import { lazyWithRetry } from "./lib/lazyWithRetry.js";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ScrollToTop } from "./components/routing/ScrollToTop.jsx";
import { useDashboardData } from "./hooks/useDashboardData.js";
import { buyStock, sellStock } from "./api.js";
import { getStock } from "./api.js";
import { StockSearchAutocomplete } from "./components/search/StockSearchAutocomplete.jsx";
import { ThemeToggle } from "./components/ui/ThemeToggle.jsx";
import { MainLayout } from "./layouts/MainLayout.jsx";
import { WatchlistTable } from "./components/watchlist/WatchlistTable.jsx";
import { TradeButtons } from "./components/trade/TradeButtons.jsx";
import { ActionToast } from "./components/ui/ActionToast.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SignupPage } from "./pages/SignupPage.jsx";
import { DashboardHomePage } from "./pages/DashboardHomePage.jsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { PageSkeleton } from "./components/ui/PageSkeleton.jsx";
import { NewsFeed } from "./components/news/NewsFeed.jsx";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryClient } from "./providers/QueryProvider.jsx";
import { prefetchNavRoute, prefetchRouteChunk } from "./lib/prefetch.js";
import { queryKeys } from "./lib/queryKeys.js";
import { POLL } from "./lib/cacheConfig.js";
import { useTransactionsQuery } from "./hooks/queries/useTransactionsQuery.js";
import { endSession, getToken, getValidToken, setToken } from "./auth.js";
import { useAuthSession } from "./hooks/useAuthSession.js";

const ExplorePage = lazyWithRetry(
  () => import("./components/explore/ExplorePage.jsx").then((m) => ({ default: m.ExplorePage })),
  "explore"
);
const MarketsPage = lazyWithRetry(
  () => import("./pages/MarketsPage.jsx").then((m) => ({ default: m.MarketsPage })),
  "markets"
);
const StockDetailPage = lazyWithRetry(
  () => import("./pages/StockDetailPage.jsx").then((m) => ({ default: m.StockDetailPage })),
  "stock"
);
const PortfolioAnalyticsSection = lazyWithRetry(
  () =>
    import("./components/portfolio/PortfolioAnalyticsSection.jsx").then((m) => ({
      default: m.PortfolioAnalyticsSection
    })),
  "portfolio"
);

function ViewLoading({ theme, variant = "dashboard" }) {
  return (
    <div style={{ padding: 16 }}>
      <PageSkeleton theme={theme} variant={variant} />
    </div>
  );
}
import { AuthContext } from "./authContext.jsx";
import { useUserProfile } from "./hooks/useUserProfile.js";
import { useRiskData } from "./hooks/useRiskData.js";
import { useWatchlist } from "./hooks/useWatchlist.js";
import { useStockPrice } from "./hooks/useStockPrice.js";
import { useAnimatedNumber } from "./hooks/useAnimatedNumber.js";
import { addToWatchlist, removeFromWatchlist } from "./api.js";
import { MarketDataProvider } from "./context/MarketDataContext.jsx";
import { formatHoldingPrice, formatMoney, resolveCurrencyCode } from "./utils/currency.js";
import { useWatchlistSnapshot } from "./hooks/useWatchlistSnapshot.js";
import { StockLink } from "./components/stocks/StockLink.jsx";
import { displayCompanyName } from "./utils/company.js";
import { resolveChangePct } from "./utils/quotes.js";

function normalizeStockInput(raw) {
  const s = (raw || "").trim().toUpperCase();
  return s;
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatINR(value, currencyCode = "INR") {
  return formatMoney(value, { currency: currencyCode, decimals: 0 });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatToIST(value) {
  if (value == null || value === "") return "—";
  let d = null;
  if (typeof value === "number") {
    // Heuristic: treat < 1e12 as seconds, otherwise ms.
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof value === "string") {
    const s = value.trim();
    if (!s) return "—";
    const asNum = Number(s);
    if (Number.isFinite(asNum) && s.length >= 10) {
      d = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
    } else {
      d = new Date(s);
    }
  } else {
    d = new Date(value);
  }

  if (!d || Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function isUsSymbol(sym) {
  const s = String(sym || "").toUpperCase();
  return s && !s.endsWith(".NS") && !s.endsWith(".BO");
}

function TradeModal({ open, side, symbol, theme, ownedQty = 0, busy, error, onClose, onConfirm }) {
  const [quantity, setQuantity] = useState("1");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setQuantity("1");
      setPassword("");
    }
  }, [open, symbol, side]);

  if (!open || !symbol) return null;

  const sym = String(symbol).toUpperCase();
  const isBuy = side === "buy";
  const maxSell = Math.max(0, Math.floor(Number(ownedQty) || 0));

  const handleSubmit = (e) => {
    e.preventDefault();
    const qty = Math.max(1, Math.floor(Number(quantity) || 0));
    if (!password.trim()) return;
    if (!isBuy && maxSell > 0 && qty > maxSell) return;
    onConfirm({ side, symbol: sym, quantity: qty, password });
  };

  const qtyNum = Math.floor(Number(quantity) || 0);
  const qtyInvalid = qtyNum < 1 || (!isBuy && maxSell > 0 && qtyNum > maxSell);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-modal-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(0,0,0,0.45)"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.panel,
          boxShadow: theme.shadow,
          padding: 18
        }}
      >
        <div id="trade-modal-title" style={{ fontWeight: 950, fontSize: 16 }}>
          {isBuy ? "Buy" : "Sell"} {sym}
        </div>
        <div style={{ color: theme.muted, fontSize: 12, marginTop: 4, fontWeight: 650 }}>
          {isBuy ? "Enter quantity and confirm with your password" : `You own ${maxSell} share${maxSell === 1 ? "" : "s"}`}
        </div>
        {isUsSymbol(sym) ? (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: theme.chip,
              border: `1px solid ${theme.border}`,
              fontSize: 11,
              color: theme.muted,
              lineHeight: 1.4
            }}
          >
            US listing — trade settles in USD; your dashboard totals convert to INR at live FX.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ color: theme.muted, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Quantity
            </span>
            <input
              type="number"
              min={1}
              max={!isBuy && maxSell > 0 ? maxSell : undefined}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={{
                borderRadius: 12,
                border: `1px solid ${theme.inputBorder}`,
                background: theme.inputBg,
                color: theme.text,
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: 700,
                outline: "none"
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ color: theme.muted, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your account password"
              autoComplete="current-password"
              style={{
                borderRadius: 12,
                border: `1px solid ${theme.inputBorder}`,
                background: theme.inputBg,
                color: theme.text,
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: 700,
                outline: "none"
              }}
            />
          </label>

          {error ? (
            <div style={{ color: theme.red, fontSize: 12, fontWeight: 850 }}>{error}</div>
          ) : null}

          {!isBuy && maxSell > 0 && qtyNum > maxSell ? (
            <div style={{ color: theme.red, fontSize: 12, fontWeight: 850 }}>
              Cannot sell more than {maxSell} share{maxSell === 1 ? "" : "s"}.
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <Button variant="neutral" theme={theme} onClick={onClose} disabled={busy} style={{ padding: "10px 14px" }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isBuy ? "primary" : "sell"}
              theme={theme}
              disabled={busy || qtyInvalid || !password.trim()}
              style={{ padding: "10px 14px", opacity: busy ? 0.75 : 1 }}
            >
              {busy ? "Confirming…" : isBuy ? "Confirm buy" : "Confirm sell"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LiveMarketCard({ symbol, nameFallback, theme, pollMs = 12000, onOpenTrade, tradeBusy, ownedQty = 0, onAction }) {
  const quote = useStockPrice(symbol, { pollMs });
  const price = quote.currentPrice;
  const display = useAnimatedNumber(price ?? 0, { durationMs: 260 });
  const up = (quote.changePct ?? 0) >= 0;
  const c = up ? theme.green : theme.red;
  const currencyCode = resolveCurrencyCode(quote.currency, quote.currencySymbol);

  const [flash, setFlash] = useState("");
  const lastRef = React.useRef(null);
  useEffect(() => {
    if (!Number.isFinite(price)) return;
    const last = lastRef.current;
    if (last == null) {
      lastRef.current = price;
      return;
    }
    if (price === last) return;
    setFlash(price > last ? "up" : "down");
    lastRef.current = price;
    const t = window.setTimeout(() => setFlash(""), 220);
    return () => window.clearTimeout(t);
  }, [price]);

  const bg =
    flash === "up"
      ? "rgba(52,211,153,0.12)"
      : flash === "down"
        ? "rgba(244,63,94,0.10)"
        : theme.chip;

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${theme.border}`,
        background: bg,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: "default",
        transition: "background 220ms ease"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 980, fontSize: 15, letterSpacing: "-0.3px" }}>{symbol}</div>
          <div
            style={{
              color: theme.muted,
              fontSize: 11,
              marginTop: 4,
              fontWeight: 650,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {quote.name || nameFallback || (symbol ? symbol.toUpperCase() : "")}
          </div>
        </div>

        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div style={{ fontWeight: 950, fontSize: 13 }}>
            {Number.isFinite(display) ? formatMoney(display, { currency: currencyCode }) : "—"}
          </div>
          {typeof quote.changePct === "number" ? (
            <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  padding: "5px 9px",
                  borderRadius: 999,
                  border: `1px solid ${theme.border}`,
                  background: theme.panel,
                  color: c,
                  fontSize: 11,
                  fontWeight: 900
                }}
              >
                {up ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 6, color: theme.muted, fontSize: 11, fontWeight: 750 }}>—</div>
          )}
        </div>
      </div>

      {onOpenTrade ? (
        <TradeButtons
          symbol={symbol}
          ownedQty={ownedQty}
          onOpenTrade={onOpenTrade}
          tradeBusy={tradeBusy}
          theme={theme}
          onAction={onAction}
        />
      ) : null}
    </div>
  );
}

function WatchlistLiveRow({ sym, idx, theme, onRemove, onOpenTrade, tradeBusy, ownedQty = 0, onAction }) {
  const quote = useStockPrice(sym, { pollMs: 12000 });
  const price = quote.currentPrice;
  const display = useAnimatedNumber(price ?? 0, { durationMs: 260 });

  const [flash, setFlash] = useState("");
  const lastRef = React.useRef(null);
  useEffect(() => {
    if (!Number.isFinite(price)) return;
    const last = lastRef.current;
    if (last == null) {
      lastRef.current = price;
      return;
    }
    if (price === last) return;
    setFlash(price > last ? "up" : "down");
    lastRef.current = price;
    const t = window.setTimeout(() => setFlash(""), 220);
    return () => window.clearTimeout(t);
  }, [price]);

  const rowBg =
    flash === "up"
      ? "rgba(52,211,153,0.10)"
      : flash === "down"
        ? "rgba(244,63,94,0.10)"
        : "transparent";

  return (
    <div
      key={sym}
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 0.7fr 1.4fr",
        gap: 10,
        padding: "12px 14px",
        borderTop: idx === 0 ? "none" : `1px solid ${theme.border}`,
        alignItems: "center",
        background: rowBg,
        transition: "background 220ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = flash ? rowBg : theme.rowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = rowBg;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 16,
            background: theme.chip,
            border: `1px solid ${theme.border}`,
            display: "grid",
            placeItems: "center",
            fontWeight: 950,
            fontSize: 12
          }}
        >
          {sym.slice(0, 2)}
        </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 950, fontSize: 13 }}>{sym}</div>
        <div style={{ color: theme.muted, fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {displayCompanyName(sym, quote.name) || "Equity"}
        </div>
      </div>
      </div>

      <div style={{ textAlign: "right", fontWeight: 850 }}>
        {Number.isFinite(display) ? formatMoney(display, { currency: currencyCode }) : "—"}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {onOpenTrade ? (
          <TradeButtons
            symbol={sym}
            ownedQty={ownedQty}
            onOpenTrade={onOpenTrade}
            tradeBusy={tradeBusy}
            theme={theme}
            onAction={onAction}
          />
        ) : null}
        <Button variant="ghost" theme={theme} onClick={onRemove} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 850 }}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function TransactionRow({ tx, idx, theme, currencyCode }) {
  const type = String(tx?.type || "").toLowerCase();
  const up = type === "buy";
  const c = up ? theme.green : theme.red;
  const symbol = String(tx?.symbol || "—");
  const qty = tx?.quantity ?? "—";
  const price = tx?.price ?? tx?.current_price ?? null;
  const whenRaw = tx?.timestamp ?? tx?.time ?? tx?.date ?? tx?.created_at ?? tx?.createdAt ?? "";
  const when = formatToIST(whenRaw);

  // Names: API -> mapping -> symbol (never show plain "—" when we have a symbol)
  const quote = useStockPrice(symbol, { pollMs: 30000 });
  const company = displayCompanyName(symbol, quote.name || tx?.name) || (symbol && symbol !== "—" ? symbol : "—");

  return (
    <div
      key={`${symbol}-${idx}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 0.6fr 0.6fr 0.7fr 0.8fr",
        gap: 10,
        padding: "12px 14px",
        borderTop: idx === 0 ? "none" : `1px solid ${theme.border}`,
        alignItems: "center"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.rowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 16,
            background: theme.chip,
            border: `1px solid ${theme.border}`,
            display: "grid",
            placeItems: "center",
            fontWeight: 950,
            fontSize: 12
          }}
        >
          {symbol.slice(0, 2)}
        </div>
        <div style={{ minWidth: 0 }}>
          <StockLink symbol={symbol} theme={theme} style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>
            {symbol}
          </StockLink>
          <div style={{ color: theme.muted, fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <StockLink symbol={symbol} theme={theme} style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}>
              {company}
            </StockLink>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right", fontWeight: 950, color: type ? c : theme.muted }}>{type ? type.toUpperCase() : "—"}</div>
      <div style={{ textAlign: "right", fontWeight: 850 }}>{qty}</div>
      <div style={{ textAlign: "right", fontWeight: 850 }}>
        {price == null ? "—" : formatMoney(price, { currency: currencyCode })}
      </div>
      <div style={{ textAlign: "right", color: theme.muted, fontSize: 12, fontWeight: 750 }}>{when}</div>
    </div>
  );
}

function Icon({ name, color }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" };
  const stroke = color;
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <path d="M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-18v7h7V2h-7Z" fill={stroke} opacity="0.9" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...common}>
          <path
            d="M7 7V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6 7h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z"
            stroke={stroke}
            strokeWidth="1.8"
          />
          <path d="M9 12h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "explore":
      return (
        <svg {...common}>
          <path
            d="M10.5 13.5 8 16l2.5-7.5L16 8l-2.5 7.5L8 16l7.5-2.5Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            stroke={stroke}
            strokeWidth="1.8"
          />
        </svg>
      );
    case "watchlist":
      return (
        <svg {...common}>
          <path
            d="M12 17.4 6.2 20.6l1.2-6.6-4.8-4.6 6.6-.9L12 2.6l2.8 5.9 6.6.9-4.8 4.6 1.2 6.6L12 17.4Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "orders":
      return (
        <svg {...common}>
          <path
            d="M7 7h10M7 12h10M7 17h6"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <path
            d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
            stroke={stroke}
            strokeWidth="1.8"
          />
          <path d="M16.2 16.2 21 21" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path
            d="M21 14.6A7.8 7.8 0 0 1 9.4 3a6.6 6.6 0 1 0 11.6 11.6Z"
            fill={stroke}
            opacity="0.9"
          />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <path
            d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
            stroke={stroke}
            strokeWidth="1.8"
          />
          <path
            d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

function buttonVariantStyle(variant, theme) {
  switch (variant) {
    case "sell":
      return {
        background: "linear-gradient(180deg, #FB7185 0%, #E11D48 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 8px 16px rgba(225, 29, 72, 0.24)"
      };
    case "accent":
      return {
        background: "linear-gradient(180deg, #C4B5FD 0%, #7C3AED 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 8px 16px rgba(124, 58, 237, 0.22)"
      };
    case "success":
      return {
        background: "linear-gradient(180deg, #4ADE80 0%, #16A34A 100%)",
        color: "#FFFFFF",
        border: "none",
        boxShadow: "0 8px 16px rgba(22, 163, 74, 0.22)"
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
    boxShadow: "0 8px 16px rgba(2, 132, 199, 0.24)"
  };
}

const BTN_VARIANT_CLASS = {
  sell: "tv-btn--sell",
  accent: "tv-btn--accent",
  success: "tv-btn--success",
  neutral: "tv-btn--neutral",
  ghost: "tv-btn--ghost",
  primary: "tv-btn--primary"
};

function Button({ children, onClick, style, variant = "primary", theme, disabled = false, type = "button" }) {
  const variantStyle = buttonVariantStyle(variant, theme || {});
  const variantClass = BTN_VARIANT_CLASS[variant] || BTN_VARIANT_CLASS.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`tv-btn ${variantClass}`}
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

function Card({ children, style }) {
  return (
    <div
      style={{
        borderRadius: 18,
        overflow: "hidden",
        ...style
      }}
    >
      {children}
    </div>
  );
}

function ProtectedRoute({ children, authed }) {
  return authed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { token: ctxToken, username: ctxUsername, setUsername } = useContext(AuthContext);
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [token, setTokenState] = useState(() => getValidToken());
  const location = useLocation();
  const navigate = useNavigate();
  useAuthSession({ enabled: true });
  const path = location.pathname || "/dashboard";
  const isAuthed = Boolean(token);
  const dashboard = useDashboardData({
    token,
    enabled: isAuthed,
    refetchInterval: isAuthed && path !== "/markets" ? POLL.dashboard : false
  });
  const queryClient = useQueryClient();

  const theme = useMemo(() => {
    if (dark) {
      return {
        mode: "dark",
        bg: "#0B1220",
        panel: "#0F1A2E",
        panel2: "#0C162A",
        text: "#EAF0FF",
        muted: "rgba(234,240,255,0.66)",
        border: "rgba(234,240,255,0.08)",
        shadow: "0 18px 40px rgba(0,0,0,0.45)",
        chip: "rgba(234,240,255,0.06)",
        accent: "#2BB6FF",
        green: "#3BE38B",
        red: "#FF5A7A",
        barBg: "rgba(234,240,255,0.07)",
        rowHover: "rgba(234,240,255,0.05)",
        inputBg: "rgba(234,240,255,0.06)",
        inputBorder: "rgba(234,240,255,0.10)",
        icon: "rgba(234,240,255,0.86)"
      };
    }
    return {
      mode: "light",
      bg: "#F5F7FB",
      panel: "#FFFFFF",
      panel2: "#FFFFFF",
      text: "#0B1220",
      muted: "rgba(11,18,32,0.62)",
      border: "rgba(11,18,32,0.08)",
      shadow: "0 14px 30px rgba(11,18,32,0.10)",
      chip: "rgba(11,18,32,0.05)",
      accent: "#1677FF",
      green: "#14B86E",
      red: "#E5485D",
      barBg: "rgba(11,18,32,0.07)",
      rowHover: "rgba(11,18,32,0.04)",
      inputBg: "rgba(11,18,32,0.03)",
      inputBorder: "rgba(11,18,32,0.08)",
      icon: "rgba(11,18,32,0.82)"
    };
  }, [dark]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0B1220" : "#F5F7FB");
    document.documentElement.style.backgroundColor = theme.bg;
    document.body.style.backgroundColor = theme.bg;
    document.body.style.color = theme.text;
  }, [dark, theme.bg, theme.text]);

  const portfolio = useMemo(() => {
    const total = dashboard.totalNow || 0;
    const dayChange = dashboard.dayChange || 0;
    const dayChangePct = dashboard.dayChangePct || 0;
    const positive = dayChange >= 0;
    const chart = dashboard.chart || [];
    return { total, dayChange, dayChangePct, positive, chart };
  }, [dashboard.totalNow, dashboard.dayChange, dashboard.dayChangePct, dashboard.chart]);

  const allocations = useMemo(() => dashboard.allocations || [], [dashboard.allocations]);

  const holdings = useMemo(() => dashboard.holdings || [], [dashboard.holdings]);

  const filteredHoldings = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return holdings;
    return holdings.filter((h) => h.symbol.includes(q));
  }, [holdings, query]);

  const ownedBySymbol = useMemo(() => {
    const map = {};
    for (const h of holdings) {
      map[String(h.symbol || "").toUpperCase()] = Number(h.qty) || 0;
    }
    return map;
  }, [holdings]);

  const [tradeBusy, setTradeBusy] = useState("");
  const [actionFeedback, setActionFeedback] = useState({ message: "", error: "" });

  const showAction = (message, error = "") => {
    setActionFeedback({ message: error ? "" : message, error: error || "" });
  };

  const clearAction = () => setActionFeedback({ message: "", error: "" });
  const [tradeModal, setTradeModal] = useState(null);
  const [tradeModalError, setTradeModalError] = useState("");
  const openTradeModal = (side, symbol) => {
    const sym = String(symbol || "").toUpperCase();
    if (!sym) return;
    setTradeModal({ side, symbol: sym });
    setTradeModalError("");
  };

  const closeTradeModal = () => {
    if (tradeBusy) return;
    setTradeModal(null);
    setTradeModalError("");
  };

  const executeTrade = async ({ side, symbol, quantity, password }) => {
    const sym = String(symbol || "").trim();
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    if (!sym || !password?.trim() || tradeBusy) return;

    const key = `${side}:${String(sym).toUpperCase()}`;
    setTradeBusy(key);
    setTradeModalError("");
    try {
      const res =
        side === "buy"
          ? await buyStock({ symbol: sym, quantity: qty, password: password.trim() })
          : await sellStock({ symbol: sym, quantity: qty, password: password.trim() });

      if (res?.portfolio) dashboard.applyPortfolioUpdate(res.portfolio, res.balance);
      dashboard.reload({ silent: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolioBundle() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      setTradeModal(null);
      showAction(
        side === "buy"
          ? `Successfully purchased ${qty} share${qty === 1 ? "" : "s"} of ${sym.toUpperCase()}.`
          : `Successfully sold ${qty} share${qty === 1 ? "" : "s"} of ${sym.toUpperCase()}.`
      );
    } catch (e) {
      setTradeModalError(e?.message || "Trade failed");
      showAction(e?.message || "Trade failed", "error");
    } finally {
      setTradeBusy("");
    }
  };

  const navItems = useMemo(
    () => [
      { label: "Dashboard", icon: "dashboard" },
      { label: "Markets", icon: "explore" },
      { label: "Portfolio", icon: "portfolio" },
      { label: "Explore", icon: "explore" },
      { label: "Watchlist", icon: "watchlist" },
      { label: "Transactions", icon: "orders" }
    ],
    []
  );

  const changeColor = portfolio.positive ? theme.green : theme.red;
  const currencyCode = dashboard.baseCurrency || dashboard.currency || "INR";
  const loading = dashboard.loading;
  const holdingsLoading = loading && holdings.length === 0;
  const error = dashboard.error;
  const view = useMemo(() => new URLSearchParams(location.search || "").get("view") || "", [location.search]);
  const isRiskPage = path === "/risk" || view === "risk";
  const isWatchlistPage = path === "/watchlist" || view === "watchlist";
  const isPortfolioPage = path === "/portfolio" || view === "portfolio";
  const isExplorePage = view === "explore";
  const isMarketsPage = path === "/markets";
  const isStockPage = path.startsWith("/stock/");
  const isTransactionsPage = path === "/transactions" || view === "transactions";
  const risk = useRiskData({ enabled: isAuthed && (isRiskPage || isPortfolioPage) });
  const watchlist = useWatchlist({ enabled: isAuthed });
  const watchlistSnapshot = useWatchlistSnapshot({
    enabled: isAuthed && isWatchlistPage
  });
  const transactionsQuery = useTransactionsQuery({
    enabled: isAuthed && isTransactionsPage
  });

  const watchlistSymbols = useMemo(() => {
    const snapshotRows = Array.isArray(watchlistSnapshot.items) ? watchlistSnapshot.items : [];
    const fromSnapshot = snapshotRows
      .map((row) => String(row.symbol || "").toUpperCase())
      .filter(Boolean);
    if (fromSnapshot.length) return fromSnapshot;
    const raw = watchlist.items;
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.watchlist) ? raw.watchlist : [];
    return list.map((s) => String(s || "").toUpperCase()).filter(Boolean);
  }, [watchlistSnapshot.items, watchlist.items]);

  const watchlistTableItems = useMemo(() => {
    if (watchlistSnapshot.items?.length) return watchlistSnapshot.items;
    return watchlistSymbols.map((symbol) => ({
      symbol,
      name: symbol,
      current_price: null,
      previous_close: null,
      sparkline: []
    }));
  }, [watchlistSnapshot.items, watchlistSymbols]);

  const handleAddToWatchlist = async (symbol) => {
    const sym = String(symbol || "").toUpperCase();
    if (!sym) return;
    const result = isWatchlistPage
      ? await (async () => {
          try {
            const r = await addToWatchlist(sym);
            const items = Array.isArray(r?.watchlist) ? r.watchlist : [];
            watchlistSnapshot.reload();
            return { ok: true, items };
          } catch (e) {
            return { ok: false, error: e?.message || "Failed to add to watchlist" };
          }
        })()
      : await watchlist.add(sym);
    if (!result?.ok) {
      const msg = result?.error || "Failed to add to watchlist";
      showAction(msg, "error");
      throw new Error(msg);
    }
    if (!isWatchlistPage) watchlistSnapshot.reload();
    showAction(`${sym} has been added to your watchlist.`);
  };

  const handleRemoveFromWatchlist = async (symbol) => {
    const sym = String(symbol || "").toUpperCase();
    if (!sym) return;
    if (isWatchlistPage) {
      try {
        await removeFromWatchlist(sym);
        watchlistSnapshot.reload();
        showAction(`${sym} has been removed from your watchlist.`);
      } catch (e) {
        showAction(e?.message || "Failed to remove from watchlist", "error");
      }
      return;
    }
    const result = await watchlist.remove(sym);
    if (!result?.ok) {
      showAction(result?.error || "Failed to remove from watchlist", "error");
      return;
    }
    showAction(`${sym} has been removed from your watchlist.`);
  };

  const [watchLookup, setWatchLookup] = useState({ status: "idle", data: null });

  const transactions = useMemo(
    () => ({
      status:
        transactionsQuery.status === "loading" && !transactionsQuery.items.length
          ? "loading"
          : transactionsQuery.status === "error"
            ? "error"
            : "success",
      items: transactionsQuery.items,
      error: transactionsQuery.error
    }),
    [transactionsQuery.status, transactionsQuery.items, transactionsQuery.error]
  );

  const pageTitle = useMemo(() => {
    const m = {
      "/dashboard": "Dashboard",
      "/portfolio": "Portfolio",
      "/watchlist": "Watchlist",
      "/transactions": "Transactions",
      "/risk": "Risk"
    };
    if (view === "risk") return "Risk";
    if (view === "watchlist") return "Watchlist";
    if (view === "portfolio") return "Portfolio";
    if (view === "explore") return "Explore";
    if (view === "transactions") return "Transactions";
    if (path === "/markets") return "Markets";
    if (path.startsWith("/stock/")) return "Stock";
    return m[path] || "Dashboard";
  }, [path, view]);

  const pageSubtitle = useMemo(() => {
    if (view === "explore") return "NSE & BSE overview · movers & trends";
    if (view === "portfolio") return "Holdings, risk analytics & allocation";
    if (view === "watchlist") return "Track symbols and live prices";
    if (view === "transactions") return "Buys, sells & account activity";
    return "Track holdings, allocation & daily moves";
  }, [view]);

  const routeByNav = useMemo(
    () => ({
      Dashboard: "/dashboard",
      Markets: "/markets",
      Portfolio: "/dashboard?view=portfolio",
      Explore: "/dashboard?view=explore",
      Watchlist: "/dashboard?view=watchlist",
      Transactions: "/dashboard?view=transactions"
    }),
    []
  );

  // Keep local token in sync with context token changes (login/logout/401).
  useEffect(() => {
    setTokenState(ctxToken || "");
    if (!ctxToken) setUsername("");
  }, [ctxToken, setUsername]);

  // Fetch user profile when authenticated (fallback to JWT decode if /me missing).
  useUserProfile({ enabled: Boolean(token) });

  useEffect(() => {
    function onAuthChanged() {
      setTokenState(getValidToken());
    }
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  useEffect(() => {
    if (path === "/markets") setActiveNav("Markets");
    else if (path.startsWith("/stock/")) setActiveNav("Explore");
    else if (view === "portfolio") setActiveNav("Portfolio");
    else if (view === "explore") setActiveNav("Explore");
    else if (view === "watchlist") setActiveNav("Watchlist");
    else if (view === "transactions") setActiveNav("Transactions");
    else if (path === "/dashboard" && !view) setActiveNav("Dashboard");
  }, [path, view]);

  const layoutProps = useMemo(
    () => ({
      theme,
      dark,
      setDark,
      navItems,
      activeNav,
      onNav: (label) => {
        setActiveNav(label);
        navigate(routeByNav[label] || "/dashboard");
      },
      routeByNav,
      username: ctxUsername,
      currencySymbol: currencyCode,
      currencyLabel: currencyCode,
      onLogout: () => {
        endSession("logout");
        setTokenState("");
      },
      onSearchSelect: (item) => {
        if (item?.symbol) navigate(`/stock/${encodeURIComponent(item.symbol)}`);
      },
      onNavPrefetch: (label) => {
        prefetchRouteChunk(label);
        prefetchNavRoute(getQueryClient(), label);
      }
    }),
    [theme, dark, navItems, activeNav, routeByNav, ctxUsername, currencyCode, navigate]
  );

  async function handleWatchlistSearchSelect(item) {
    if (!item?.symbol) return;
    setWatchLookup({ status: "loading", data: null });
    try {
      const q = await getStock(item.symbol);
      setWatchLookup({ status: "success", data: q });
    } catch {
      setWatchLookup({ status: "not_found", data: null });
    }
  }

  return (
    <ErrorBoundary theme={theme}>
    <MarketDataProvider enabled={isAuthed}>
    <div
      className="finova-app-mounted"
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
        letterSpacing: "-0.2px"
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          min-height: 100%;
          width: 100%;
          background: ${theme.bg};
          color: ${theme.text};
        }
        #root {
          display: block;
        }
        * { box-sizing: border-box; }
        ::selection {
          background: ${dark ? "rgba(43,182,255,0.35)" : "rgba(22,119,255,0.25)"};
        }
        button:focus-visible, input:focus-visible, a:focus-visible {
          outline: 2px solid ${dark ? "rgba(43,182,255,0.5)" : "rgba(22,119,255,0.45)"};
          outline-offset: 2px;
        }
        button:focus:not(:focus-visible), input:focus:not(:focus-visible) {
          outline: none;
        }
        input::placeholder { color: ${theme.muted}; }
        @media (max-width: 900px) {
          .dashboard-shell { grid-template-columns: 1fr !important; padding-bottom: 72px !important; }
          .dashboard-sidebar { display: none !important; }
        }
      `}</style>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={getValidToken() ? "/dashboard" : "/login"} replace />} />
        <Route
          path="/login"
          element={
            token ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage
                dark={dark}
                theme={theme}
                setDark={setDark}
                onLoggedIn={(t) => setTokenState(t)}
              />
            )
          }
        />
        <Route path="/signup" element={<SignupPage dark={dark} theme={theme} setDark={setDark} />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute authed={Boolean(token)}>
              <MainLayout
                {...layoutProps}
                pageTitle={pageTitle}
                pageSubtitle={pageSubtitle}
                hideSearch={isExplorePage || isWatchlistPage}
              >
          {isPortfolioPage ? (
            <>
              <Suspense fallback={<ViewLoading theme={theme} variant="portfolio" />}>
                <PortfolioAnalyticsSection
                  theme={theme}
                  currencySymbol={currencyCode}
                  enabled={isAuthed && isPortfolioPage}
                />
              </Suspense>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                {/* SECTION 1: Holdings table */}
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 18, paddingBottom: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Holdings</div>
                      <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
                        {holdingsLoading ? "Loading…" : `${filteredHoldings.length} stocks`}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 999,
                        border: `1px solid ${theme.border}`,
                        background: theme.chip,
                        color: theme.muted,
                        fontSize: 12,
                        fontWeight: 750
                      }}
                    >
                      {holdingsLoading ? "Loading portfolio…" : error ? error : "Portfolio"}
                    </div>
                  </div>

                  <div style={{ padding: 12, paddingTop: 0 }}>
                    <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "visible" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.2fr 0.7fr 0.9fr 0.9fr 0.7fr 1fr",
                          gap: 10,
                          padding: "12px 14px",
                          background: theme.chip,
                          color: theme.muted,
                          fontSize: 11,
                          fontWeight: 850,
                          textTransform: "uppercase",
                          letterSpacing: "0.9px"
                        }}
                      >
                        <div>Symbol</div>
                        <div style={{ textAlign: "right" }}>Qty</div>
                        <div style={{ textAlign: "right" }}>Price</div>
                        <div style={{ textAlign: "right" }}>Total value</div>
                        <div style={{ textAlign: "right" }}>P/L %</div>
                        <div style={{ textAlign: "right" }}>Action</div>
                      </div>

                      {!holdingsLoading && !error && filteredHoldings.length === 0 ? (
                        <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          No holdings found.
                        </div>
                      ) : null}

                      {(holdingsLoading || error ? [] : filteredHoldings).map((h, idx) => {
                        const value =
                          Number(h.value_inr) ||
                          (h.price ? Number(h.price) : 0) * Number(h.qty || 0);
                        const pct = resolveChangePct(h);
                        const up = (pct ?? 0) >= 0;
                        const c = up ? theme.green : theme.red;
                        return (
                          <div
                            key={h.symbol}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1.2fr 0.7fr 0.9fr 0.9fr 0.7fr 1fr",
                              gap: 10,
                              padding: "12px 14px",
                              borderTop: idx === 0 ? "none" : `1px solid ${theme.border}`,
                              alignItems: "center"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = theme.rowHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 16,
                                  background: theme.chip,
                                  border: `1px solid ${theme.border}`,
                                  display: "grid",
                                  placeItems: "center",
                                  fontWeight: 950,
                                  fontSize: 12
                                }}
                              >
                                {h.symbol.slice(0, 2)}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <StockLink symbol={h.symbol} theme={theme} style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>
                                  {h.symbol}
                                </StockLink>
                                <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                                  <StockLink symbol={h.symbol} theme={theme} style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}>
                                    {displayCompanyName(h.symbol, h.name) || "Equity"}
                                  </StockLink>
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 850 }}>{h.qty}</div>
                            <div style={{ textAlign: "right", fontWeight: 850, fontSize: 12 }}>
                              {h.price == null ? "—" : formatHoldingPrice(h, currencyCode)}
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 950 }}>
                              {formatMoney(h.value_inr ?? value, { currency: currencyCode, decimals: 0 })}
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 950, color: c }}>
                              {pct == null ? "—" : `${up ? "+" : ""}${Number(pct).toFixed(2)}%`}
                            </div>
                            <TradeButtons
                              symbol={h.symbol}
                              ownedQty={h.qty}
                              onOpenTrade={openTradeModal}
                              tradeBusy={tradeBusy}
                              theme={theme}
                              onAction={showAction}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* SECTION 2: Allocation */}
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Allocation</div>
                      <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Weights</div>
                    </div>

                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                      {(!loading && !error
                        ? [...holdings]
                            .map((h) => ({
                              symbol: h.symbol,
                              value: (h.price ? Number(h.price) : 0) * Number(h.qty || 0)
                            }))
                            .filter((x) => x.value > 0)
                            .sort((a, b) => b.value - a.value)
                        : []
                      ).map((x, idx, arr) => {
                        const total = arr.reduce((acc, it) => acc + it.value, 0) || 1;
                        const pct = Math.max(0, Math.min(100, (x.value / total) * 100));
                        const palette = ["#2BB6FF", "#7C5CFF", "#34D399", "#FF8A4C"];
                        const color = palette[idx % palette.length];
                        return (
                          <div key={x.symbol} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <StockLink symbol={x.symbol} theme={theme} style={{ fontWeight: 900, fontSize: 13, color: theme.text }}>
                                  {x.symbol}
                                </StockLink>
                                <div style={{ fontWeight: 900, fontSize: 12 }}>{pct.toFixed(2)}%</div>
                              </div>
                              <div
                                style={{
                                  marginTop: 8,
                                  height: 10,
                                  borderRadius: 999,
                                  background: theme.barBg,
                                  border: `1px solid ${theme.border}`,
                                  overflow: "hidden"
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background: `linear-gradient(90deg, ${color}, rgba(255,255,255,0))`
                                  }}
                                />
                              </div>
                            </div>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 16,
                                background: theme.chip,
                                border: `1px solid ${theme.border}`,
                                display: "grid",
                                placeItems: "center",
                                color: theme.muted,
                                fontWeight: 900,
                                fontSize: 12
                              }}
                            >
                              {x.symbol.slice(0, 2)}
                            </div>
                          </div>
                        );
                      })}

                      {!loading && !error && holdings.length === 0 ? (
                        <div style={{ padding: "12px 0", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          No allocation data yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>

              </div>
            </>
          ) : isExplorePage ? (
            <Suspense fallback={<ViewLoading theme={theme} variant="dashboard" />}>
              <ExplorePage
                theme={theme}
                ownedBySymbol={ownedBySymbol}
                openTradeModal={openTradeModal}
                tradeBusy={tradeBusy}
                watchlistItems={watchlistSymbols}
                onAddToWatchlist={handleAddToWatchlist}
                onAction={showAction}
              />
            </Suspense>
          ) : isWatchlistPage ? (
            <Card
              style={{
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadow
              }}
            >
              <div style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Watchlist</div>
                    <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
                      {watchlistSnapshot.loading && !watchlistSnapshot.items.length
                        ? "Loading…"
                        : `${watchlistSymbols.length} stocks`}
                    </div>
                  </div>

                  <div style={{ minWidth: 320, flex: "1 1 320px" }}>
                    <StockSearchAutocomplete
                      theme={theme}
                      placeholder="Search companies to add to watchlist"
                      onSelect={handleWatchlistSearchSelect}
                    />
                  </div>
                </div>

                {watchLookup.status === "success" && watchLookup.data ? (
                  <div style={{ marginTop: 12, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.7fr 1.6fr",
                        gap: 10,
                        padding: "12px 14px",
                        alignItems: "center"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = theme.rowHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 16,
                            background: theme.chip,
                            border: `1px solid ${theme.border}`,
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 950,
                            fontSize: 12
                          }}
                        >
                          {String(watchLookup.data.symbol || "").slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <StockLink
                            symbol={watchLookup.data.symbol}
                            theme={theme}
                            style={{ fontWeight: 950, fontSize: 13, color: theme.text }}
                          >
                            {watchLookup.data.symbol}
                          </StockLink>
                          <div
                            style={{
                              color: theme.muted,
                              fontSize: 11,
                              marginTop: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis"
                            }}
                          >
                            <StockLink
                              symbol={watchLookup.data.symbol}
                              theme={theme}
                              style={{ color: theme.muted, fontSize: 11, fontWeight: 650 }}
                            >
                              {displayCompanyName(watchLookup.data.symbol, watchLookup.data.name) || "—"}
                            </StockLink>
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 850 }}>
                        {formatMoney(watchLookup.data.current_price || 0, {
                          currency: resolveCurrencyCode(watchLookup.data.currency, watchLookup.data.currency_symbol)
                        })}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap"
                        }}
                      >
                        {(() => {
                          const sym = String(watchLookup.data?.symbol || "").toUpperCase();
                          const inWatchlist = watchlistSymbols.some((x) => String(x || "").toUpperCase() === sym);
                          return (
                            <>
                              <TradeButtons
                                symbol={sym}
                                ownedQty={ownedBySymbol[sym] || 0}
                                onOpenTrade={openTradeModal}
                                tradeBusy={tradeBusy}
                                theme={theme}
                                onAction={showAction}
                              />
                              <Button
                                variant="accent"
                                theme={theme}
                                onClick={async () => {
                                  if (!sym) return;
                                  if (inWatchlist) return;
                                  try {
                                    await handleAddToWatchlist(sym);
                                    setWatchLookup({ status: "idle", data: null });
                                  } catch {
                                    // use hook error state
                                  }
                                }}
                                disabled={!sym || inWatchlist}
                                style={{ padding: "9px 12px", borderRadius: 12 }}
                              >
                                {inWatchlist ? "In watchlist" : "Add"}
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : null}

                {watchlist.error || watchlistSnapshot.error ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.chip,
                      color: theme.red,
                      fontSize: 12,
                      fontWeight: 850
                    }}
                  >
                    {watchlistSnapshot.error || watchlist.error}
                  </div>
                ) : null}

                <div style={{ marginTop: 14 }}>
                  <WatchlistTable
                    items={watchlistTableItems}
                    loading={(watchlistSnapshot.loading || watchlist.loading) && !watchlistTableItems.length}
                    theme={theme}
                    onRemove={handleRemoveFromWatchlist}
                  />
                </div>
              </div>
            </Card>
          ) : isTransactionsPage ? (
            <Card
              style={{
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadow
              }}
            >
              <div style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Transactions</div>
                    <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
                      {transactions.status === "loading"
                        ? "Loading…"
                        : transactions.status === "success"
                          ? `${transactions.items.length} entries`
                          : "History"}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      border: `1px solid ${theme.border}`,
                      background: theme.chip,
                      color: theme.muted,
                      fontSize: 12,
                      fontWeight: 750
                    }}
                  >
                    Buys & sells across your account
                  </div>
                </div>

                {transactions.status === "error" ? (
                  <div style={{ marginTop: 12, color: theme.red, fontSize: 13, fontWeight: 850 }}>{transactions.error}</div>
                ) : null}

                {transactions.status === "loading" ? (
                  <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading transactions…</div>
                ) : null}

                {transactions.status === "success" ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "visible" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.1fr 0.6fr 0.6fr 0.7fr 0.8fr",
                          gap: 10,
                          padding: "12px 14px",
                          background: theme.chip,
                          color: theme.muted,
                          fontSize: 11,
                          fontWeight: 850,
                          textTransform: "uppercase",
                          letterSpacing: "0.9px"
                        }}
                      >
                        <div>Symbol</div>
                        <div style={{ textAlign: "right" }}>Type</div>
                        <div style={{ textAlign: "right" }}>Qty</div>
                        <div style={{ textAlign: "right" }}>Price</div>
                        <div style={{ textAlign: "right" }}>When</div>
                      </div>

                      {transactions.items.length === 0 ? (
                        <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          No transactions yet.
                        </div>
                      ) : null}

                      {transactions.items.map((tx, idx) => (
                        <TransactionRow key={`${String(tx?.symbol || "—")}-${idx}`} tx={tx} idx={idx} theme={theme} currencyCode={currencyCode} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : isRiskPage ? (
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
              <Card
                style={{
                  background: theme.panel,
                  border: `1px solid ${theme.border}`,
                  boxShadow: theme.shadow
                }}
              >
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Portfolio volatility</div>
                    <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Annualized</div>
                  </div>

                  {risk.loading ? (
                    <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading risk…</div>
                  ) : null}

                  {risk.error ? (
                    <div style={{ marginTop: 12, color: theme.red, fontSize: 13, fontWeight: 850 }}>{risk.error}</div>
                  ) : null}

                  {!risk.loading && !risk.error && risk.data ? (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: "-0.8px" }}>
                        {(Number(risk.data.portfolio_volatility || 0) * 100).toFixed(2)}%
                      </div>
                      <div style={{ marginTop: 6, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                        Based on your current portfolio composition
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>

              <Card
                style={{
                  background: theme.panel,
                  border: `1px solid ${theme.border}`,
                  boxShadow: theme.shadow
                }}
              >
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>Weights</div>
                    <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>By value</div>
                  </div>

                  {risk.loading ? (
                    <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading weights…</div>
                  ) : null}

                  {!risk.loading && !risk.error && risk.data && risk.data.weights ? (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                      {Object.entries(risk.data.weights)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .map(([sym, w], idx) => {
                          const pct = Math.max(0, Math.min(100, Math.round(Number(w) * 100)));
                          const palette = ["#2BB6FF", "#7C5CFF", "#34D399", "#FF8A4C"];
                          const color = palette[idx % palette.length];
                          return (
                            <div key={sym} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontWeight: 900, fontSize: 13 }}>{sym}</div>
                                  <div style={{ fontWeight: 900, fontSize: 12 }}>{pct.toFixed(0)}%</div>
                                </div>
                                <div
                                  style={{
                                    marginTop: 8,
                                    height: 10,
                                    borderRadius: 999,
                                    background: theme.barBg,
                                    border: `1px solid ${theme.border}`,
                                    overflow: "hidden"
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: "100%",
                                      background: `linear-gradient(90deg, ${color}, rgba(255,255,255,0))`
                                    }}
                                  />
                                </div>
                              </div>
                              <div
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 16,
                                  background: theme.chip,
                                  border: `1px solid ${theme.border}`,
                                  display: "grid",
                                  placeItems: "center",
                                  color: theme.muted,
                                  fontWeight: 900,
                                  fontSize: 12
                                }}
                              >
                                {sym.slice(0, 2)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : null}

                  {!risk.loading && !risk.error && risk.data && (!risk.data.weights || Object.keys(risk.data.weights || {}).length === 0) ? (
                    <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>
                      No weights available.
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          ) : (
            <ErrorBoundary theme={theme}>
              <DashboardHomePage
                theme={theme}
                dark={dark}
                loading={loading}
                holdingsLoading={holdingsLoading}
                error={error}
                portfolio={portfolio}
                changeColor={changeColor}
                currencyCode={currencyCode}
                dashboard={dashboard}
                filteredHoldings={filteredHoldings}
                onOpenTrade={openTradeModal}
                tradeBusy={tradeBusy}
                onAction={showAction}
              />
            </ErrorBoundary>
          )}
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/portfolio" element={<ProtectedRoute authed={Boolean(token)}><Navigate to="/dashboard?view=portfolio" replace /></ProtectedRoute>} />
        <Route path="/watchlist" element={<ProtectedRoute authed={Boolean(token)}><Navigate to="/dashboard?view=watchlist" replace /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute authed={Boolean(token)}><Navigate to="/dashboard?view=transactions" replace /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute authed={Boolean(token)}><Navigate to="/dashboard?view=transactions" replace /></ProtectedRoute>} />
        <Route path="/risk" element={<ProtectedRoute authed={Boolean(token)}><Navigate to="/dashboard?view=risk" replace /></ProtectedRoute>} />
        <Route
          path="/markets"
          element={
            <ProtectedRoute authed={Boolean(token)}>
              <MainLayout {...layoutProps} pageTitle="Markets" pageSubtitle="Global indices, heatmaps & market news">
                <Suspense fallback={<ViewLoading theme={theme} variant="markets" />}>
                  <MarketsPage theme={theme} />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/:symbol"
          element={
            <ProtectedRoute authed={Boolean(token)}>
              <MainLayout {...layoutProps} pageTitle="Stock" pageSubtitle="Quote, chart & company details">
                <Suspense fallback={<ViewLoading theme={theme} variant="dashboard" />}>
                  <StockDetailPage
                    theme={theme}
                    onOpenTrade={openTradeModal}
                    tradeBusy={tradeBusy}
                    ownedBySymbol={ownedBySymbol}
                    watchlistSymbols={watchlistSymbols}
                    onAddToWatchlist={handleAddToWatchlist}
                    onAction={showAction}
                  />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={getValidToken() ? "/dashboard" : "/login"} replace />} />
      </Routes>

      <ActionToast
        message={actionFeedback.message}
        error={actionFeedback.error}
        theme={theme}
        onDismiss={clearAction}
      />

      <TradeModal
        open={Boolean(tradeModal)}
        side={tradeModal?.side}
        symbol={tradeModal?.symbol}
        theme={theme}
        ownedQty={tradeModal ? ownedBySymbol[tradeModal.symbol] || 0 : 0}
        busy={Boolean(tradeBusy)}
        error={tradeModalError}
        onClose={closeTradeModal}
        onConfirm={executeTrade}
      />
    </div>
    </MarketDataProvider>
    </ErrorBoundary>
  );
}

