declare module "react-native-chart-kit" {
  import * as React from "react";
  import { ViewStyle } from "react-native";

  type ChartConfig = {
    backgroundGradientFrom: string;
    backgroundGradientTo: string;
    decimalPlaces?: number;
    color: (opacity?: number) => string;
    labelColor?: (opacity?: number) => string;
    propsForBackgroundLines?: any;
    fillShadowGradient?: string;
    fillShadowGradientOpacity?: number;
    barPercentage?: number;
  };

  type BarData = { labels: string[]; datasets: { data: number[] }[] };

  export const BarChart: React.ComponentType<{
    data: BarData;
    width: number;
    height: number;
    chartConfig: ChartConfig;
    fromZero?: boolean;
    showValuesOnTopOfBars?: boolean;
    yAxisLabel?: string;
    yAxisSuffix?: string;
    style?: ViewStyle;
  }>;

  export const LineChart: React.ComponentType<any>;
  export const PieChart: React.ComponentType<any>;
}
