import type { Year } from '../model/schema';
import { yearTotals } from '../model/derive';
import { formatMoney, formatPercent } from '../format';

/**
 * The five figures the source workbook kept in its T/U summary box, laid out as
 * a single strip rather than a stacked block — it sits beside the year's title
 * instead of towering next to it, which keeps the grid above the fold.
 *
 * Labels are short because the grid immediately below names the same groups in
 * full; the percentage under each is its share of take-home.
 */
export function SummaryBox({ year }: { year: Year }) {
  const totals = yearTotals(year);
  const share = (v: number) => (totals.income === 0 ? 0 : v / totals.income);

  const cells: { label: string; value: number; emphasis?: boolean }[] = [
    { label: 'Take-home', value: totals.income, emphasis: true },
    { label: 'Assets', value: totals.assets },
    { label: 'Debt', value: totals.debt },
    { label: 'Cost of living', value: totals.costOfLiving },
    { label: 'Left over', value: totals.leftOver, emphasis: true },
  ];

  return (
    <div className="summary-bar">
      {cells.map(({ label, value, emphasis }) => (
        <div key={label} className={`summary-cell${emphasis ? ' emphasis' : ''}`}>
          <span className="summary-label">{label}</span>
          <span className={`summary-value${value < 0 ? ' negative' : ''}`}>
            {formatMoney(value)}
          </span>
          <span className="summary-share">{formatPercent(share(value))}</span>
        </div>
      ))}
    </div>
  );
}
