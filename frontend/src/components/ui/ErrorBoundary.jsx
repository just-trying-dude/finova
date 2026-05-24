import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const theme = this.props.theme || {
      panel: "#fff",
      text: "#0f172a",
      muted: "#64748b",
      border: "#e2e8f0",
      accent: "#1677ff"
    };

    return (
      <div
        style={{
          margin: 24,
          padding: 20,
          borderRadius: 16,
          border: `1px solid ${theme.border}`,
          background: theme.panel,
          maxWidth: 480
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 16, color: theme.text }}>Something went wrong</div>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: theme.muted, lineHeight: 1.5 }}>
          {error?.message || "This page could not be displayed."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 14,
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: theme.accent,
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}
