import { DEFAULT_CHART_RANGE_ID } from "../../utils/chartData.js";
import { FintechLineChart } from "./FintechLineChart.jsx";

/** Market index chart — points, shared range toolbar and styling. */
export function IndexLineChart(props) {
  return (
    <FintechLineChart
      {...props}
      valueMode="index"
      defaultRangeId={props.defaultRangeId ?? DEFAULT_CHART_RANGE_ID}
      showRangeSelector={props.showRangeSelector ?? true}
    />
  );
}
