import {
  GROUPS,
  GROUP_LABELS,
  MONTHS,
  type BudgetDoc,
  type Group,
  type Year,
} from '../model/schema';
import {
  groupMonthlyTotals,
  groupTotal,
  leftOverMonthly,
  lineTotal,
  linesIn,
  shareOfGroup,
} from '../model/derive';
import { formatAmount, formatPercent } from '../format';
import { MoneyCell } from './MoneyCell';
import { useBudget } from '../store/useBudget';

interface Props {
  doc: BudgetDoc;
  year: Year;
  /** Renders the amounts read-only; the model refuses the edits regardless. */
  locked?: boolean;
}

/** Marks a figure that has gone negative, so the whole cell reads as a warning. */
function numClass(value: number, extra = ''): string {
  return `num${extra ? ` ${extra}` : ''}${value < 0 ? ' negative-cell' : ''}`;
}

/**
 * The twelve-month amounts grid.
 *
 * Sized to fit the window rather than scroll: `table-layout: fixed` with
 * proportional columns, so the last months and the totals stay on screen at any
 * width. Structure editing lives in `CategoryEditor`, which is why there are no
 * controls competing for room in the label column here.
 */
export function YearGrid({ doc, year, locked }: Props) {
  const leftOver = leftOverMonthly(year);
  const leftOverTotal = leftOver.reduce((a, b) => a + b, 0);

  return (
    <div className="grid-scroll">
      <table className={`year-grid${locked ? ' locked' : ''}`}>
        <thead>
          {/* Column widths come from this row: table-layout is fixed. */}
          <tr>
            <th className="col-label">Category</th>
            {MONTHS.map((m) => (
              <th key={m} className="c-month">
                {m}
              </th>
            ))}
            <th className="c-total">Total</th>
            <th className="c-share">% of group</th>
          </tr>
        </thead>

        {GROUPS.map((group) => (
          <GroupBody key={group} group={group} doc={doc} year={year} locked={locked} />
        ))}

        <tfoot style={{ '--group-color': 'var(--group-leftOver)' } as React.CSSProperties}>
          <tr className="row-leftover">
            <th className="col-label">Recreation / Left Over</th>
            {leftOver.map((v, i) => (
              <td key={i} className={numClass(v)}>
                {formatAmount(v)}
              </td>
            ))}
            <td className={numClass(leftOverTotal, 'total c-total')}>{formatAmount(leftOverTotal)}</td>
            <td className="c-share" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupBody({ group, doc, year, locked }: Props & { group: Group }) {
  const setMonth = useBudget((s) => s.setMonth);
  const fillAcross = useBudget((s) => s.fillAcross);

  const lines = linesIn(year, group);
  if (!lines.length) return null;

  const monthly = groupMonthlyTotals(year, group);
  const total = groupTotal(year, group);

  return (
    // Each group carries its chart colour, which tints the block below it.
    <tbody style={{ '--group-color': `var(--group-${group})` } as React.CSSProperties}>
      <tr className="row-group">
        <th className="col-label" colSpan={15}>
          {GROUP_LABELS[group]}
        </th>
      </tr>

      {lines.map((line) => {
        const category = doc.categories[line.categoryId];
        const total = lineTotal(line);
        return (
          <tr key={line.categoryId}>
            <th className="col-label">
              <span className="line-name" title={category?.name ?? line.categoryId}>
                {category?.name ?? line.categoryId}
              </span>
              {line.informational && (
                <span
                  className="flag"
                  title="Tracked but not counted in this group's total — already included in another line."
                >
                  not counted
                </span>
              )}
              {line.preIncome && (
                <span
                  className="flag"
                  title="Deducted before take-home pay. Counts in this group's total, but is not subtracted again from left-over."
                >
                  pre-income
                </span>
              )}
            </th>

            {line.months.map((value, i) => (
              <td key={i} className={`cell${(value ?? 0) < 0 ? ' negative-cell' : ''}`}>
                <MoneyCell
                  value={value}
                  categoryId={line.categoryId}
                  monthIndex={i}
                  disabled={locked}
                  onChange={(v) => setMonth(line.categoryId, i, v)}
                  onFill={() => fillAcross(line.categoryId, i)}
                />
              </td>
            ))}

            <td className={numClass(total, 'total c-total')}>{formatAmount(total)}</td>
            <td className="num share c-share">
              {line.informational ? '—' : formatPercent(shareOfGroup(year, line))}
            </td>
          </tr>
        );
      })}

      <tr className="row-subtotal">
        <th className="col-label">Total {GROUP_LABELS[group]}</th>
        {monthly.map((v, i) => (
          <td key={i} className={numClass(v)}>
            {formatAmount(v)}
          </td>
        ))}
        <td className={numClass(total, 'total c-total')}>{formatAmount(total)}</td>
        <td className="c-share" />
      </tr>
    </tbody>
  );
}
