import React from "react";

function formatNewsTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

export function NewsFeed({ items, theme, loading, error, compact = false }) {
  if (loading) {
    return <div style={{ color: theme.muted, fontSize: 13, fontWeight: 700, padding: 12 }}>Loading news…</div>;
  }
  if (error) {
    return <div style={{ color: theme.red, fontSize: 13, fontWeight: 700, padding: 12 }}>{error}</div>;
  }
  if (!items?.length) {
    return <div style={{ color: theme.muted, fontSize: 13, fontWeight: 700, padding: 12 }}>No news available.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
      {items.map((n, i) => (
        <a
          key={`${n.url || n.title}-${i}`}
          href={n.url || "#"}
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration: "none",
            color: "inherit",
            borderRadius: 14,
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            padding: compact ? "10px 12px" : "14px 16px",
            display: "block",
            transition: "border-color 0.15s"
          }}
        >
          <div style={{ fontWeight: 850, fontSize: compact ? 13 : 14, lineHeight: 1.35 }}>{n.title}</div>
          <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 11, fontWeight: 700, color: theme.muted }}>
            <span>{n.source || "Market"}</span>
            {n.published_at ? <span>{formatNewsTime(n.published_at)}</span> : null}
          </div>
        </a>
      ))}
    </div>
  );
}
