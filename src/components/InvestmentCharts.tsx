import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { InvestmentSummary } from '../model/derive';
import { formatMoney, formatPercent } from '../format';
import { useChart } from '../charts/useChart';
import {
  GRID_TOP_PLAIN,
  GRID_TOP_WITH_LEGEND,
  gridTopForLegend,
  LEGEND_TOP,
  legendOverflows,
} from '../charts/legend';
import { useChartTheme, type ChartTheme } from '../charts/palette';

const money = (v: number) => formatMoney(v);

function axisMoney(value: number): string {
  return Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
}

/** Label only the Januaries — ~118 points would otherwise smear the axis. */
const yearOnly = {
  interval: (_i: number, value: string) => value.endsWith('-01'),
  formatter: (value: string) => value.slice(0, 4),
};

export function InvestmentCharts({ summary }: { summary: InvestmentSummary }) {
  const theme = useChartTheme();
  if (!summary.points.length) return null;
  return (
    <div className="chart-grid cols-3">
      <ByAccountChart summary={summary} theme={theme} />
      <GrowthChart summary={summary} theme={theme} />
      <RoiChart summary={summary} theme={theme} />
    </div>
  );
}

/** The growth chart on its own, for the Overview to reuse. */
export function InvestmentGrowthChart({ summary }: { summary: InvestmentSummary }) {
  const theme = useChartTheme();
  if (!summary.points.length) return null;
  return <GrowthChart summary={summary} theme={theme} />;
}

/** Where the money sits, stacked so the total is the top of the stack. */
function ByAccountChart({ summary, theme }: { summary: InvestmentSummary; theme: ChartTheme }) {
  // The legend wraps, so how much room it needs depends on how wide the chart
  // is. Measured after layout and fed back into grid.top; see charts/legend.ts.
  const [width, setWidth] = useState(0);

  const option = useMemo<EChartsOption>(() => {
    const labels = summary.points.map((p) => p.month);

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Balance by account',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: {
        top: gridTopForLegend(summary.accountLabels, width),
        left: 58,
        right: 16,
        bottom: 32,
      },
      legend: {
        // Paging rather than an ever-taller legend: past four rows the labels
        // would take more of the canvas than the plot they describe.
        type: legendOverflows(summary.accountLabels, width) ? 'scroll' : 'plain',
        top: LEGEND_TOP,
        left: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
        pageIconColor: theme.textSecondary,
        pageIconInactiveColor: theme.muted,
        pageTextStyle: { color: theme.textSecondary, fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
        backgroundColor: theme.surface,
        borderColor: theme.gridline,
        textStyle: { color: theme.textPrimary, fontSize: 12 },
        valueFormatter: (v) => money(Number(v)),
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, ...yearOnly },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: axisMoney },
      },
      series: summary.accountLabels.map((name, a) => ({
        name,
        type: 'line' as const,
        stack: 'accounts',
        showSymbol: false,
        areaStyle: { color: theme.series[a % theme.series.length], opacity: 1 },
        // No surface separator here, unlike the other stacks. Account balances
        // span 0.6% to 24% of the total, and a 1px divider swallows the
        // thinnest band entirely — a series present in the legend but absent
        // from the plot is worse than two bands meeting edge to edge.
        lineStyle: { width: 0 },
        emphasis: { focus: 'series' as const },
        data: summary.points.map((p) => p.balances[a]),
      })),
    };
  }, [summary, theme, width]);

  const ref = useChart(option);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return <div className="chart tall" ref={ref} />;
}

/**
 * Total balance against what was put in. The gap between the two lines is the
 * growth — the single most useful thing this data can show.
 */
function GrowthChart({ summary, theme }: { summary: InvestmentSummary; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = summary.points.map((p) => p.month);

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Total balance against contributions',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: { top: GRID_TOP_WITH_LEGEND, left: 58, right: 16, bottom: 32 },
      legend: {
        top: LEGEND_TOP,
        left: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
        backgroundColor: theme.surface,
        borderColor: theme.gridline,
        textStyle: { color: theme.textPrimary, fontSize: 12 },
        valueFormatter: (v) => money(Number(v)),
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, ...yearOnly },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: axisMoney },
      },
      series: [
        {
          name: 'Contributed',
          type: 'line',
          showSymbol: false,
          // Dashed: it is the baseline the balance is measured against.
          lineStyle: { color: theme.textSecondary, width: 2, type: 'dashed' },
          itemStyle: { color: theme.textSecondary },
          data: summary.points.map((p) => p.contributedToDate),
        },
        {
          name: 'Total balance',
          type: 'line',
          showSymbol: false,
          lineStyle: { color: theme.series[2], width: 2 },
          itemStyle: { color: theme.series[2] },
          areaStyle: { color: theme.series[2], opacity: 0.12 },
          data: summary.points.map((p) => p.totalBalance),
        },
      ],
    };
  }, [summary, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}

/** Its own chart: a percentage does not share an axis with dollars. */
function RoiChart({ summary, theme }: { summary: InvestmentSummary; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = summary.points.map((p) => p.month);

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Return on contributions',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: { top: GRID_TOP_PLAIN, left: 52, right: 16, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
        backgroundColor: theme.surface,
        borderColor: theme.gridline,
        textStyle: { color: theme.textPrimary, fontSize: 12 },
        valueFormatter: (v) => formatPercent(Number(v)),
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11, ...yearOnly },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: {
          color: theme.muted,
          fontSize: 11,
          formatter: (v: number) => `${Math.round(v * 100)}%`,
        },
      },
      series: [
        {
          // Single series, so no legend — the title names it.
          name: 'Return',
          type: 'line',
          showSymbol: false,
          lineStyle: { color: theme.series[0], width: 2 },
          itemStyle: { color: theme.series[0] },
          // A zero line makes "up or down" readable at a glance.
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: theme.axis, type: 'solid', width: 1 },
            label: { show: false },
            data: [{ yAxis: 0 }],
          },
          data: summary.points.map((p) => p.returnOnContributions),
        },
      ],
    };
  }, [summary, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}
