import React from "react";
import { CardSkeleton, ChartSkeleton, StatSkeleton } from "./Skeleton.jsx";

export function PageSkeleton({ theme, variant = "dashboard" }) {
  if (variant === "markets") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ChartSkeleton theme={theme} height={160} />
        <ChartSkeleton theme={theme} height={280} />
        <CardSkeleton theme={theme} lines={4} />
      </div>
    );
  }

  if (variant === "portfolio") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <StatSkeleton theme={theme} count={4} />
        <ChartSkeleton theme={theme} height={220} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StatSkeleton theme={theme} count={3} />
      <ChartSkeleton theme={theme} height={200} />
      <CardSkeleton theme={theme} lines={5} />
    </div>
  );
}
