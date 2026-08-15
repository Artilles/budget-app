import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { BudgetDoc } from '../model/schema';
import { type OverviewRow, careerMonths, investmentSeries } from '../model/derive';
import { formatMoney } from '../format';
import { useChart } from '../charts/useChart';
import { GRID_TOP_PLAIN, GRID_TOP_WITH_LEGEND, LEGEND_TOP } from '../charts/legend';
import { useChartTheme, type ChartTheme } from '../charts/palette';
import { InvestmentGrowthChart } from './InvestmentCharts';

const money = (v: number) => formatMoney(v);

function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}

export function OverviewCharts({ doc, rows }: { doc: BudgetDoc; rows: OverviewRow[] }) {
  const theme = useChartTheme();
  const investments = useMemo(() => investmentSeries(doc), [doc]);

  return (
    <div className="chart-grid">
      <IncomeTrend rows={rows} theme={theme} />
      <CareerIncome rows={rows} theme={theme} />
      <CareerSpending doc={doc} theme={theme} />
      <InvestmentGrowthChart summary={investments} />
    </div>
  );
}

/**
 * Take-home per year — the trajectory rather than the composition.
 *
 * A single series, so no legend: the title names it. Points are marked because
 * each one is a whole year and worth being able to pick out.
 */
function IncomeTrend({ rows, theme }: { rows: OverviewRow[]; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Income across the years',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: { top: GRID_TOP_PLAIN, left: 58, right: 16, bottom: 28 },
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
        data: rows.map((r) => String(r.year)),
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: axisMoney },
      },
      series: [
        {
          name: 'Take home',
          type: 'line',
          smooth: false,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: theme.series[3], width: 2 },
          itemStyle: { color: theme.series[3] },
          areaStyle: { color: theme.series[3], opacity: 0.14 },
          data: rows.map((r) => r.takeHome),
        },
      ],
    };
  }, [rows, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}

/**
 * Where each year's take-home went: kept as an asset, or spent.
 *
 * The two together are exactly take-home, so the bar height is the year's
 * income. Aqua stays "money you kept" as it does everywhere else, and orange
 * rather than blue sits beside it because that pair clears the colourblind
 * floors by a wide margin where aqua-beside-blue does not.
 */
function CareerIncome({ rows, theme }: { rows: OverviewRow[]; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const years = rows.map((r) => String(r.year));
    const bands = [
      { name: 'Invested', color: theme.series[2], data: rows.map((r) => r.invested) },
      { name: 'Spent', color: theme.series[1], data: rows.map((r) => r.spent) },
    ];

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Where each year’s take-home went',
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      grid: { top: GRID_TOP_WITH_LEGEND, left: 58, right: 16, bottom: 28 },
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
        data: years,
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
        stack: 'pay',
        barMaxWidth: 34,
        itemStyle: { color: band.color },
        emphasis: { focus: 'series' as const },
        data: band.data,
      })),
    };
  }, [rows, theme]);

  return <div className="chart tall" ref={useChart(option)} />;
}

/**
 * Every month since 2016, stacked. This replaces the workbook's "Data Plot"
 * sheet, which held the same series as ~180 hand-written cross-sheet formulas
 * per row; here it is derived, so a new year needs no wiring.
 */
function CareerSpending({ doc, theme }: { doc: BudgetDoc; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const months = careerMonths(doc);
    const labels = months.map((m) => m.month);

    // Same colour per entity as the per-year charts — identity must not shift
    // between views.
    const bands = [
      { name: 'Cost of Living', color: theme.series[0], pick: (m: (typeof months)[0]) => m.costOfLiving },
      { name: 'Debt', color: theme.series[1], pick: (m: (typeof months)[0]) => m.debt },
      { name: 'Assets', color: theme.series[2], pick: (m: (typeof months)[0]) => m.assets },
      { name: 'Recreation / Left Over', color: theme.series[3], pick: (m: (typeof months)[0]) => m.leftOver },
    ];

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: 'Every month, since the beginning',
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
        // ~180 points: label only the Januaries, or the axis becomes a smear.
        axisLabel: {
          color: theme.muted,
          fontSize: 11,
          interval: (_i: number, value: string) => value.endsWith('-01'),
          formatter: (value: string) => value.slice(0, 4),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: theme.gridline } },
        axisLabel: { color: theme.muted, fontSize: 11, formatter: axisMoney },
      },
      series: bands.map((band) => ({
        name: band.name,
        type: 'line' as const,
        stack: 'total',
        showSymbol: false,
        areaStyle: { color: band.color, opacity: 1 },
        lineStyle: { color: theme.surface, width: 1 },
        emphasis: { focus: 'series' as const },
        data: months.map(band.pick),
      })),
    };
  }, [doc, theme]);

  const ref = useChart(option);
  return <div className="chart tall" ref={ref} />;
}
