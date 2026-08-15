import { useMemo } from 'react';
import { useBudget } from '../store/useBudget';
import { groupTotal } from '../model/derive';
import { formatMoney, formatPercent } from '../format';
import { useToolState } from './useToolState';
import { ToolField, ToolResult } from './ToolField';

export const EMERGENCY_FUND_ID = 'emergency-fund';

/**
 * How long could you live on what you have saved?
 *
 * The workbook version made you type a monthly expense figure. This one can
 * take it from a real year — cost of living plus debt payments, which is what
 * actually still has to be paid when income stops.
 */
export function EmergencyFund() {
  const doc = useBudget((s) => s.doc);
  const { number, text, set } = useToolState(EMERGENCY_FUND_ID);

  const years = useMemo(() => (doc ? Object.keys(doc.years).sort().reverse() : []), [doc]);
  // Saved with the budget, not component state — the chosen year is data you
  // entered, and losing it on navigation is the same bug as losing an amount.
  const stored = text('sourceYear', '');
  const sourceYear = years.includes(stored) ? stored : (years[0] ?? '');
  const setSourceYear = (year: string) => set({ sourceYear: year });

  const derivedMonthly = useMemo(() => {
    const year = doc?.years[sourceYear];
    if (!year) return null;
    // What still has to be paid with no income: living costs and debt.
    return (groupTotal(year, 'costOfLiving') + groupTotal(year, 'debt')) / 12;
  }, [doc, sourceYear]);

  const useDerived = number('useDerived', 1) === 1;
  const manualMonthly = number('monthlyExpenses', 5000);
  const monthly = useDerived && derivedMonthly !== null ? derivedMonthly : manualMonthly;

  const months = number('months', 12);
  const saved = number('saved', 0);

  const target = monthly * months;
  const ratio = target === 0 ? null : saved / target;
  const difference = saved - target;
  const runway = monthly === 0 ? null : saved / monthly;

  return (
    <div className="tool">
      <div className="tool-inputs">
        <div className="tool-field">
          <span className="tool-field-label">Monthly expenses</span>
          <span className="tool-input-wrap">
            <select
              className="tool-input"
              value={useDerived ? sourceYear : 'manual'}
              onChange={(e) => {
                if (e.target.value === 'manual') {
                  set({ useDerived: 0 });
                } else {
                  setSourceYear(e.target.value);
                  set({ useDerived: 1 });
                }
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  From {y}
                </option>
              ))}
              <option value="manual">Enter manually</option>
            </select>
          </span>
          <span className="tool-field-hint">
            {useDerived && derivedMonthly !== null
              ? `${formatMoney(derivedMonthly)} a month — ${sourceYear} cost of living plus debt payments, divided by twelve.`
              : 'Typed in below.'}
          </span>
        </div>

        {(!useDerived || derivedMonthly === null) && (
          <ToolField
            label="Monthly expenses"
            value={manualMonthly}
            suffix="/mo"
            onCommit={(v) => set({ monthlyExpenses: v })}
          />
        )}

        <ToolField
          label="Months of runway wanted"
          value={months}
          suffix="months"
          onCommit={(v) => set({ months: v })}
        />

        <ToolField
          label="Currently set aside"
          value={saved}
          onCommit={(v) => set({ saved: v })}
        />
      </div>

      <div className="tool-results">
        <ToolResult label="Target fund" value={formatMoney(target)} emphasis />
        <ToolResult
          label={difference >= 0 ? 'Surplus' : 'Shortfall'}
          value={formatMoney(Math.abs(difference))}
          tone={difference >= 0 ? 'good' : 'bad'}
          emphasis
        />
        <ToolResult
          label="Covered"
          value={ratio === null ? '—' : formatPercent(ratio)}
          detail={ratio !== null && ratio >= 1 ? 'Fully funded' : 'Not yet funded'}
        />
        <ToolResult
          label="Runway at this spend"
          value={runway === null ? '—' : `${runway.toFixed(1)} months`}
        />
      </div>
    </div>
  );
}
