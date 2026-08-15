import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { CompensationRow } from '../model/derive';
import { formatMoney, formatPercent } from '../format';
import { useChart } from '../charts/useChart';
import { GRID_TOP_PLAIN, GRID_TOP_WITH_LEGEND, LEGEND_TOP } from '../charts/legend';
import { useChartTheme, type ChartTheme } from '../charts/palette';

const money = (v: number) => formatMoney(v);

function axisMoney(value: number): string {
  return Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
}

/** Short label for a compensation step: the year, plus a suffix if repeated. */
function stepLabels(rows: CompensationRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const year = r.date.slice(0, 4);
    const n = (seen.get(year) ?? 0) + 1;
    seen.set(year, n);
    return n === 1 ? year : `${year} (${n})`;
  });
}

export function RaisesCharts({ rows }: { rows: CompensationRow[] }) {
  const theme = useChartTheme();
  if (!rows.length) return null;
  return (
    <div className="chart-grid">
      <CompositionChart rows={rows} theme={theme} />
      <IncreaseChart rows={rows} theme={theme} />
    </div>
  );
}

/**
 * Total compensation over time, broken into what it is made of.
 *
 * Stacked rather than three lines: the question this answers is "how much of
 * the jump was actually salary", which composition shows directly. Base sits at
 * the bottom because it is the part that persists.
 */
function CompositionChart({ rows, theme }: { rows: CompensationRow[]; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = stepLabels(rows);
    const bands = [
      { name: 'Base salary', color: theme.series[0], data: rows.map((r) => r.baseSalary) },
      { name: 'Sign-on bonus', color: theme.series[1], data: rows.map((r) => r.signOnBonus) },
      { name: 'Stock vesting', color: theme.series[2], data: rows.map((r) => r.stockVesting) },
    ];

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Total compensation, and what it is made of',
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
        axisPointer: { type: 'shadow' },
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
        axisLabel: { color: theme.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: axisMoney },
      },
      series: bands.map((band) => ({
        name: band.name,
        type: 'bar' as const,
        stack: 'comp',
        barMaxWidth: 40,
        itemStyle: { color: band.color },
        emphasis: { focus: 'series' as const },
        data: band.data,
      })),
    };
  }, [rows, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}

/**
 * The size of each step, as a percentage.
 *
 * Its own chart rather than a second axis on the one above: percentages and
 * dollars do not share a scale, and overlaying them would invite reading a
 * crossing point that means nothing.
 */
function IncreaseChart({ rows, theme }: { rows: CompensationRow[]; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    // The first row has nothing to compare against.
    const steps = rows.slice(1);
    const labels = stepLabels(rows).slice(1);

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Size of each raise, against total compensation',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: { top: GRID_TOP_PLAIN, left: 52, right: 16, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
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
        axisLabel: { color: theme.muted, fontSize: 11 },
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
          // One series, so no legend — the title names it.
          name: 'Increase',
          type: 'bar',
          barMaxWidth: 40,
          data: steps.map((r) => ({
            value: r.totalIncrease ?? 0,
            // A cut would read as an increase if it wore the same colour.
            itemStyle: {
              color: (r.totalIncrease ?? 0) < 0 ? theme.negative : theme.series[0],
            },
          })),
          label: {
            show: true,
            position: 'top',
            color: theme.textSecondary,
            fontSize: 10,
            formatter: (p: { value: unknown }) => formatPercent(Number(p.value)),
          },
        },
      ],
    };
  }, [rows, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}
