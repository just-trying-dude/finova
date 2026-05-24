import React from "react";
import { FintechLineChart } from "./FintechLineChart.jsx";
import { ChartWhenVisible } from "./ChartWhenVisible.jsx";
import { ErrorBoundary } from "../ui/ErrorBoundary.jsx";

export function PortfolioTrendChart({ data, theme, color, currencySymbol, height = 200 }) {
  return (
    <ErrorBoundary theme={theme}>
      <ChartWhenVisible minHeight={height}>
        <FintechLineChart
          data={data || []}
          theme={theme}
          color={color}
          currencySymbol={currencySymbol}
          height={height}
          animated
        />
      </ChartWhenVisible>
    </ErrorBoundary>
  );
}
