import React from "react";

export function Skeleton({ width = "100%", height = 14, radius = 8, theme, style }) {
  const bg = theme?.chip || "rgba(128,128,128,0.15)";
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${bg} 0%, ${theme?.panel || "#fff"} 50%, ${bg} 100%)`,
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.2s ease-in-out infinite",
        ...style
      }}
    />
  );
}

export function StatSkeleton({ theme, count = 4 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ borderRadius: 14, border: `1px solid ${theme.border}`, padding: 14, background: theme.panel }}
        >
          <Skeleton width="55%" height={10} theme={theme} />
          <Skeleton width="70%" height={22} theme={theme} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ theme, height = 200 }) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden" }}>
      <Skeleton width="100%" height={height} radius={12} theme={theme} />
    </div>
  );
}

export function CardSkeleton({ theme, lines = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? "40%" : "90%"} height={12} theme={theme} />
      ))}
    </div>
  );
}
