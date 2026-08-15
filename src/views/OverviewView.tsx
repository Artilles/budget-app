import { useMemo } from 'react';
import { useBudget } from '../store/useBudget';
import { overviewRows, overviewTotals } from '../model/derive';
import { OverviewTable } from '../components/OverviewTable';
import { OverviewCharts } from '../components/OverviewCharts';

export function OverviewView() {
  const doc = useBudget((s) => s.doc);

  const rows = useMemo(() => (doc ? overviewRows(doc) : []), [doc]);
  const totals = useMemo(() => overviewTotals(rows), [rows]);

  if (!doc) return null;

  if (!rows.length) {
    return (
      <div className="gate">
        <h2>Nothing to summarise yet</h2>
        <p>
          The overview compares years against each other. Add a year, or run{' '}
          <code>npm run import</code>, and it will fill in.
        </p>
      </div>
    );
  }

  return (
    <div className="overview-view">
      {/* Charts lead: the shape of the years is the point, the table is the detail. */}
      <OverviewCharts doc={doc} rows={rows} />
      <OverviewTable rows={rows} totals={totals} />
      <p className="grid-hint">
        Every figure here is net — money that actually reached your account — and derived from the
        year sheets, so there is nothing to edit. <strong>Spent</strong> means take-home that did
        not become an asset, so it covers debt payments and cost of living together.
      </p>
    </div>
  );
}
