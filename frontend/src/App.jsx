import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useDashboardData } from "./hooks/useDashboardData.js";
import { loginUser, registerUser } from "./api.js";
import { getMarketTopStocks, getStock } from "./api.js";
import { getTransactions } from "./api.js";
import { getToken, removeToken, setToken } from "./auth.js";
import { AuthContext } from "./authContext.jsx";
import { useUserProfile } from "./hooks/useUserProfile.js";
import { useRiskData } from "./hooks/useRiskData.js";
import { useWatchlist } from "./hooks/useWatchlist.js";
import { useVarData } from "./hooks/useVarData.js";
import { useMonteCarloData } from "./hooks/useMonteCarloData.js";
import { useAuthedPlot } from "./hooks/useAuthedPlot.js";
import { useStockPrice } from "./hooks/useStockPrice.js";
import { useAnimatedNumber } from "./hooks/useAnimatedNumber.js";
import { getPlotMonteCarlo, getPlotPortfolioHistory, getPlotReturnsDistribution } from "./api.js";
import { addToWatchlist } from "./api.js";

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

const COMPANY_BY_SYMBOL = {
  "TCS.NS": "Tata Consultancy Services",
  "INFY.NS": "Infosys",
  "RELIANCE.NS": "Reliance Industries",
  "HDFCBANK.NS": "HDFC Bank",
  "SBIN.NS": "State Bank of India",
  "ITC.NS": "ITC",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  RELIANCE: "Reliance Industries",
  HDFCBANK: "HDFC Bank",
  SBIN: "State Bank of India",
  ITC: "ITC"
};

function companyNameForSymbol(symbol) {
  const s = (symbol || "").toUpperCase().trim();
  return COMPANY_BY_SYMBOL[s] || COMPANY_BY_SYMBOL[s.replace(/\\.(NS|BO)$/i, "")] || "";
}

function formatINR(value) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  }
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

function SparklineArea({ points, stroke, gradientFrom, gradientTo, height = 110 }) {
  const { d, areaD } = useMemo(() => {
    if (!points?.length) return { d: "", areaD: "" };
    const w = 520;
    const h = height;
    const padX = 8;
    const padY = 10;
    const xs = points.map((_, i) => padX + (i * (w - padX * 2)) / (points.length - 1 || 1));
    const minY = Math.min(...points);
    const maxY = Math.max(...points);
    const span = maxY - minY || 1;
    const ys = points.map((p) => padY + (1 - (p - minY) / span) * (h - padY * 2));

    let path = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
      const x0 = xs[i - 1];
      const y0 = ys[i - 1];
      const x1 = xs[i];
      const y1 = ys[i];
      const mx = (x0 + x1) / 2;
      path += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
    }

    const baseY = h - padY;
    const area = `${path} L ${xs[xs.length - 1]} ${baseY} L ${xs[0]} ${baseY} Z`;
    return { d: path, areaD: area };
  }, [points, height]);

  const gradientId = useMemo(
    () => `grad_${Math.random().toString(16).slice(2)}`,
    []
  );

  return (
    <svg viewBox={`0 0 520 ${height}`} width="100%" height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.42" />
          <stop offset="70%" stopColor={gradientTo} stopOpacity="0.14" />
          <stop offset="100%" stopColor={gradientTo} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LiveMarketCard({ symbol, nameFallback, theme, pollMs = 8000 }) {
  const quote = useStockPrice(symbol, { pollMs });
  const price = quote.currentPrice;
  const display = useAnimatedNumber(price ?? 0, { durationMs: 260 });
  const up = (quote.changePct ?? 0) >= 0;
  const c = up ? theme.green : theme.red;
  const curSym = quote.currencySymbol || "₹";

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
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: "default",
        transition: "background 220ms ease"
      }}
    >
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
          {curSym}
          {Number.isFinite(display) ? display.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
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
  );
}

function WatchlistLiveRow({ sym, idx, theme, onRemove }) {
  const quote = useStockPrice(sym, { pollMs: 8000 });
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
        gridTemplateColumns: "1.2fr 0.7fr 0.8fr",
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
          {quote.name || companyNameForSymbol(sym) || "Equity"}
        </div>
      </div>
      </div>

      <div style={{ textAlign: "right", fontWeight: 850 }}>
        {(quote.currencySymbol || "₹") + (Number.isFinite(display) ? display.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—")}
      </div>

      <div style={{ textAlign: "right" }}>
        <button
          onClick={onRemove}
          style={{
            borderRadius: 12,
            padding: "9px 12px",
            border: `1px solid ${theme.border}`,
            background: "transparent",
            color: theme.text,
            cursor: "pointer",
            fontWeight: 850,
            fontSize: 12
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.rowHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function TransactionRow({ tx, idx, theme, currencySymbol }) {
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
  const company = quote.name || tx?.name || companyNameForSymbol(symbol) || (symbol && symbol !== "—" ? symbol : "—");

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
          <div style={{ fontWeight: 950, fontSize: 13 }}>{symbol}</div>
          <div style={{ color: theme.muted, fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {company}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right", fontWeight: 950, color: type ? c : theme.muted }}>{type ? type.toUpperCase() : "—"}</div>
      <div style={{ textAlign: "right", fontWeight: 850 }}>{qty}</div>
      <div style={{ textAlign: "right", fontWeight: 850 }}>
        {price == null ? "—" : `${currencySymbol}${Number(price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
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

function Button({ children, onClick, style, variant = "primary" }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        border: "none",
        cursor: "pointer",
        userSelect: "none",
        borderRadius: 12,
        padding: "10px 12px",
        fontWeight: 650,
        fontSize: 13,
        letterSpacing: "0.1px",
        transition: "transform 120ms ease, background 180ms ease, box-shadow 180ms ease",
        ...(variant === "primary"
          ? {
              background: "linear-gradient(180deg, rgba(24, 160, 251, 1), rgba(5, 125, 220, 1))",
              color: "#FFFFFF",
              boxShadow: "0 10px 18px rgba(24, 160, 251, 0.22)"
            }
          : {
              background: "transparent",
              color: "inherit"
            }),
        ...style
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.98)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
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
        boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
        overflow: "hidden",
        ...style
      }}
    >
      {children}
    </div>
  );
}

function LoginScreen({ theme, onLoggedIn }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError("Enter username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const resp = await loginUser({ username: username.trim(), password });
      const t = resp?.access_token;
      if (!t) throw new Error("Login succeeded but token was missing.");
      setToken(t);
      onLoggedIn(t);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
        display: "grid",
        placeItems: "center",
        padding: 18
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <Card
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow,
            padding: 18
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 16,
                background: `linear-gradient(180deg, ${theme.accent}, rgba(43,182,255,0.55))`,
                boxShadow: "0 12px 24px rgba(22,119,255,0.20)"
              }}
            />
            <div>
              <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.1 }}>Sign in</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2, fontWeight: 650 }}>
                Continue to your portfolio dashboard
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Username</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. test"
                autoComplete="username"
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.inputBg,
                  padding: "12px 12px",
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none"
                }}
              />
            </div>

            <div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Password</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) handleLogin();
                }}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.inputBg,
                  padding: "12px 12px",
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none"
                }}
              />
            </div>

            {error ? (
              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.chip,
                  color: theme.red,
                  fontSize: 12,
                  fontWeight: 800
                }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                Welcome back
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <Button
                  onClick={handleLogin}
                  style={{
                    padding: "10px 14px",
                    opacity: loading ? 0.85 : 1
                  }}
                >
                  {loading ? "Logging in…" : "Login"}
                </Button>

                <Link
                  to="/signup"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: theme.muted,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 12,
                    textDecoration: "none"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  Don&apos;t have an account? <span style={{ color: theme.accent, fontWeight: 850 }}>Sign up</span>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <div style={{ marginTop: 12, color: theme.muted, fontSize: 12, textAlign: "center", fontWeight: 650 }} />
      </div>
    </div>
  );
}

function SignupScreen({ theme }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignup() {
    if (!username.trim() || !password) {
      setError("Enter username and password.");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await registerUser({ username: username.trim(), password });
      setSuccess("Account created. Redirecting to login…");
      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 700);
    } catch (e) {
      setError(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
        display: "grid",
        placeItems: "center",
        padding: 18
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <Card
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow,
            padding: 18
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 16,
                background: `linear-gradient(180deg, ${theme.accent}, rgba(43,182,255,0.55))`,
                boxShadow: "0 12px 24px rgba(22,119,255,0.20)"
              }}
            />
            <div>
              <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.1 }}>Create account</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2, fontWeight: 650 }}>
                Join and start building your portfolio
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Username</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Pick a username"
                autoComplete="username"
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.inputBg,
                  padding: "12px 12px",
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none"
                }}
              />
            </div>

            <div>
              <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Password</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Create a password"
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) handleSignup();
                }}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.inputBg,
                  padding: "12px 12px",
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 700,
                  outline: "none"
                }}
              />
            </div>

            {error ? (
              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.chip,
                  color: theme.red,
                  fontSize: 12,
                  fontWeight: 800
                }}
              >
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.chip,
                  color: theme.green,
                  fontSize: 12,
                  fontWeight: 850
                }}
              >
                {success}
              </div>
            ) : null}

            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => {
                  navigate("/login");
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: theme.accent,
                  fontWeight: 850,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12
                }}
              >
                Back to login
              </button>
              <Button
                onClick={handleSignup}
                style={{
                  padding: "10px 14px",
                  opacity: loading ? 0.85 : 1
                }}
              >
                {loading ? "Creating…" : "Create Account"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { token: ctxToken, username: ctxUsername, setUsername } = useContext(AuthContext);
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [token, setTokenState] = useState(() => getToken());
  const dashboard = useDashboardData({ token });

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

  const navItems = useMemo(
    () => [
      { label: "Dashboard", icon: "dashboard" },
      { label: "Portfolio", icon: "portfolio" },
      { label: "Explore", icon: "explore" },
      { label: "Watchlist", icon: "watchlist" },
      { label: "Transactions", icon: "orders" }
    ],
    []
  );

  const changeColor = portfolio.positive ? theme.green : theme.red;
  const currencySymbol = dashboard.currencySymbol || "₹";
  const loading = dashboard.loading;
  const error = dashboard.error;
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname || "/dashboard";
  const view = useMemo(() => new URLSearchParams(location.search || "").get("view") || "", [location.search]);
  const isRiskPage = path === "/risk" || view === "risk";
  const isWatchlistPage = path === "/watchlist" || view === "watchlist";
  const isPortfolioPage = path === "/portfolio" || view === "portfolio";
  const isExplorePage = view === "explore";
  const isTransactionsPage = path === "/transactions" || view === "transactions";
  const risk = useRiskData({ enabled: Boolean(token) && isRiskPage });
  const portfolioRisk = useRiskData({ enabled: Boolean(token) && isPortfolioPage });
  const portfolioVar = useVarData({ enabled: Boolean(token) && isPortfolioPage });
  const monteCarlo = useMonteCarloData({ enabled: Boolean(token) && isPortfolioPage });
  const plotHistory = useAuthedPlot(getPlotPortfolioHistory, { enabled: Boolean(token) && isPortfolioPage });
  const plotReturns = useAuthedPlot(getPlotReturnsDistribution, { enabled: Boolean(token) && isPortfolioPage });
  const plotMonteCarlo = useAuthedPlot(getPlotMonteCarlo, { enabled: Boolean(token) && isPortfolioPage });
  const watchlist = useWatchlist({ enabled: Boolean(token) && (isWatchlistPage || isExplorePage) });
  const [watchInput, setWatchInput] = useState("");
  const debouncedWatch = useDebouncedValue(watchInput, 350);
  const [watchLookup, setWatchLookup] = useState({ status: "idle", data: null });

  const [marketTop, setMarketTop] = useState({ status: "idle", data: null, error: "" });
  const [exploreQuery, setExploreQuery] = useState("");
  const debouncedExplore = useDebouncedValue(exploreQuery, 450);
  const [exploreSearch, setExploreSearch] = useState({ status: "idle", data: null, error: "" });
  const [exploreNotice, setExploreNotice] = useState({ message: "", error: "" });
  const [transactions, setTransactions] = useState({ status: "idle", items: [], error: "" });

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
    return m[path] || "Dashboard";
  }, [path, view]);

  const routeByNav = useMemo(
    () => ({
      Dashboard: "/dashboard",
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
    if (!isExplorePage) return;
    let cancelled = false;

    setMarketTop({ status: "loading", data: null, error: "" });

    (async () => {
      try {
        const raw = await getMarketTopStocks();
        const nse = Array.isArray(raw?.nse) ? raw.nse : [];
        const bse = Array.isArray(raw?.bse) ? raw.bse : [];

        async function enrich(list) {
          const items = await Promise.all(
            (list || []).map(async (it) => {
              const symbol = String(it?.symbol || "").toUpperCase();
              const fallbackName = String(it?.name || companyNameForSymbol(symbol) || "").trim();
              const fallbackPrice = Number(it?.current_price);

              try {
                const q = await getStock(symbol);
                const cur = Number(q?.current_price);
                const prev = Number(q?.previous_close);
                const pct = prev > 0 && Number.isFinite(cur) && Number.isFinite(prev) ? ((cur - prev) / prev) * 100 : null;
                return {
                  symbol: q?.symbol || symbol,
                  name: String(q?.name || fallbackName || symbol),
                  current_price: Number.isFinite(cur) ? cur : Number.isFinite(fallbackPrice) ? fallbackPrice : 0,
                  previous_close: Number.isFinite(prev) ? prev : null,
                  change_pct: pct,
                  currency_symbol: q?.currency_symbol || ""
                };
              } catch {
                return {
                  symbol,
                  name: fallbackName || symbol,
                  current_price: Number.isFinite(fallbackPrice) ? fallbackPrice : 0,
                  previous_close: null,
                  change_pct: null,
                  currency_symbol: ""
                };
              }
            })
          );
          return items.filter((x) => x.symbol);
        }

        const data = { nse: await enrich(nse), bse: await enrich(bse) };
        if (!cancelled) setMarketTop({ status: "success", data, error: "" });
      } catch (e) {
        if (!cancelled) setMarketTop({ status: "error", data: null, error: e?.message || "Failed to load market data" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExplorePage]);

  useEffect(() => {
    if (!isExplorePage) return;
    const sym = normalizeStockInput(debouncedExplore);
    if (!sym) {
      setExploreSearch({ status: "idle", data: null, error: "" });
      setExploreNotice({ message: "", error: "" });
      return;
    }

    let cancelled = false;
    setExploreSearch((s) => ({ ...s, status: "loading", error: "" }));

    (async () => {
      try {
        const q = await getStock(sym);
        if (!cancelled) setExploreSearch({ status: "success", data: q, error: "" });
      } catch (e) {
        if (!cancelled) setExploreSearch({ status: "error", data: null, error: e?.message || "Stock not found" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedExplore, isExplorePage]);

  useEffect(() => {
    if (!isTransactionsPage || !token) return;
    let cancelled = false;
    setTransactions({ status: "loading", items: [], error: "" });

    (async () => {
      try {
        const res = await getTransactions();
        const items = Array.isArray(res?.transactions) ? res.transactions : [];
        if (!cancelled) setTransactions({ status: "success", items, error: "" });
      } catch (e) {
        if (!cancelled) setTransactions({ status: "error", items: [], error: e?.message || "Failed to load transactions" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isTransactionsPage, token]);

  useEffect(() => {
    function onAuthChanged() {
      setTokenState(getToken());
    }
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  useEffect(() => {
    if (!isWatchlistPage) return;
    const sym = normalizeStockInput(debouncedWatch);
    if (!sym) {
      setWatchLookup({ status: "idle", data: null });
      return;
    }

    let cancelled = false;
    setWatchLookup({ status: "loading", data: null });
    (async () => {
      try {
        const q = await getStock(sym);
        if (!cancelled) setWatchLookup({ status: "success", data: q });
      } catch {
        // Requirement: show result ONLY when stock exists.
        if (!cancelled) setWatchLookup({ status: "not_found", data: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedWatch, isWatchlistPage]);

  return (
    <div
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
        * { box-sizing: border-box; }
        ::selection { background: rgba(22,119,255,0.25); }
        button:focus-visible, input:focus-visible { outline: 2px solid rgba(43,182,255,0.55); outline-offset: 2px; }
        input::placeholder { color: ${theme.muted}; }
      `}</style>
      <Routes>
        <Route path="/" element={<Navigate to={getToken() ? "/dashboard" : "/login"} replace />} />
        <Route path="/login" element={<LoginScreen theme={theme} onLoggedIn={(t) => setTokenState(t)} />} />
        <Route path="/signup" element={<SignupScreen theme={theme} />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "280px 1fr",
                  gap: 18,
                  padding: 18,
                  maxWidth: 1280,
                  margin: "0 auto"
                }}
              >
                {/* Sidebar */}
                <Card
                  style={{
                    background: theme.panel2,
                    boxShadow: theme.shadow,
                    border: `1px solid ${theme.border}`,
                    padding: 18,
                    position: "sticky",
                    top: 18,
                    alignSelf: "start",
                    height: "calc(100vh - 36px)"
                  }}
                >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                background: `linear-gradient(180deg, ${theme.accent}, rgba(43,182,255,0.55))`,
                boxShadow: dark ? "0 12px 26px rgba(43,182,255,0.18)" : "0 12px 24px rgba(22,119,255,0.20)"
              }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>Portfolio</div>
              <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Groww-style dashboard</div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {navItems.map((item) => {
              const active = item.label === activeNav;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setActiveNav(item.label);
                    const to = routeByNav[item.label] || "/dashboard";
                    navigate(to);
                  }}
                  style={{
                    background: active ? theme.chip : "transparent",
                    color: theme.text,
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 14,
                    padding: "10px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "background 160ms ease",
                    border: `1px solid ${active ? theme.border : "transparent"}`
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = theme.rowHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 14,
                      background: active ? "transparent" : theme.chip,
                      border: `1px solid ${theme.border}`,
                      display: "grid",
                      placeItems: "center"
                    }}
                  >
                    <Icon name={item.icon} color={theme.icon} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: active ? 800 : 650, fontSize: 13 }}>{item.label}</div>
                    <div style={{ color: theme.muted, fontSize: 11, marginTop: 1 }}>
                      {active ? "You are here" : "Open"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: "auto" }} />

          <div
            style={{
              marginTop: 18,
              borderTop: `1px solid ${theme.border}`,
              paddingTop: 14,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "center"
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{ctxUsername ? ctxUsername : "Account"}</div>
              <div style={{ color: theme.muted, fontSize: 11 }}>Retail investor</div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: theme.chip,
                fontSize: 11,
                color: theme.muted
              }}
            >
              {currencySymbol} {dashboard.currencySymbol === "$" ? "USD" : "INR"}
            </div>

            <button
              onClick={() => {
                removeToken();
                setTokenState("");
                navigate("/login", { replace: true });
              }}
              style={{
                gridColumn: "1 / -1",
                marginTop: 10,
                borderRadius: 14,
                padding: "10px 10px",
                border: `1px solid ${theme.border}`,
                background: "transparent",
                color: theme.text,
                cursor: "pointer",
                fontWeight: 850,
                fontSize: 12,
                transition: "background 160ms ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.rowHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Logout
            </button>
          </div>
        </Card>

                {/* Content */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Header */}
          {!isExplorePage ? (
            <Card
              style={{
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadow,
                padding: 16
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center"
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20, lineHeight: 1.1 }}>{pageTitle}</div>
                  <div style={{ color: theme.muted, fontSize: 12, marginTop: 3 }}>
                    Track holdings, allocation & daily moves
                  </div>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setDark((d) => !d)}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.chip,
                    boxShadow: "none",
                    color: theme.text,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}
                >
                  {dark ? <Icon name="sun" color={theme.icon} /> : <Icon name="moon" color={theme.icon} />}
                  <span style={{ fontWeight: 800 }}>{dark ? "Light" : "Dark"}</span>
                </Button>
              </div>
            </Card>
          ) : null}

          {/* (Top header quote search removed) */}

          {isPortfolioPage ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                {/* SECTION 1: Holdings table */}
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 18, paddingBottom: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Holdings</div>
                      <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
                        {loading ? "Loading…" : `${filteredHoldings.length} stocks`}
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
                      {loading ? "Loading portfolio…" : error ? error : "Portfolio"}
                    </div>
                  </div>

                  <div style={{ padding: 12, paddingTop: 0 }}>
                    <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.2fr 0.7fr 0.9fr 0.9fr 0.7fr",
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
                      </div>

                      {!loading && !error && filteredHoldings.length === 0 ? (
                        <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          No holdings found.
                        </div>
                      ) : null}

                      {(loading || error ? [] : filteredHoldings).map((h, idx) => {
                        const value = (h.price ? Number(h.price) : 0) * Number(h.qty || 0);
                        const up = (h.changePct ?? 0) >= 0;
                        const c = up ? theme.green : theme.red;
                        return (
                          <div
                            key={h.symbol}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1.2fr 0.7fr 0.9fr 0.9fr 0.7fr",
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
                                <div style={{ fontWeight: 950, fontSize: 13 }}>{h.symbol}</div>
                                <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                                  {h.name || companyNameForSymbol(h.symbol) || "Equity"}
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 850 }}>{h.qty}</div>
                            <div style={{ textAlign: "right", fontWeight: 850 }}>
                              {h.price == null
                                ? "—"
                                : `${currencySymbol}${Number(h.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 950 }}>
                              {currencySymbol}
                              {Math.round(value).toLocaleString("en-IN")}
                            </div>
                            <div style={{ textAlign: "right", fontWeight: 950, color: c }}>
                              {h.changePct == null ? "—" : `${up ? "+" : ""}${Number(h.changePct).toFixed(2)}%`}
                            </div>
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
                                <div style={{ fontWeight: 900, fontSize: 13 }}>{x.symbol}</div>
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

                {/* SECTION 3: Risk analytics */}
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Risk analytics</div>
                      <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Downside & risk level</div>
                    </div>

                    {!loading && !error && filteredHoldings.length === 0 ? (
                      <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>
                        No data. Add stocks to your portfolio to see risk analytics.
                      </div>
                    ) : null}

                    {(portfolioRisk.loading || portfolioVar.loading) ? (
                      <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading risk…</div>
                    ) : null}

                    {portfolioRisk.error || portfolioVar.error ? (
                      <div style={{ marginTop: 12, color: theme.red, fontSize: 13, fontWeight: 850 }}>
                        {portfolioRisk.error || portfolioVar.error}
                      </div>
                    ) : null}

                    {!portfolioRisk.loading &&
                    !portfolioVar.loading &&
                    !portfolioRisk.error &&
                    !portfolioVar.error &&
                    filteredHoldings.length > 0 ? (
                      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                        <div
                          style={{
                            borderRadius: 16,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            padding: 12
                          }}
                        >
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Volatility (per annum)</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {((Number(portfolioRisk.data?.portfolio_volatility || 0) * 100)).toFixed(2)}%
                          </div>
                        </div>
                        <div
                          style={{
                            borderRadius: 16,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            padding: 12
                          }}
                        >
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Max likely 1‑day loss (95%)</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {currencySymbol}{Math.round(Math.abs(Number(portfolioVar.data?.VaR_95 || 0))).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div
                          style={{
                            borderRadius: 16,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            padding: 12
                          }}
                        >
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Max extreme 1‑day loss (99%)</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {currencySymbol}{Math.round(Math.abs(Number(portfolioVar.data?.VaR_99 || 0))).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div
                          style={{
                            borderRadius: 16,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            padding: 12
                          }}
                        >
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Risk level</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {(() => {
                              const vol = Number(portfolioRisk.data?.portfolio_volatility || 0);
                              if (!Number.isFinite(vol) || vol <= 0) return "—";
                              if (vol < 0.18) return "Low";
                              if (vol < 0.32) return "Moderate";
                              return "High";
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>

                {/* SECTION 4: Simulations & charts */}
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Simulations & charts</div>
                      <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Portfolio behavior</div>
                    </div>

                    {!loading && !error && holdings.length === 0 ? (
                      <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>
                        No data. Add stocks to generate simulations and charts.
                      </div>
                    ) : null}

                    {monteCarlo.loading ? (
                      <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading simulation…</div>
                    ) : null}

                    {monteCarlo.error ? (
                      <div style={{ marginTop: 12, color: theme.red, fontSize: 13, fontWeight: 850 }}>{monteCarlo.error}</div>
                    ) : null}

                    {!monteCarlo.loading && !monteCarlo.error && monteCarlo.data && !monteCarlo.data.error ? (
                      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                        <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.chip, padding: 12 }}>
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Expected value (30 days)</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {currencySymbol}{Math.round(Number(monteCarlo.data.expected_value || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.chip, padding: 12 }}>
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Pessimistic (5%) · 30d</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {currencySymbol}{Math.round(Number(monteCarlo.data.worst_case || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.chip, padding: 12 }}>
                          <div style={{ color: theme.muted, fontSize: 11, fontWeight: 850 }}>Optimistic (95%) · 30d</div>
                          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                            {currencySymbol}{Math.round(Number(monteCarlo.data.best_case || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!monteCarlo.loading && !monteCarlo.error && monteCarlo.data && !monteCarlo.data.error ? (
                      <div
                        style={{
                          marginTop: 12,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: `1px solid ${theme.border}`,
                          background: theme.chip,
                          color: theme.muted,
                          fontSize: 12,
                          fontWeight: 750
                        }}
                      >
                        <span style={{ color: theme.text, fontWeight: 900 }}>Note:</span> Projections are estimated from historical
                        behavior and may vary from real market outcomes.
                      </div>
                    ) : null}

                    {!monteCarlo.loading && !monteCarlo.error && monteCarlo.data && monteCarlo.data.error ? (
                      <div style={{ marginTop: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>
                        {monteCarlo.data.error}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                      <div style={{ gridColumn: "1 / -1", borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden", background: theme.chip }}>
                        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.muted, fontSize: 12, fontWeight: 850 }}>
                          Portfolio history (daily)
                        </div>
                        {plotHistory.loading ? (
                          <div style={{ padding: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading…</div>
                        ) : plotHistory.error ? (
                          <div style={{ padding: 12, color: theme.red, fontSize: 12, fontWeight: 850 }}>{plotHistory.error}</div>
                        ) : plotHistory.url ? (
                          <img src={plotHistory.url} alt="Portfolio history" style={{ width: "100%", display: "block" }} />
                        ) : null}
                      </div>

                      <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden", background: theme.chip }}>
                        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.muted, fontSize: 12, fontWeight: 850 }}>
                          Returns distribution (daily)
                        </div>
                        {plotReturns.loading ? (
                          <div style={{ padding: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading…</div>
                        ) : plotReturns.error ? (
                          <div style={{ padding: 12, color: theme.red, fontSize: 12, fontWeight: 850 }}>{plotReturns.error}</div>
                        ) : plotReturns.url ? (
                          <img src={plotReturns.url} alt="Returns distribution" style={{ width: "100%", display: "block" }} />
                        ) : null}
                      </div>

                      <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden", background: theme.chip }}>
                        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.border}`, color: theme.muted, fontSize: 12, fontWeight: 850 }}>
                          Monte Carlo paths
                        </div>
                        {plotMonteCarlo.loading ? (
                          <div style={{ padding: 12, color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading…</div>
                        ) : plotMonteCarlo.error ? (
                          <div style={{ padding: 12, color: theme.red, fontSize: 12, fontWeight: 850 }}>{plotMonteCarlo.error}</div>
                        ) : plotMonteCarlo.url ? (
                          <img src={plotMonteCarlo.url} alt="Monte Carlo" style={{ width: "100%", display: "block" }} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          ) : isExplorePage ? (
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 980, fontSize: 18 }}>Market</div>
                  <div style={{ color: theme.muted, fontSize: 12, marginTop: 4, fontWeight: 650 }}>
                    Top stocks snapshot across NSE and BSE
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setDark((d) => !d)}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.chip,
                    boxShadow: "none",
                    color: theme.text,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 14
                  }}
                >
                  {dark ? <Icon name="sun" color={theme.icon} /> : <Icon name="moon" color={theme.icon} />}
                  <span style={{ fontWeight: 800 }}>{dark ? "Light" : "Dark"}</span>
                </Button>
              </div>

              <Card style={{ marginTop: 14, background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 950, fontSize: 13 }}>Search & trade</div>
                  <div style={{ color: theme.muted, fontSize: 11, marginTop: 3, fontWeight: 650 }}>
                    Look up any symbol and add it to watchlist
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 14,
                      border: `1px solid ${theme.inputBorder}`,
                      background: theme.inputBg,
                      padding: "10px 12px"
                    }}
                  >
                    <Icon name="search" color={theme.icon} />
                    <input
                      value={exploreQuery}
                      onChange={(e) => setExploreQuery(e.target.value)}
                      placeholder="Search symbol (e.g. TCS.NS, RELIANCE.BO, AAPL)…"
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: theme.text,
                        fontSize: 13,
                        fontWeight: 700
                      }}
                    />
                  </div>

                  {exploreSearch.status === "loading" ? (
                    <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 750 }}>Looking up…</div>
                  ) : null}

                  {exploreSearch.status === "error" ? (
                    <div style={{ marginTop: 10, color: theme.red, fontSize: 12, fontWeight: 850 }}>
                      {exploreSearch.error || "Stock not found"}
                    </div>
                  ) : null}

                  {exploreSearch.status === "success" && exploreSearch.data ? (
                    <div style={{ marginTop: 12 }}>
                      {(() => {
                        const cur = Number(exploreSearch.data.current_price);
                        const prev = Number(exploreSearch.data.previous_close);
                        const pct = prev > 0 && Number.isFinite(cur) && Number.isFinite(prev) ? ((cur - prev) / prev) * 100 : null;
                        const up = (pct ?? 0) >= 0;
                        const c = up ? theme.green : theme.red;
                        const symbol = exploreSearch.data.symbol;
                        const name =
                          exploreSearch.data.name ||
                          companyNameForSymbol(symbol) ||
                          (symbol ? symbol.toUpperCase() : "");
                        const curSym = exploreSearch.data.currency_symbol || "₹";
                        const inWatchlist = (watchlist.items || []).some((x) => String(x || "").toUpperCase() === String(symbol || "").toUpperCase());

                        return (
                          <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1.25fr 0.7fr 0.55fr 0.7fr 0.45fr",
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
                                  {String(symbol).slice(0, 2)}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 950, fontSize: 13 }}>{symbol}</div>
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
                                    {name}
                                  </div>
                                </div>
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 850 }}>
                                  {curSym}
                                  {Number(cur).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                </div>
                              </div>

                              <div style={{ textAlign: "right", fontWeight: 950, color: pct == null ? theme.muted : c, fontSize: 13 }}>
                                {pct == null ? "—" : `${up ? "+" : ""}${pct.toFixed(2)}%`}
                              </div>

                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <Button
                                  onClick={async () => {
                                    if (inWatchlist) return;
                                    try {
                                      await addToWatchlist(symbol);
                                      setExploreNotice({ message: "Added to watchlist.", error: "" });
                                    } catch (e) {
                                      setExploreNotice({ message: "", error: e?.message || "Failed to add to watchlist." });
                                    }
                                  }}
                                  disabled={inWatchlist}
                                  style={{ padding: "9px 12px", borderRadius: 12, width: "100%" }}
                                >
                                  {inWatchlist ? "In watchlist" : "Add to watchlist"}
                                </Button>
                              </div>

                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <Button onClick={() => {}} style={{ padding: "9px 12px", borderRadius: 12, width: "100%" }}>
                                  Buy
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {exploreNotice.message ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "9px 12px",
                            borderRadius: 12,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            color: theme.green,
                            fontSize: 12,
                            fontWeight: 850
                          }}
                        >
                          {exploreNotice.message}
                        </div>
                      ) : null}

                      {exploreNotice.error ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "9px 12px",
                            borderRadius: 12,
                            border: `1px solid ${theme.border}`,
                            background: theme.chip,
                            color: theme.red,
                            fontSize: 12,
                            fontWeight: 850
                          }}
                        >
                          {exploreNotice.error}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>

              {marketTop.status === "loading" ? (
                <Card style={{ marginTop: 14, background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, padding: 14 }}>
                  <div style={{ color: theme.muted, fontSize: 13, fontWeight: 750 }}>Loading top stocks…</div>
                </Card>
              ) : null}

              {marketTop.status === "error" ? (
                <Card style={{ marginTop: 14, background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, padding: 14 }}>
                  <div style={{ color: theme.red, fontSize: 13, fontWeight: 850 }}>{marketTop.error || "Failed to load market data"}</div>
                </Card>
              ) : null}

              {marketTop.status === "success" && marketTop.data ? (
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 14
                  }}
                >
                  {[
                    { title: "NSE · Top stocks", items: marketTop.data.nse || [] },
                    { title: "BSE · Top stocks", items: marketTop.data.bse || [] }
                  ].map((col) => (
                    <Card
                      key={col.title}
                      style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, overflow: "hidden" }}
                    >
                      <div style={{ padding: "12px 12px", borderBottom: `1px solid ${theme.border}` }}>
                        <div style={{ fontWeight: 950, fontSize: 13 }}>{col.title}</div>
                        <div style={{ color: theme.muted, fontSize: 11, marginTop: 3, fontWeight: 650 }}>{col.items.length} stocks</div>
                      </div>

                      <div style={{ padding: 12, maxHeight: 520, overflow: "auto" }}>
                        <div style={{ display: "grid", gap: 8 }}>
                          {col.items.map((it) => (
                            <LiveMarketCard
                              key={it.symbol}
                              symbol={it.symbol}
                              nameFallback={it.name || companyNameForSymbol(it.symbol) || "—"}
                              theme={theme}
                              pollMs={8000}
                            />
                          ))}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
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
                      {watchlist.loading ? "Loading…" : `${watchlist.items.length} stocks`}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 14,
                      border: `1px solid ${theme.inputBorder}`,
                      background: theme.inputBg,
                      padding: "10px 12px",
                      minWidth: 320
                    }}
                  >
                    <Icon name="search" color={theme.icon} />
                    <input
                      value={watchInput}
                      onChange={(e) => setWatchInput(e.target.value)}
                      placeholder="Add symbol (e.g. TCS, AAPL, TCS.NS)"
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: theme.text,
                        fontSize: 13,
                        fontWeight: 650
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Enter just validates/searches; adding happens on the stock card.
                        }
                      }}
                    />
                    {watchLookup.status === "loading" ? (
                      <div
                        style={{
                          padding: "7px 10px",
                          borderRadius: 999,
                          border: `1px solid ${theme.border}`,
                          background: theme.chip,
                          color: theme.muted,
                          fontSize: 12,
                          fontWeight: 850,
                          whiteSpace: "nowrap"
                        }}
                      >
                        Loading…
                      </div>
                    ) : null}
                  </div>
                </div>

                {watchLookup.status === "success" && watchLookup.data ? (
                  <div style={{ marginTop: 12, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.6fr 0.8fr",
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
                          <div style={{ fontWeight: 950, fontSize: 13 }}>{watchLookup.data.symbol}</div>
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
                            {watchLookup.data.name || companyNameForSymbol(watchLookup.data.symbol) || "—"}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 850 }}>
                        {watchLookup.data.currency_symbol || "₹"}
                        {Number(watchLookup.data.current_price || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {(() => {
                          const sym = String(watchLookup.data?.symbol || "").toUpperCase();
                          const inWatchlist = (watchlist.items || []).some((x) => String(x || "").toUpperCase() === sym);
                          return (
                        <Button
                          onClick={async () => {
                            if (!sym) return;
                            if (inWatchlist) return;
                            try {
                              await watchlist.add(sym);
                              setWatchInput("");
                            } catch {
                              // use hook error state
                            }
                          }}
                          disabled={!sym || inWatchlist}
                          style={{ padding: "9px 12px", borderRadius: 12 }}
                        >
                          {inWatchlist ? "In watchlist" : "Add"}
                        </Button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : null}

                {watchlist.error ? (
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
                    {watchlist.error}
                  </div>
                ) : null}

                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${theme.border}`,
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.7fr 0.8fr",
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
                      <div style={{ textAlign: "right" }}>Price</div>
                      <div style={{ textAlign: "right" }}>Action</div>
                    </div>

                    {!watchlist.loading && watchlist.items.length === 0 ? (
                      <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                        Your watchlist is empty. Add a symbol to get started.
                      </div>
                    ) : null}

                    {watchlist.items.map((sym, idx) => (
                      <WatchlistLiveRow key={sym} sym={sym} idx={idx} theme={theme} onRemove={() => watchlist.remove(sym)} />
                    ))}
                  </div>
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
                    <div style={{ borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>
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
                        <TransactionRow key={`${String(tx?.symbol || "—")}-${idx}`} tx={tx} idx={idx} theme={theme} currencySymbol={currencySymbol} />
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
            <>
              {/* Dashboard overview (Groww-inspired) */}
              {error ? (
                <Card
                  style={{
                    background: theme.panel,
                    border: `1px solid ${theme.border}`,
                    boxShadow: theme.shadow,
                    padding: 14
                  }}
                >
                  <div style={{ color: theme.red, fontSize: 13, fontWeight: 850 }}>{error}</div>
                </Card>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Total portfolio value</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8, letterSpacing: "-0.8px" }}>
                      {loading ? "—" : `${currencySymbol}${Math.round(portfolio.total).toLocaleString("en-IN")}`}
                    </div>
                    <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                      Updated from your holdings
                    </div>
                  </div>
                </Card>

                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Daily P&amp;L</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8, letterSpacing: "-0.8px", color: changeColor }}>
                      {loading ? "—" : `${portfolio.positive ? "+" : ""}${currencySymbol}${Math.round(portfolio.dayChange).toLocaleString("en-IN")}`}
                    </div>
                    <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                      {loading ? "—" : `${portfolio.positive ? "+" : ""}${Number(portfolio.dayChangePct || 0).toFixed(2)}% today`}
                    </div>
                  </div>
                </Card>

                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Available balance</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8, letterSpacing: "-0.8px" }}>
                      {loading ? "—" : `${currencySymbol}${Math.round(dashboard.balance || 0).toLocaleString("en-IN")}`}
                    </div>
                    <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>Ready to deploy</div>
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Top holdings</div>
                      <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Top 3 by value</div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      {(!loading && !error
                        ? [...filteredHoldings]
                            .map((h) => ({
                              ...h,
                              value: (h.price ? Number(h.price) : 0) * Number(h.qty || 0)
                            }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 3)
                        : []
                      ).map((h) => {
                        const up = (h.changePct ?? 0) >= 0;
                        const c = up ? theme.green : theme.red;
                        return (
                          <div
                            key={h.symbol}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 0.7fr",
                              gap: 10,
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: 14,
                              border: `1px solid ${theme.border}`,
                              background: theme.chip
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 950, fontSize: 13 }}>{h.symbol}</div>
                              <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                                {h.name || companyNameForSymbol(h.symbol) || "Holding"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: theme.muted, fontSize: 11, fontWeight: 800 }}>Value</div>
                              <div style={{ fontWeight: 950, marginTop: 3 }}>
                                {currencySymbol}
                                {Math.round(h.value).toLocaleString("en-IN")}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", color: c, fontWeight: 950 }}>
                              {h.changePct == null ? "—" : `${up ? "+" : ""}${Number(h.changePct).toFixed(2)}%`}
                            </div>
                          </div>
                        );
                      })}

                      {!loading && !error && filteredHoldings.length === 0 ? (
                        <div style={{ padding: "12px 2px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          No holdings yet.
                        </div>
                      ) : null}

                      {loading ? (
                        <div style={{ padding: "12px 2px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                          Loading holdings…
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>

                <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>Performance</div>
                      <div style={{ color: theme.muted, fontSize: 12, fontWeight: 700 }}>Trend</div>
                    </div>
                    <div style={{ marginTop: 12, borderRadius: 16, overflow: "hidden", border: `1px solid ${theme.border}` }}>
                      <div style={{ background: dark ? "rgba(43,182,255,0.06)" : "rgba(22,119,255,0.06)" }}>
                        <SparklineArea
                          points={portfolio.chart}
                          stroke={changeColor}
                          gradientFrom={changeColor}
                          gradientTo={theme.panel}
                          height={168}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>
                      {loading ? "Loading portfolio…" : "Last 16 points"}
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* Holdings */}
          {!isRiskPage && !isWatchlistPage && !isPortfolioPage && !isTransactionsPage ? (
            <Card
              style={{
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadow
              }}
            >
            <div style={{ padding: 18, paddingBottom: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 16 }}>Holdings</div>
                <div style={{ color: theme.muted, fontSize: 12, marginTop: 3, fontWeight: 650 }}>
                  {loading ? "Loading…" : `${filteredHoldings.length} stocks`}
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
                {loading ? "Loading portfolio…" : error ? error : "Overview"}
              </div>
            </div>

            <div style={{ padding: 12, paddingTop: 0 }}>
              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.8fr 0.9fr 0.9fr 0.8fr",
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
                  <div style={{ textAlign: "right" }}>% Change</div>
                  <div style={{ textAlign: "right" }}>Action</div>
                </div>

                {!loading && !error && filteredHoldings.length === 0 ? (
                  <div style={{ padding: "14px", color: theme.muted, fontSize: 13, fontWeight: 700 }}>
                    No stocks in portfolio.
                  </div>
                ) : null}

                {(loading || error ? [] : filteredHoldings).map((h, idx) => {
                  const up = h.changePct >= 0;
                  const c = up ? theme.green : theme.red;
                  return (
                    <div
                      key={h.symbol}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.8fr 0.9fr 0.9fr 0.8fr",
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
                          <div style={{ fontWeight: 950, fontSize: 13 }}>{h.symbol}</div>
                          <div style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>NSE · Equity</div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right", fontWeight: 850 }}>{h.qty}</div>
                      <div style={{ textAlign: "right", fontWeight: 850 }}>
                        {h.price == null ? "—" : `${currencySymbol}${h.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 950, color: c }}>
                        {h.changePct == null ? "—" : `${up ? "+" : ""}${h.changePct.toFixed(2)}%`}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Button
                          onClick={() => {
                            // intentionally no-op: UI-only dashboard
                          }}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 12
                          }}
                        >
                          Buy
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </Card>
          ) : null}

          <div style={{ color: theme.muted, fontSize: 12, padding: "6px 4px 0 4px", textAlign: "center" }} />
                </div>
              </div>
            </ProtectedRoute>
          }
        />
        <Route path="/portfolio" element={<ProtectedRoute><Navigate to="/dashboard?view=portfolio" replace /></ProtectedRoute>} />
        <Route path="/watchlist" element={<ProtectedRoute><Navigate to="/dashboard?view=watchlist" replace /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><Navigate to="/dashboard?view=transactions" replace /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Navigate to="/dashboard?view=transactions" replace /></ProtectedRoute>} />
        <Route path="/risk" element={<ProtectedRoute><Navigate to="/dashboard?view=risk" replace /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={getToken() ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </div>
  );
}

