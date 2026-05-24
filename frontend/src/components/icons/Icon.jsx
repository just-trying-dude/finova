export function Icon({ name, color }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    style: { display: "block", flexShrink: 0 }
  };
  const stroke = color || "currentColor";
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
          <path d="M7 7V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6 7h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.8" />
          <path d="M9 12h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "explore":
      return (
        <svg {...common}>
          <path d="M10.5 13.5 8 16l2.5-7.5L16 8l-2.5 7.5L8 16l7.5-2.5Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke={stroke} strokeWidth="1.8" />
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
          <path d="M7 7h10M7 12h10M7 17h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke={stroke} strokeWidth="1.8" />
          <path d="M16.2 16.2 21 21" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
            stroke={stroke}
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" stroke={stroke} strokeWidth="1.85" />
          <path
            d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            stroke={stroke}
            strokeWidth="1.85"
            strokeLinecap="round"
          />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path
            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
            stroke={stroke}
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M16 17l5-5-5-5" stroke={stroke} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12H9" stroke={stroke} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}
