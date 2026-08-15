import { describe, expect, it } from 'vitest';
import { type BudgetDoc, SCHEMA_VERSION } from './schema';
import {
  accountLabel,
  accountStartMonths,
  careerMonths,
  compensationRows,
  investmentSeries,
  overviewRows,
  overviewTotals,
  vestingByYear,
} from './derive';

/** 2016: 1,000/mo pay, 500/mo rent. 2017: 2,000/mo pay, 100/mo into a TFSA. */
function doc(): BudgetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: {
      pay: { id: 'pay', name: 'Pay' },
      rent: { id: 'rent', name: 'Rent' },
      tfsa: { id: 'tfsa', name: 'TFSA' },
    },
    years: {
      '2016': {
        year: 2016,
        lines: [
          { categoryId: 'pay', group: 'income', order: 0, months: Array(12).fill(1000) },
          { categoryId: 'rent', group: 'costOfLiving', order: 1, months: Array(12).fill(500) },
        ],
      },
      '2017': {
        year: 2017,
        lines: [
          { categoryId: 'pay', group: 'income', order: 0, months: Array(12).fill(2000) },
          { categoryId: 'tfsa', group: 'assets', order: 1, months: Array(12).fill(100) },
        ],
      },
    },
    raises: [],
    vestingEvents: [],
    investments: { accounts: [], months: {} },
  };
}

describe('overviewRows', () => {
  it('computes take home, invested and spent per year', () => {
    const [y2016, y2017] = overviewRows(doc());

    expect(y2016.takeHome).toBe(12_000);
    expect(y2016.invested).toBe(0);
    // Spent is take-home that did not become an asset, not the expense total.
    expect(y2016.spent).toBe(12_000);

    expect(y2017.takeHome).toBe(24_000);
    expect(y2017.invested).toBe(1_200);
    expect(y2017.spent).toBe(22_800);
    expect(y2017.shareInvested).toBeCloseTo(0.05, 10);
  });

  it('reports net figures only — no gross or tax is inferred', () => {
    const row = overviewRows(doc())[0] as unknown as Record<string, unknown>;
    // Everything here is money that reached the account; reconstructing gross
    // would need tax parameters the budget does not hold.
    expect(row.preTax).toBeUndefined();
    expect(row.taxed).toBeUndefined();
    expect(row.takeHomeRate).toBeUndefined();
  });

  it('accumulates to-date figures in year order', () => {
    const [y2016, y2017] = overviewRows(doc());

    expect(y2016.takeHomeToDate).toBe(12_000);
    expect(y2016.investedToDate).toBe(0);

    expect(y2017.takeHomeToDate).toBe(36_000);
    expect(y2017.investedToDate).toBe(1_200);
    expect(y2017.shareInvestedToDate).toBeCloseTo(1_200 / 36_000, 10);
  });

  it('orders by year regardless of key insertion order', () => {
    const d = doc();
    const reordered: BudgetDoc = {
      ...d,
      years: { '2017': d.years['2017'], '2016': d.years['2016'] },
    };
    expect(overviewRows(reordered).map((r) => r.year)).toEqual([2016, 2017]);
  });
});

describe('overviewTotals', () => {
  it('sums the years and matches the final to-date figures', () => {
    const rows = overviewRows(doc());
    const totals = overviewTotals(rows);
    const last = rows[rows.length - 1];

    expect(totals.takeHome).toBe(36_000);
    expect(totals.invested).toBe(1_200);
    expect(totals.spent).toBe(34_800);
    // The grand total and the running total must agree.
    expect(totals.takeHome).toBe(last.takeHomeToDate);
    expect(totals.invested).toBe(last.investedToDate);
  });

  it('is zero-safe for an empty document', () => {
    const totals = overviewTotals([]);
    expect(totals.takeHome).toBe(0);
    expect(totals.shareInvested).toBe(0);
  });
});

describe('investmentSeries', () => {
  /**
   * Two accounts. The second opens late, and the first has a gap in the middle
   * — both shapes appear in the real data. 2020 contributes 100/month into a
   * TFSA through the budget, plus a 900 lump sum in April.
   */
  function invDoc(): BudgetDoc {
    const base = doc();
    return {
      ...base,
      years: {
        ...base.years,
        '2020': {
          year: 2020,
          lines: [
            { categoryId: 'tfsa', group: 'assets', order: 0, months: Array(12).fill(100) },
          ],
        },
      },
      investments: {
        accounts: [
          { id: 'a', name: 'TFSA' },
          { id: 'b', name: 'RRSP' },
        ],
        months: {
          '2020-01': { balances: { a: 1_000 } },
          '2020-02': { balances: { a: 2_100 } },
          '2020-03': { balances: { b: 500 } },
          '2020-04': { balances: { a: 4_400, b: 600 }, manualContribution: 900 },
          '2020-05': { balances: { a: 5_600, b: 700 } },
        },
      },
    };
  }

  /** Look up by month: the series also covers months the budget contributed in. */
  const at = (d: BudgetDoc, month: string) =>
    investmentSeries(d).points.find((p) => p.month === month)!;

  it('spans every month the budget contributed in, not just those with readings', () => {
    const { points } = investmentSeries(invDoc());
    // The base fixture budgets into assets during 2017, well before the first
    // balance — those months still count toward contributions.
    expect(points[0].month).toBe('2017-01');
    expect(points[0].totalBalance).toBe(0);
    expect(points.some((p) => p.month === '2020-01')).toBe(true);
  });

  it('treats a month before an account opened as zero', () => {
    const jan = at(invDoc(), '2020-01');
    expect(jan.balances).toEqual([1_000, 0]);
    expect(jan.totalBalance).toBe(1_000);
    expect(jan.estimated).toBe(false);
  });

  it('labels a chart series with the account name and its type', () => {
    const d = invDoc();
    d.investments.accounts = [
      { id: 'a', name: 'Brokerage One', type: 'TFSA' },
      { id: 'b', name: 'Brokerage One', type: 'RRSP' },
    ];
    // Same provider, different types — the legend has to tell them apart.
    expect(investmentSeries(d).accountLabels).toEqual([
      'Brokerage One (TFSA)',
      'Brokerage One (RRSP)',
    ]);
  });

  it('labels an untyped account with its bare name', () => {
    expect(accountLabel({ id: 'a', name: 'Savings' })).toBe('Savings');
  });

  it('keeps labels in document order, so they line up with the series data', () => {
    const d = invDoc();
    d.investments.accounts = [
      { id: 'b', name: 'RRSP acct', type: 'RRSP' },
      { id: 'a', name: 'TFSA acct' },
    ];
    expect(investmentSeries(d).accountLabels).toEqual(['RRSP acct (RRSP)', 'TFSA acct']);
  });

  it('reports each account’s first recorded month', () => {
    // TFSA is read from January; RRSP does not appear until March.
    expect(accountStartMonths(invDoc())).toEqual({ a: '2020-01', b: '2020-03' });
  });

  it('does not claim a start for an account with no readings at all', () => {
    const d = invDoc();
    d.investments.accounts.push({ id: 'c', name: 'Unused' });
    expect(accountStartMonths(d).c).toBeUndefined();
  });

  it('reports the earliest month even when readings are written out of order', () => {
    const d = invDoc();
    d.investments.months = {
      '2020-05': { balances: { a: 5_000 } },
      '2020-02': { balances: { a: 2_000 } },
    };
    expect(accountStartMonths(d).a).toBe('2020-02');
  });

  it('moves the start when the first reading is cleared', () => {
    const d = invDoc();
    delete d.investments.months['2020-01'].balances.a;
    expect(accountStartMonths(d).a).toBe('2020-02');
  });

  it('interpolates a gap rather than holding the previous value flat', () => {
    // TFSA reads 2,100 in Feb and 4,400 in Apr, so March lands halfway.
    const mar = at(invDoc(), '2020-03');
    expect(mar.balances[0]).toBe((2_100 + 4_400) / 2);
    expect(mar.estimated).toBe(true);
  });

  it('splits a two-month gap into thirds', () => {
    const d = invDoc();
    d.investments.months = {
      '2020-01': { balances: { a: 1_000 } },
      '2020-04': { balances: { a: 4_000 } },
    };
    const series = investmentSeries(d);
    const value = (m: string) => series.points.find((p) => p.month === m)!.balances[0];

    expect(value('2020-02')).toBeCloseTo(2_000, 6);
    expect(value('2020-03')).toBeCloseTo(3_000, 6);
  });

  it('holds the last reading after it, since there is nothing to interpolate to', () => {
    const d = invDoc();
    d.investments.months['2020-06'] = { balances: { b: 750 } };
    const jun = at(d, '2020-06');
    // TFSA last read 5,600 in May and has no later reading.
    expect(jun.balances[0]).toBe(5_600);
    expect(jun.estimated).toBe(true);
  });

  it('keeps budget and manual contributions apart, and sums them', () => {
    const d = invDoc();

    const jan = at(d, '2020-01');
    expect(jan.budgetContribution).toBe(100);
    expect(jan.manualContribution).toBe(0);
    expect(jan.contribution).toBe(100);

    const apr = at(d, '2020-04');
    expect(apr.budgetContribution).toBe(100);
    expect(apr.manualContribution).toBe(900);
    expect(apr.contribution).toBe(1_000);

    // 2017's twelve budgeted months, plus five of 2020, plus the lump sum.
    expect(at(d, '2020-05').contributedToDate).toBe(1_200 + 500 + 900);
  });

  it('removes contributions from the monthly return', () => {
    const d = invDoc();

    // Feb: start 1,000, end 2,100, of which 100 was paid in — so the return is
    // on 1,000, not the full 1,100 increase.
    expect(at(d, '2020-02').monthlyReturn).toBeCloseTo((2_100 - 1_000 - 100) / 1_000, 10);

    // The very first month has nothing to measure against.
    expect(investmentSeries(d).points[0].monthlyReturn).toBeNull();
  });

  it('chains monthly returns into a year-to-date figure', () => {
    const { points } = investmentSeries(invDoc());
    const of2020 = points.filter((p) => p.month.startsWith('2020'));
    const chained = of2020.reduce(
      (acc, p) => (p.monthlyReturn === null ? acc : acc * (1 + p.monthlyReturn)),
      1,
    );
    expect(of2020[of2020.length - 1].ytdReturn).toBeCloseTo(chained - 1, 10);
  });

  it('restarts the year-to-date chain each calendar year', () => {
    const d = invDoc();
    d.investments.months['2021-01'] = { balances: { a: 6_000, b: 800 } };
    const points = investmentSeries(d).points;
    const jan2021 = points.find((p) => p.month === '2021-01')!;
    // A fresh year: its YTD is just that one month's return.
    expect(jan2021.ytdReturn).toBeCloseTo(jan2021.monthlyReturn!, 10);
  });

  it('stops at the last month any account reported', () => {
    const d = invDoc();
    d.investments.months['2020-07'] = { balances: {}, manualContribution: 500 };

    const summary = investmentSeries(d);
    expect(summary.latest!.month).toBe('2020-05');
    // Total contributed counts every month; the series total stops earlier.
    expect(summary.totalContributed).toBeGreaterThan(summary.latest!.contributedToDate);
  });

  it('reports a loss as a negative gain rather than hiding it', () => {
    const d = invDoc();
    d.investments.months = {
      '2020-01': { balances: { a: 1_000 } },
      '2020-05': { balances: { a: 700 } },
    };
    const last = investmentSeries(d).points.slice(-1)[0];
    expect(last.gain).toBeLessThan(0);
    expect(last.returnOnContributions).toBeLessThan(0);
  });

  it('yields no series when no balance was ever recorded', () => {
    // The base fixture still budgets into assets, so contributions are counted
    // even though there is nothing to plot.
    const summary = investmentSeries(doc());
    expect(summary.points).toEqual([]);
    expect(summary.latest).toBeNull();
    expect(summary.totalContributed).toBe(1_200);
  });

  it('is empty for a document with neither balances nor asset budgeting', () => {
    const bare: BudgetDoc = { ...doc(), years: {} };
    const summary = investmentSeries(bare);
    expect(summary.points).toEqual([]);
    expect(summary.totalContributed).toBe(0);
  });
});

describe('compensationRows', () => {
  /** Invented figures: a promotion inside one employer, then a move to another. */
  function compDoc(): BudgetDoc {
    return {
      ...doc(),
      raises: [
        // Deliberately out of order: the function must sort by date.
        { id: 'r7', company: 'Globex L4', baseSalary: 100_000, date: '2021-05-31', signOnBonus: 30_000, stockVesting: 2_000 },
        { id: 'r2', company: 'Initech Ltd', baseSalary: 50_000, date: '2016-07-04' },
        { id: 'r3', company: 'Initech Ltd', baseSalary: 55_000, date: '2016-10-01' },
      ],
    };
  }

  it('orders by date and computes each step against the one before', () => {
    const rows = compensationRows(compDoc());
    expect(rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r7']);

    // The first step has nothing to compare against.
    expect(rows[0].baseDelta).toBeNull();
    expect(rows[0].baseIncrease).toBeNull();

    // 50,000 -> 55,000 within the same employer.
    expect(rows[1].baseDelta).toBe(5_000);
    expect(rows[1].baseIncrease).toBeCloseTo(5_000 / 50_000, 10);
  });

  it('totals base, sign-on and vesting stock together', () => {
    const move = compensationRows(compDoc())[2];
    expect(move.totalComp).toBe(132_000);
    expect(move.baseDelta).toBe(45_000);
    expect(move.baseIncrease).toBeCloseTo(45_000 / 55_000, 10);
    // Total comp against the previous total, which had no bonus or stock — so
    // the jump is much larger than the base jump alone.
    expect(move.totalDelta).toBe(77_000);
    expect(move.totalIncrease).toBeCloseTo(77_000 / 55_000, 10);
  });

  it('treats missing bonus and stock as zero rather than absent', () => {
    const first = compensationRows(compDoc())[0];
    expect(first.signOnBonus).toBe(0);
    expect(first.stockVesting).toBe(0);
    expect(first.totalComp).toBe(50_000);
  });

  it('returns nothing for a document with no raises', () => {
    expect(compensationRows(doc())).toEqual([]);
  });
});

describe('vestingByYear', () => {
  it('sums units and value per calendar year, in order', () => {
    const d: BudgetDoc = {
      ...doc(),
      vestingEvents: [
        { id: 'v1', date: '2023-05-15', units: 17, price: 177 },
        { id: 'v2', date: '2022-05-16', units: 20, price: 128 },
        { id: 'v3', date: '2023-11-15', units: 16, price: 194 },
      ],
    };
    const years = vestingByYear(d);

    expect(years.map((y) => y.year)).toEqual([2022, 2023]);
    expect(years[0]).toEqual({ year: 2022, units: 20, value: 20 * 128 });
    expect(years[1].units).toBe(33);
    expect(years[1].value).toBe(17 * 177 + 16 * 194);
  });

  it('returns nothing when there are no vesting events', () => {
    expect(vestingByYear(doc())).toEqual([]);
  });
});

describe('careerMonths', () => {
  it('emits twelve months per year, in order', () => {
    const months = careerMonths(doc());
    expect(months).toHaveLength(24);
    expect(months[0].month).toBe('2016-01');
    expect(months[11].month).toBe('2016-12');
    expect(months[12].month).toBe('2017-01');
    expect(months[23].month).toBe('2017-12');
  });

  it('carries each group through, month by month', () => {
    const months = careerMonths(doc());
    expect(months[0].costOfLiving).toBe(500);
    expect(months[0].leftOver).toBe(500); // 1000 pay - 500 rent
    expect(months[12].assets).toBe(100);
    expect(months[12].leftOver).toBe(1_900); // 2000 pay - 100 TFSA
  });
});
