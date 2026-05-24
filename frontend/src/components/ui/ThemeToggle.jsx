import { Icon } from "../icons/Icon.jsx";

const OPTIONS = [
  { id: "light", label: "Light", icon: "sun", dark: false },
  { id: "dark", label: "Dark", icon: "moon", dark: true }
];

export function ThemeToggle({ dark, onToggle, theme, fullWidth = true }) {
  return (
    <div
      role="group"
      aria-label="Color theme"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        width: fullWidth ? "100%" : "auto",
        padding: 3,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: theme.chip,
        gap: 3,
        boxSizing: "border-box"
      }}
    >
      {OPTIONS.map((opt) => {
        const active = dark === opt.dark;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            aria-label={`${opt.label} mode`}
            onClick={() => onToggle(opt.dark)}
            style={{
              appearance: "none",
              border: "none",
              margin: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: 38,
              padding: "8px 10px",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              color: active ? theme.text : theme.muted,
              background: active ? theme.panel : "transparent",
              boxShadow: active ? theme.shadow : "none",
              transition: "background 160ms ease, color 160ms ease, box-shadow 160ms ease"
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                flexShrink: 0
              }}
            >
              <Icon name={opt.icon} color={active ? theme.accent : theme.muted} />
            </span>
            <span style={{ lineHeight: 1 }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
