import { useMemo } from 'react';
import { useBudget } from '../store/useBudget';
import { compensationRows } from '../model/derive';
import { formatMoney, formatPercent } from '../format';
import { RaisesCharts } from '../components/RaisesCharts';
import { CompensationTable, VestingTable } from '../components/RaisesTables';

export function RaisesView() {
  const doc = useBudget((s) => s.doc);
  const addRaise = useBudget((s) => s.addRaise);

  const rows = useMemo(() => (doc ? compensationRows(doc) : []), [doc]);

  if (!doc) return null;

  if (!rows.length) {
    return (
      <div className="overview-view">
        <div className="gate">
          <h2>No compensation history yet</h2>
          <p>
            Run <code>npm run import</code> to bring across the Raises sheet, or add the first step
            by hand.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                addRaise({ date: new Date().toISOString().slice(0, 10), baseSalary: 0 })
              }
            >
              Add compensation step
            </button>
          </div>
        </div>
      </div>
    );
  }

  const first = rows[0];
  const today = new Date().toISOString().slice(0, 10);

  // Rows can be dated ahead — the source sheet carries projected raises. Those
  // must not be reported as what you earn now.
  const effective = rows.filter((r) => r.date <= today);
  const current = effective.length ? effective[effective.length - 1] : first;
  const upcoming = rows.length - effective.length;

  const growth = first.totalComp === 0 ? null : current.totalComp / first.totalComp - 1;

  return (
    <div className="overview-view">
      <div className="stat-row">
        <Stat label="Base salary now" value={formatMoney(current.baseSalary)} />
        <Stat label="Total comp now" value={formatMoney(current.totalComp)} />
        <Stat
          label={`Growth since ${first.date.slice(0, 4)}`}
          value={growth === null ? '—' : formatPercent(growth)}
        />
        <Stat
          label="Steps recorded"
          value={upcoming > 0 ? `${rows.length} (${upcoming} ahead)` : String(rows.length)}
        />
      </div>

      {upcoming > 0 && (
        <p className="chart-note">
          {upcoming} {upcoming === 1 ? 'step is' : 'steps are'} dated in the future and excluded
          from the figures above — the most recent effective step is {current.date}.
        </p>
      )}

      <RaisesCharts rows={rows} />

      <h2 className="section-heading">Compensation history</h2>
      <CompensationTable rows={rows} />

      <h2 className="section-heading">Vesting events</h2>
      <VestingTable events={doc.vestingEvents} />

      <p className="grid-hint">
        Every change column is derived from the row above it, so adding a step needs no formulas
        dragged down — click any white field to edit it. <strong>Total comp</strong> is base plus
        sign-on plus vesting stock, matching your spreadsheet. Vesting value uses the price
        recorded against each vest, not today’s price.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
