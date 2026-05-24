export function buildTheme(dark) {
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
}
