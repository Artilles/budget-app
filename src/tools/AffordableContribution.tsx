import { useMemo } from 'react';
import { useBudget } from '../store/useBudget';
import { groupTotal } from '../model/derive';
import { formatMoney, formatPercent } from '../format';
import { useToolState } from './useToolState';
import { ToolField, ToolResult } from './ToolField';

export const AFFORDABLE_CONTRIBUTION_ID = 'affordable-contribution';

/**
 * How much could realistically go into savings this year?
 *
 * Take-home minus committed spending, with a safety buffer on the spending so a
 * bad month does not force the money straight back out. Both figures come from
 * a real year rather than being typed twice, which is what the workbook's
 * version needed.
 */
export function AffordableContribution() {
  const doc = useBudget((s) => s.doc);
  const { number, text, set } = useToolState(AFFORDABLE_CONTRIBUTION_ID);

  const years = useMemo(() => (doc ? Object.keys(doc.years).sort().reverse() : []), [doc]);
  // Saved with the budget rather than held in component state, so it survives
  // navigating away and reloading.
  const stored = text('sourceYear', '');
  const sourceYear = years.includes(stored) ? stored : (years[0] ?? '');
  const setSourceYear = (year: string) => set({ sourceYear: year });

  const basis = useMemo(() => {
    const year = doc?.years[sourceYear];
    if (!year) return null;
    return {
      income: groupTotal(year, 'income'),
      committed: groupTotal(year, 'costOfLiving') + groupTotal(year, 'debt'),
    };
  }, [doc, sourceYear]);

  const bufferPercent = number('bufferPercent', 15);

  if (!basis) {
    return (
      <div className="tool">
        <p className="tool-note">Add a year with income and expenses, and this will fill in.</p>
      </div>
    );
  }

  const buffered = basis.committed * (1 + bufferPercent / 100);
  const affordable = basis.income - buffered;
  const shareOfIncome = basis.income === 0 ? null : affordable / basis.income;

  return (
    <div className="tool">
      <div className="tool-inputs">
        <div className="tool-field">
          <span className="tool-field-label">Based on</span>
          <span className="tool-input-wrap">
            <select
              className="tool-input"
              value={sourceYear}
              onChange={(e) => setSourceYear(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </span>
          <span className="tool-field-hint">
            {formatMoney(basis.income)} take-home, {formatMoney(basis.committed)} committed to
            living costs and debt.
          </span>
        </div>

        <ToolField
          label="Safety buffer on spending"
          value={bufferPercent}
          suffix="%"
          hint="Assume expenses run this much over what the year actually recorded."
          onCommit={(v) => set({ bufferPercent: v })}
        />
      </div>

      <div className="tool-results">
        <ToolResult label="Spending with buffer" value={formatMoney(buffered)} />
        <ToolResult
          label={affordable >= 0 ? 'Could contribute' : 'Short by'}
          value={formatMoney(Math.abs(affordable))}
          tone={affordable >= 0 ? 'good' : 'bad'}
          emphasis
        />
        <ToolResult
          label="Share of take-home"
          value={shareOfIncome === null ? '—' : formatPercent(shareOfIncome)}
        />
        <ToolResult label="Per month" value={formatMoney(affordable / 12)} />
      </div>

      <p className="tool-note">
        This is a ceiling, not a plan — it assumes every dollar not committed to living costs or
        debt is available, and ignores anything already contributed this year.
      </p>
    </div>
  );
}
