import React from "react";
import { Card } from "../ui/Card.jsx";
import { formatMoney } from "../../utils/currency.js";
import { isUnlimitedBalance } from "../../utils/balance.js";

/**
 * Available balance — unlimited (∞) or finite amount.
 */
export function UnlimitedBalanceCard({ theme, dark, loading, balance, balanceUnlimited, currencyCode }) {
  const unlimited = isUnlimitedBalance(balance, balanceUnlimited);
  const accent = theme.accent || "#2BB6FF";
  const glow = dark ? "rgba(43,182,255,0.35)" : "rgba(22,119,255,0.28)";

  if (loading) {
    return (
      <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div style={{ padding: 16 }}>
          <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Available balance</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 8 }}>—</div>
        </div>
      </Card>
    );
  }

  if (!unlimited) {
    const n = Number(balance) || 0;
    return (
      <Card style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div style={{ padding: 16 }}>
          <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800 }}>Available balance</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 950,
              marginTop: 8,
              letterSpacing: "-0.8px"
            }}
          >
            {formatMoney(n, { currency: currencyCode, decimals: 0 })}
          </div>
          <div style={{ marginTop: 10, color: theme.muted, fontSize: 12, fontWeight: 650 }}>Ready to deploy</div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="balance-card--unlimited"
      style={{
        background: dark
          ? `linear-gradient(145deg, ${theme.panel} 0%, rgba(43,182,255,0.12) 55%, ${theme.panel2 || theme.panel} 100%)`
          : `linear-gradient(145deg, ${theme.panel} 0%, rgba(22,119,255,0.08) 50%, #f8fbff 100%)`,
        border: `1px solid ${dark ? "rgba(43,182,255,0.35)" : "rgba(22,119,255,0.22)"}`,
        boxShadow: `${theme.shadow}, 0 0 32px ${glow}`,
        overflow: "hidden",
        position: "relative"
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -40,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
          pointerEvents: "none"
        }}
      />
      <div style={{ padding: 16, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ color: theme.muted, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em" }}>
            BUYING POWER
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              padding: "4px 8px",
              borderRadius: 999,
              background: dark ? "rgba(43,182,255,0.2)" : "rgba(22,119,255,0.12)",
              color: accent,
              border: `1px solid ${dark ? "rgba(43,182,255,0.4)" : "rgba(22,119,255,0.25)"}`
            }}
          >
            No cap
          </span>
        </div>

        <div
          className="balance-infinity"
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            lineHeight: 1
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 200,
              letterSpacing: "-0.06em",
              background: dark
                ? `linear-gradient(135deg, #EAF0FF 20%, ${accent} 90%)`
                : `linear-gradient(135deg, #0B1220 10%, ${accent} 85%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              fontFamily: "Georgia, 'Times New Roman', serif"
            }}
          >
            ∞
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 750,
              color: theme.text,
              opacity: 0.92
            }}
          >
            Unlimited
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            fontWeight: 650,
            color: theme.muted,
            lineHeight: 1.45
          }}
        >
          Trade any size — no ₹1L ceiling. Your paper portfolio never runs dry.
        </div>
      </div>
    </Card>
  );
}
