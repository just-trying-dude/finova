import React from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { shouldAnimate } from "../../lib/sessionAnimations.js";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";

const COLORS = ["#2BB6FF", "#7C5CFF", "#34D399", "#FF8A4C", "#F472B6", "#FBBF24", "#94A3B8"];
const PIE_WIDTH = 300;
const PIE_HEIGHT = 220;

function SectorTooltip({ active, payload, theme }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = row?.name ?? row?.payload?.name ?? "Sector";
  const pct = Number(row?.value ?? row?.payload?.value);

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: theme.shadow,
        padding: "10px 12px",
        minWidth: 140
      }}
    >
      <div style={{ fontWeight: 950, fontSize: 13, color: theme.text }}>{name}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: theme.muted }}>
        {Number.isFinite(pct) ? `${pct.toFixed(1)}% allocation` : "—"}
      </div>
    </div>
  );
}

export function SectorAllocationChart({ sectors, theme }) {
  const { ref, visible } = useScrollReveal({ threshold: 0.15 });

  if (!sectors?.length) {
    return <div style={{ color: theme.muted, fontSize: 13, padding: 20, textAlign: "center" }}>No allocation data</div>;
  }

  const data = sectors.map((s, i) => ({
    name: s.sector,
    value: s.pct,
    fill: COLORS[i % COLORS.length]
  }));

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          width: PIE_WIDTH,
          maxWidth: "100%",
          height: PIE_HEIGHT,
          margin: "0 auto",
          overflow: "hidden"
        }}
      >
        {visible ? (
          <PieChart width={PIE_WIDTH} height={PIE_HEIGHT} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx={PIE_WIDTH / 2}
              cy={PIE_HEIGHT / 2}
              innerRadius={PIE_HEIGHT * 0.26}
              outerRadius={PIE_HEIGHT * 0.39}
              paddingAngle={2}
              isAnimationActive={shouldAnimate()}
              animationDuration={shouldAnimate() ? 900 : 0}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<SectorTooltip theme={theme} />} />
          </PieChart>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          justifyContent: "center",
          marginTop: 12,
          width: "100%",
          maxWidth: 360
        }}
      >
        {data.map((d) => (
          <span key={d.name} style={{ fontSize: 11, fontWeight: 750, color: theme.muted, whiteSpace: "nowrap" }}>
            <span style={{ color: d.fill }}>●</span> {d.name} {d.value}%
          </span>
        ))}
      </div>
    </div>
  );
}
