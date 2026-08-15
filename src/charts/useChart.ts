import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

// Registering only what is used keeps the bundle from pulling in all of ECharts.
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

/**
 * Binds an ECharts instance to a div.
 *
 * `option` is applied on every render, which is safe because ECharts diffs it
 * internally. The instance is resized by a ResizeObserver rather than a window
 * listener, so a chart inside a collapsing panel still lays out correctly.
 */
export function useChart(option: EChartsOption): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current);
    chart.current = instance;

    if (import.meta.env.DEV) {
      const g = globalThis as unknown as { __charts?: echarts.ECharts[] };
      g.__charts = [...(g.__charts ?? []), instance];
    }

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    // `true` replaces the option wholesale, so series removed between renders
    // (a category deleted, a year switched) do not linger.
    chart.current?.setOption(option, true);
  }, [option]);

  return ref;
}
