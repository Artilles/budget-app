import type { OverviewRow, OverviewTotals } from '../model/derive';
import { formatMoney, formatPercent } from '../format';

/**
 * The per-year rollup, entirely derived — there is nothing to edit here.
 *
 * Every column is net: money that actually reached the account. Gross and tax
 * are deliberately absent; see `overviewRows`.
 */
export function OverviewTable({
  rows,
  totals,
}: {
  rows: OverviewRow[];
  totals: OverviewTotals;
}) {
  return (
    <div className="grid-scroll">
      <table className="overview-table">
        <thead>
          <tr>
            <th className="col-label">Year</th>
            <th>Take home</th>
            <th>Invested</th>
            <th>Spent</th>
            <th>% invested</th>
            <th className="sep">Taken home to date</th>
            <th>Invested to date</th>
            <th>% to date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <th className="col-label">{row.year}</th>
              <td className="num">{formatMoney(row.takeHome)}</td>
              <td className="num">{formatMoney(row.invested)}</td>
              <td className="num">{formatMoney(row.spent)}</td>
              <td className="num dim">{formatPercent(row.shareInvested)}</td>

              <td className="num sep dim">{formatMoney(row.takeHomeToDate)}</td>
              <td className="num dim">{formatMoney(row.investedToDate)}</td>
              <td className="num dim">{formatPercent(row.shareInvestedToDate)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="col-label">Total</th>
            <td className="num">{formatMoney(totals.takeHome)}</td>
            <td className="num">{formatMoney(totals.invested)}</td>
            <td className="num">{formatMoney(totals.spent)}</td>
            <td className="num">{formatPercent(totals.shareInvested)}</td>
            <td className="sep" colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
