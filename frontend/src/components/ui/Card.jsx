import React from "react";

export function Card({ children, style, className }) {
  return (
    <div className={className} style={{ borderRadius: 18, ...style }}>
      {children}
    </div>
  );
}
