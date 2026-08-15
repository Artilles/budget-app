import { useMemo, useState } from 'react';
import { useBudget } from '../store/useBudget';
import { accountStartMonths, investmentSeries } from '../model/derive';
import { investmentGapFills } from '../model/mutate';
import { formatMoney, formatPercent } from '../format';
import { InvestmentCharts } from '../components/InvestmentCharts';
import { AccountManager, InvestmentGrid } from '../components/InvestmentGrid';

export function InvestmentsView() {
  const doc = useBudget((s) => s.doc);
  const investmentYear = useBudget((s) => s.investmentYear);
  const selectInvestmentYear = useBudget((s) => s.selectInvestmentYear);
  const fillInvestmentGaps = useBudget((s) => s.fillInvestmentGaps);
  const [managing, setManaging] = useState(false);

  const summary = useMemo(
    () =>
      doc
        ? investmentSeries(doc)
        : {
            points: [],
            accountLabels: [],
            totalContributed: 0,
            latest: null,
            monthsAfterLastBalance: 0,
          },
    [doc],
  );

  const byMonth = useMemo(
    () => new Map(summary.points.map((p) => [p.month, p])),
    [summary],
  );

  // Years worth showing: any with a budget, plus any with recorded balances.
  const years = useMemo(() => {
    if (!doc) return [];
    const set = new Set<string>(Object.keys(doc.years));
    for (const key of Object.keys(doc.investments.months)) set.add(key.slice(0, 4));
    return [...set].sort();
  }, [doc]);

  // Falls back to the most recent year when nothing is selected, or when a
  // previously selected year no longer exists.
  const year =
    investmentYear && years.includes(investmentYear)
      ? investmentYear
      : years[years.length - 1];

  // Scoped to the year on screen: filling is an action taken from a year, and
  // should not silently rewrite months in years you are not looking at.
  const gaps = useMemo(
    () => (doc && year ? investmentGapFills(doc, new Date(), year) : []),
    [doc, year],
  );

  const startMonths = useMemo(() => (doc ? accountStartMonths(doc) : {}), [doc]);

  if (!doc) return null;

  if (!years.length) {
    return (
      <div className="gate">
        <h2>Nothing to track yet</h2>
        <p>
          Add a budget year first — this page records what your accounts were worth at the end of
          each month, alongside what the budget put in.
        </p>
      </div>
    );
  }

  const onFillGaps = () => {
    if (!gaps.length) return;
    const months = new Set(gaps.map((g) => g.month));
    const ok = window.confirm(
      `Fill ${gaps.length} missing balance${gaps.length === 1 ? '' : 's'} across ` +
        `${months.size} month${months.size === 1 ? '' : 's'} of ${year}?\n\n` +
        `Each is interpolated between the readings either side — one missing month lands ` +
        `halfway, two split the difference in thirds.\n\n` +
        `They become ordinary entries you can edit or clear afterwards.`,
    );
    if (ok) fillInvestmentGaps(year);
  };

  const { latest } = summary;
  const yearPoints = summary.points.filter((p) => p.month.startsWith(year));
  const lastOfYear = yearPoints[yearPoints.length - 1] ?? null;

  return (
    <div className="overview-view">
      <nav className="year-tabs" aria-label="Investment year">
        {years.map((y) => (
          <button
            key={y}
            className={y === year ? 'year-tab active' : 'year-tab'}
            aria-current={y === year ? 'page' : undefined}
            onClick={() => selectInvestmentYear(y)}
          >
            {y}
          </button>
        ))}
        <span className="spacer" />
        <button
          disabled={!gaps.length}
          title={
            gaps.length
              ? `Fill ${gaps.length} missing balance${gaps.length === 1 ? '' : 's'} in ${year} by ` +
                `interpolating between the readings on either side`
              : `No missing balances to fill in ${year}`
          }
          onClick={onFillGaps}
        >
          Fill gaps{gaps.length ? ` (${gaps.length})` : ''}
        </button>
        <button
          className={managing ? 'primary' : ''}
          aria-pressed={managing}
          onClick={() => setManaging((v) => !v)}
        >
          {managing ? 'Done' : 'Accounts…'}
        </button>
      </nav>

      <div className="stat-row">
        <Stat
          label={latest ? `Balance at ${latest.month}` : 'Balance'}
          value={latest ? formatMoney(latest.totalBalance) : '—'}
        />
        <Stat
          label="Contributed to date"
          value={latest ? formatMoney(latest.contributedToDate) : '—'}
        />
        <Stat
          label="Growth"
          value={latest ? formatMoney(latest.gain) : '—'}
          negative={(latest?.gain ?? 0) < 0}
        />
        <Stat
          label={`${year} return`}
          value={lastOfYear?.ytdReturn == null ? '—' : formatPercent(lastOfYear.ytdReturn)}
          negative={(lastOfYear?.ytdReturn ?? 0) < 0}
        />
      </div>

      {managing ? (
        <AccountManager doc={doc} />
      ) : doc.investments.accounts.length === 0 ? (
        <div className="gate">
          <h2>No accounts yet</h2>
          <p>Add the accounts you want to track, and a column appears for each.</p>
          <div className="actions">
            <button className="primary" onClick={() => setManaging(true)}>
              Add accounts
            </button>
          </div>
        </div>
      ) : (
        <InvestmentGrid doc={doc} year={year} points={byMonth} startMonths={startMonths} />
      )}

      <InvestmentCharts summary={summary} />

      <p className="grid-hint">
        Type each account’s balance at the end of the month. <strong>From budget</strong> is that
        month’s Assets total in the budget and is not editable here, so the two can never
        disagree; <strong>one-off</strong> is for lump sums that never passed through the budget.
        Monthly return takes the month’s contributions out before measuring, so paying money in
        does not read as a gain, and the year-to-date figure chains those monthly returns rather
        than comparing start to end — that keeps a well-timed contribution from flattering it.
        {summary.points.some((p) => p.estimated) && (
          <>
            {' '}
            A month with no balance is treated as not measured: the charts interpolate between the
            readings either side rather than counting it as zero. <strong>Fill gaps</strong> writes
            those interpolated values in as real entries — it only touches months that sit between
            two readings, since a month after your last reading has nothing to interpolate towards.
          </>
        )}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${negative ? ' negative' : ''}`}>{value}</span>
    </div>
  );
}
