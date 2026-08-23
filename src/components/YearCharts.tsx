import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { GROUP_LABELS, MONTHS, type Year } from '../model/schema';
import { groupMonthlyTotals, leftOverMonthly, yearTotals } from '../model/derive';
import { formatMoney } from '../format';
import { useChart } from '../charts/useChart';
import { GRID_TOP_WITH_LEGEND, LEGEND_TOP } from '../charts/legend';
import { useChartTheme, type ChartTheme } from '../charts/palette';

/**
 * The two per-year charts from the source workbook: a stacked area of where each
 * month's money went, and the four-way split of the year.
 *
 * The donut replaces the workbook's 3D pie deliberately — perspective distorts
 * the slice areas the chart exists to compare.
 */
export function YearCharts({ year }: { year: Year }) {
  const theme = useChartTheme();
  return (
    <div className="chart-row">
      <SpendingSummary year={year} theme={theme} />
      <YearSplit year={year} theme={theme} />
    </div>
  );
}

const money = (v: number) => formatMoney(v);

function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}

/** The donut's title counts its slices, and reads better in words. */
const PART_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

function SpendingSummary({ year, theme }: { year: Year; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const costOfLiving = groupMonthlyTotals(year, 'costOfLiving');
    const debt = groupMonthlyTotals(year, 'debt');
    const assets = groupMonthlyTotals(year, 'assets');
    const discretionary = groupMonthlyTotals(year, 'discretionary');
    const leftOver = leftOverMonthly(year);
    const income = groupMonthlyTotals(year, 'income');

    // Stacking order matches the workbook: Cost of Living at the base.
    const bands: { name: string; data: number[]; color: string }[] = [
      { name: 'Cost of Living', data: costOfLiving, color: theme.series[0] },
      { name: 'Debt', data: debt, color: theme.series[1] },
      { name: 'Assets', data: assets, color: theme.series[2] },
      // Omitted where it holds nothing, so years predating the section do not
      // carry a permanently flat band and a legend entry explaining nothing.
      ...(discretionary.some((v) => v !== 0)
        ? [{ name: GROUP_LABELS.discretionary, data: discretionary, color: theme.series[4] }]
        : []),
      { name: 'Left Over', data: leftOver, color: theme.series[3] },
    ];

    return {
      backgroundColor: 'transparent',
      // Off deliberately: these charts redraw on every year-tab click, and a
      // re-entry animation each time is noise in a tool meant for scanning
      // numbers. It also means a chart paints synchronously rather than over
      // animation frames.
      animation: false,
      title: {
        text: `${year.year} — where each month went`,
        left: 0,
        textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
      },
      // Explicit margins rather than `containLabel`, which ECharts 6 removed.
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
        axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
        backgroundColor: theme.surface,
        borderColor: theme.gridline,
        textStyle: { color: theme.textPrimary, fontSize: 12 },
        valueFormatter: (v) => money(Number(v)),
      },
      xAxis: {
        type: 'category',
        data: [...MONTHS],
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
        ...bands.map((band) => ({
          name: band.name,
          type: 'line' as const,
          stack: 'total',
          smooth: false,
          showSymbol: false,
          areaStyle: { color: band.color, opacity: 1 },
          // The legend swatch reads itemStyle, not areaStyle. Without this it
          // falls back to ECharts' own palette by series index, so the key
          // disagrees with the plot — and silently re-colours every band after
          // one is inserted.
          itemStyle: { color: band.color },
          // A surface-coloured stroke separates adjacent bands.
          lineStyle: { color: theme.surface, width: 2 },
          emphasis: { focus: 'series' as const },
          data: band.data,
        })),
        {
          // Dashed and in neutral ink so it reads as a reference, not a series.
          // It sits below the stack top by the pre-income contribution, which is
          // counted in Assets but never came out of take-home pay.
          name: 'Take-home pay',
          type: 'line' as const,
          smooth: false,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: theme.textSecondary, width: 2, type: 'dashed' },
          itemStyle: { color: theme.textSecondary },
          z: 5,
          data: income,
        },
      ],
    };
  }, [year, theme]);

  const ref = useChart(option);
  return <div className="chart" ref={ref} />;
}

function YearSplit({ year, theme }: { year: Year; theme: ChartTheme }) {
  const option = useMemo<EChartsOption>(() => {
    const totals = yearTotals(year);
    const slices = [
      { name: 'Cost of Living', value: totals.costOfLiving, color: theme.series[0] },
      { name: 'Debt', value: totals.debt, color: theme.series[1] },
      { name: 'Assets', value: totals.assets, color: theme.series[2] },
      { name: GROUP_LABELS.discretionary, value: totals.discretionary, color: theme.series[4] },
      { name: 'Left Over', value: totals.leftOver, color: theme.series[3] },
    ].filter((s) => s.value > 0);

    return {
      backgroundColor: 'transparent',
      // Off deliberately: these charts redraw on every year-tab click, and a
      // re-entry animation each time is noise in a tool meant for scanning
      // numbers. It also means a chart paints synchronously rather than over
      // animation frames.
      animation: false,
      title: [
        {
          text: `${year.year} — the year in ${PART_WORDS[slices.length] ?? slices.length} parts`,
          left: 0,
          textStyle: { color: theme.textPrimary, fontSize: 13, fontWeight: 600 },
        },
        {
          // Centre label: the figure every slice is a share of.
          text: money(totals.income),
          subtext: 'take-home pay',
          left: '30%',
          top: '46%',
          textAlign: 'center',
          textStyle: { color: theme.textPrimary, fontSize: 16, fontWeight: 600 },
          subtextStyle: { color: theme.muted, fontSize: 11 },
        },
      ],
      tooltip: {
        trigger: 'item',
        backgroundColor: theme.surface,
        borderColor: theme.gridline,
        textStyle: { color: theme.textPrimary, fontSize: 12 },
        formatter: (p) => {
          const point = p as { name: string; value: number };
          const share = totals.income ? point.value / totals.income : 0;
          return `${point.name}<br/><strong>${money(point.value)}</strong> · ${(share * 100).toFixed(1)}% of take-home`;
        },
      },
      legend: {
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['31%', '56%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            color: theme.textSecondary,
            fontSize: 11,
            formatter: (p) => {
              const point = p as { value: number };
              const share = totals.income ? point.value / totals.income : 0;
              return `${(share * 100).toFixed(1)}%`;
            },
          },
          labelLine: { length: 6, length2: 6, lineStyle: { color: theme.axis } },
          // A surface ring separates neighbouring slices.
          itemStyle: { borderColor: theme.surface, borderWidth: 2 },
          data: slices.map((s) => ({
            name: s.name,
            value: s.value,
            itemStyle: { color: s.color, borderColor: theme.surface, borderWidth: 2 },
          })),
        },
      ],
    };
  }, [year, theme]);

  const ref = useChart(option);
  const totals = yearTotals(year);
  const preIncome =
    totals.assets +
    totals.debt +
    totals.costOfLiving +
    totals.discretionary +
    totals.leftOver -
    totals.income;

  return (
    <div className="chart-with-note">
      <div className="chart" ref={ref} />
      {preIncome > 0.01 && (
        <p className="chart-note">
          Parts total {money(totals.income + preIncome)} — {money(preIncome)} more than take-home,
          because pre-income contributions count under Assets but never came out of your pay.
        </p>
      )}
    </div>
  );
}
