import {
  type BudgetDoc,
  type Group,
  type InvestmentAccount,
  type Line,
  type Year,
  monthKey,
} from './schema';

/**
 * Everything computed from the stored document. Nothing here is persisted —
 * this module is the replacement for the spreadsheet's formula columns, and the
 * reason adding or removing a category no longer requires repointing anything.
 *
 * The two line flags are what make the arithmetic match the source workbook:
 *
 *   informational — excluded from its group total (already counted elsewhere)
 *   preIncome     — included in its group total, but never subtracted from
 *                   take-home pay, because it was deducted before it
 */

const EXPENSE_GROUPS: readonly Group[] = ['assets', 'debt', 'costOfLiving'];

export function sum(values: readonly (number | null)[]): number {
  let total = 0;
  for (const v of values) if (v !== null) total += v;
  return total;
}

/** A single line's annual total — the workbook's `Q` column. */
export function lineTotal(line: Line): number {
  return sum(line.months);
}

export function linesIn(year: Year, group: Group): Line[] {
  return year.lines
    .filter((l) => l.group === group)
    .sort((a, b) => a.order - b.order);
}

/** A group's annual total — the workbook's `U31`–`U34` summary values. */
export function groupTotal(year: Year, group: Group): number {
  return sum(
    year.lines
      .filter((l) => l.group === group && !l.informational)
      .map(lineTotal),
  );
}

/** A group's twelve monthly totals, for the month-by-month charts. */
export function groupMonthlyTotals(year: Year, group: Group): number[] {
  const lines = year.lines.filter((l) => l.group === group && !l.informational);
  return Array.from({ length: 12 }, (_, m) => sum(lines.map((l) => l.months[m] ?? null)));
}

/**
 * Left-over per month — the workbook's "Recreation/Left Over" row.
 * Take-home pay minus every expense that was actually paid out of it.
 */
export function leftOverMonthly(year: Year): number[] {
  const income = groupMonthlyTotals(year, 'income');
  const deducted = year.lines.filter(
    (l) => EXPENSE_GROUPS.includes(l.group) && !l.informational && !l.preIncome,
  );
  return income.map((inc, m) => inc - sum(deducted.map((l) => l.months[m] ?? null)));
}

export interface YearTotals {
  income: number;
  assets: number;
  debt: number;
  costOfLiving: number;
  leftOver: number;
}

/** The five figures in each year sheet's summary box. */
export function yearTotals(year: Year): YearTotals {
  const income = groupTotal(year, 'income');
  const assets = groupTotal(year, 'assets');
  const debt = groupTotal(year, 'debt');
  const costOfLiving = groupTotal(year, 'costOfLiving');

  const notDeducted = sum(
    year.lines
      .filter((l) => EXPENSE_GROUPS.includes(l.group) && !l.informational && l.preIncome)
      .map(lineTotal),
  );

  return {
    income,
    assets,
    debt,
    costOfLiving,
    leftOver: income - (assets + debt + costOfLiving) + notDeducted,
  };
}

/* Cross-year ---------------------------------------------------------------- */

export interface OverviewRow {
  year: number;
  /** Take-home pay — the workbook's Overview "Take Home". */
  takeHome: number;
  /** Everything routed into assets — the workbook's "Invested". */
  invested: number;
  /** Take-home that did not become an asset — the workbook's "Spent/Extra". */
  spent: number;
  /** Share of take-home that was invested. */
  shareInvested: number;
  /** Running totals through this year, in year order. */
  takeHomeToDate: number;
  investedToDate: number;
  shareInvestedToDate: number;
}

/**
 * The Overview sheet's per-year rollup, rebuilt from the years themselves.
 *
 * Every figure is net: what actually reached the account. There is deliberately
 * no gross or pre-tax view — reconstructing it needs tax parameters the budget
 * does not have, and any estimate would look more authoritative than it is.
 *
 * `spent` is take-home minus what was invested, matching the workbook's
 * definition — it is "what did not end up as an asset", not the sum of the
 * expense groups, so debt payments and cost of living both sit inside it.
 */
export function overviewRows(doc: BudgetDoc): OverviewRow[] {
  let takeHomeToDate = 0;
  let investedToDate = 0;

  return Object.keys(doc.years)
    .sort()
    .map((key) => {
      const year = doc.years[key];
      const totals = yearTotals(year);
      const takeHome = totals.income;
      const invested = totals.assets;

      takeHomeToDate += takeHome;
      investedToDate += invested;

      return {
        year: year.year,
        takeHome,
        invested,
        spent: takeHome - invested,
        shareInvested: takeHome === 0 ? 0 : invested / takeHome,
        takeHomeToDate,
        investedToDate,
        shareInvestedToDate: takeHomeToDate === 0 ? 0 : investedToDate / takeHomeToDate,
      };
    });
}

export interface OverviewTotals {
  takeHome: number;
  invested: number;
  spent: number;
  shareInvested: number;
}

/** The workbook's grand-total column. */
export function overviewTotals(rows: OverviewRow[]): OverviewTotals {
  const takeHome = rows.reduce((s, r) => s + r.takeHome, 0);
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  return {
    takeHome,
    invested,
    spent: takeHome - invested,
    shareInvested: takeHome === 0 ? 0 : invested / takeHome,
  };
}

export interface CareerMonth {
  /** "2016-01" */
  month: string;
  costOfLiving: number;
  debt: number;
  assets: number;
  leftOver: number;
}

/**
 * Every month of every year, flattened — the workbook kept this on its "Data
 * Plot" sheet as a hand-maintained row of cross-sheet references. Here it falls
 * out of the years themselves, so adding a year needs no wiring.
 */
export function careerMonths(doc: BudgetDoc): CareerMonth[] {
  const out: CareerMonth[] = [];
  for (const key of Object.keys(doc.years).sort()) {
    const year = doc.years[key];
    const costOfLiving = groupMonthlyTotals(year, 'costOfLiving');
    const debt = groupMonthlyTotals(year, 'debt');
    const assets = groupMonthlyTotals(year, 'assets');
    const leftOver = leftOverMonthly(year);

    for (let m = 0; m < 12; m += 1) {
      out.push({
        month: `${key}-${String(m + 1).padStart(2, '0')}`,
        costOfLiving: costOfLiving[m],
        debt: debt[m],
        assets: assets[m],
        leftOver: leftOver[m],
      });
    }
  }
  return out;
}

/* Investments --------------------------------------------------------------- */

export interface InvestmentPoint {
  /** "2017-01" */
  month: string;
  /** One entry per account, in document order. Zero before an account opened. */
  balances: number[];
  totalBalance: number;

  /** Regular contributions, read from the budget's Assets group for this month. */
  budgetContribution: number;
  /** Lump sums entered by hand against this month. */
  manualContribution: number;
  /** The two added together. */
  contribution: number;
  contributedToDate: number;

  /** Balance minus everything put in — growth, or loss when negative. */
  gain: number;
  /** Gain as a share of contributions. Null until anything was contributed. */
  returnOnContributions: number | null;

  /**
   * This month's investment return, with the month's contributions removed so
   * that paying money in does not read as a gain:
   *   (end − start − contributions) / start
   * Null for the first month, or when the previous balance was zero.
   */
  monthlyReturn: number | null;
  /**
   * Return so far this calendar year, chaining the monthly returns:
   *   Π(1 + r) − 1
   * Chained rather than measured end-to-end because that removes the effect of
   * *when* money went in — a large contribution in a good month would otherwise
   * flatter the figure.
   */
  ytdReturn: number | null;

  /** True where at least one account's balance was carried forward, not recorded. */
  estimated: boolean;
}

export interface InvestmentSummary {
  points: InvestmentPoint[];
  /** Display labels, in document order — see `accountLabel`. */
  accountLabels: string[];
  /** Contributions across every month, including any past the last balance. */
  totalContributed: number;
  /** The final observed point, or null when there is nothing to show. */
  latest: InvestmentPoint | null;
  /** Months with contributions recorded after the last balance reading. */
  monthsAfterLastBalance: number;
}

/**
 * Resolve one account's balance for every month in `ordered`.
 *
 * A month with no reading is filled by interpolating between the readings on
 * either side — two missed months split the difference in thirds, three in
 * quarters. That beats holding the previous value flat, which would show a
 * plateau followed by a cliff where neither happened.
 *
 * The two ends are different, because neither can be interpolated:
 *   - before the first reading the account did not exist, so it is really zero;
 *   - after the last reading there is nothing to interpolate towards, so the
 *     final value is held and flagged as an estimate.
 */
function resolveAccountBalances(
  ordered: string[],
  months: Record<string, { balances: Record<string, number> }>,
  accountId: string,
): { values: number[]; estimated: boolean[] } {
  const values = new Array<number>(ordered.length).fill(0);
  const estimated = new Array<boolean>(ordered.length).fill(false);

  const known: { at: number; value: number }[] = [];
  ordered.forEach((key, i) => {
    const value = months[key]?.balances[accountId];
    if (typeof value === 'number') known.push({ at: i, value });
  });
  if (!known.length) return { values, estimated };

  for (const { at, value } of known) values[at] = value;

  for (let k = 0; k < known.length - 1; k += 1) {
    const from = known[k];
    const to = known[k + 1];
    const span = to.at - from.at;
    for (let i = from.at + 1; i < to.at; i += 1) {
      values[i] = from.value + ((to.value - from.value) * (i - from.at)) / span;
      estimated[i] = true;
    }
  }

  const last = known[known.length - 1];
  for (let i = last.at + 1; i < ordered.length; i += 1) {
    values[i] = last.value;
    estimated[i] = true;
  }

  return { values, estimated };
}

/** Regular contributions for one month, taken from that year's Assets group. */
export function budgetContributionFor(doc: BudgetDoc, month: string): number {
  const [yearKey, monthPart] = month.split('-');
  const year = doc.years[yearKey];
  if (!year) return 0;
  const index = Number(monthPart) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 11) return 0;
  return groupMonthlyTotals(year, 'assets')[index];
}

/**
 * How an account is named outside the grid — in chart legends and tooltips.
 *
 * The grid can show the type as a separate coloured badge under the column
 * heading, but a legend entry is a single string, so the type has to travel
 * with the name or it is lost. Two accounts of different types often share a
 * provider name, which is exactly when the legend needs to tell them apart.
 */
export function accountLabel(account: InvestmentAccount): string {
  return account.type ? `${account.name} (${account.type})` : account.name;
}

/**
 * The month each account was first recorded, keyed by account id.
 *
 * Derived rather than stored, deliberately. `resolveAccountBalances` already
 * treats every month before an account's first reading as zero, so that first
 * reading *is* the account's start as far as every number on this page is
 * concerned. A separate "opened" field could disagree with it, and then the
 * badge would be claiming one thing while the maths did another.
 *
 * A cleared balance deletes its key, so a present key always means a real
 * reading.
 */
export function accountStartMonths(doc: BudgetDoc): Record<string, string> {
  const starts: Record<string, string> = {};
  for (const month of Object.keys(doc.investments.months).sort()) {
    for (const id of Object.keys(doc.investments.months[month].balances)) {
      if (!(id in starts)) starts[id] = month;
    }
  }
  return starts;
}

/**
 * Account balances over time, with contributions and returns alongside.
 *
 * Two rules make this honest rather than merely plottable:
 *
 *  - A balance is a point-in-time value, not a flow, so a month with no reading
 *    means "not recorded" and never "zero". Within an account's active span the
 *    last known balance is carried forward; before it opened, it counts as zero.
 *    Without this, a gap would read as the money vanishing.
 *
 *  - The series stops at the last month any account actually reported. Carrying
 *    balances past that point would invent present-day figures out of stale
 *    readings.
 */
export function investmentSeries(doc: BudgetDoc): InvestmentSummary {
  const { accounts, months } = doc.investments;
  const accountLabels = accounts.map(accountLabel);

  // Every month that has a reading or a lump sum, plus every month the budget
  // routed money into assets — a contribution counts even with no balance yet.
  const keys = new Set<string>(Object.keys(months));
  for (const yearKey of Object.keys(doc.years)) {
    const assets = groupMonthlyTotals(doc.years[yearKey], 'assets');
    assets.forEach((value, i) => {
      if (value !== 0) keys.add(monthKey(Number(yearKey), i));
    });
  }
  const ordered = [...keys].sort();

  const hasReading = (key: string) => Object.keys(months[key]?.balances ?? {}).length > 0;
  const lastObserved = ordered.reduce((last, key, i) => (hasReading(key) ? i : last), -1);

  const totalContributed = ordered.reduce(
    (total, key) => total + budgetContributionFor(doc, key) + (months[key]?.manualContribution ?? 0),
    0,
  );

  if (lastObserved < 0) {
    return { points: [], accountLabels, totalContributed, latest: null, monthsAfterLastBalance: 0 };
  }

  const resolved = accounts.map((a) => resolveAccountBalances(ordered, months, a.id));

  let contributedToDate = 0;
  let previousBalance: number | null = null;
  let ytdChain = 1;
  let ytdYear = '';
  let ytdHasData = false;

  const points: InvestmentPoint[] = [];

  for (let i = 0; i <= lastObserved; i += 1) {
    const key = ordered[i];
    const entry = months[key];

    const budgetContribution = budgetContributionFor(doc, key);
    const manualContribution = entry?.manualContribution ?? 0;
    const contribution = budgetContribution + manualContribution;
    contributedToDate += contribution;

    const balances = resolved.map((r) => r.values[i]);
    const estimated = resolved.some((r) => r.estimated[i]);
    const totalBalance = balances.reduce((s, b) => s + b, 0);

    const monthlyReturn =
      previousBalance === null || previousBalance === 0
        ? null
        : (totalBalance - previousBalance - contribution) / previousBalance;

    const year = key.slice(0, 4);
    if (year !== ytdYear) {
      ytdYear = year;
      ytdChain = 1;
      ytdHasData = false;
    }
    if (monthlyReturn !== null) {
      ytdChain *= 1 + monthlyReturn;
      ytdHasData = true;
    }

    points.push({
      month: key,
      balances,
      totalBalance,
      budgetContribution,
      manualContribution,
      contribution,
      contributedToDate,
      gain: totalBalance - contributedToDate,
      returnOnContributions:
        contributedToDate === 0 ? null : (totalBalance - contributedToDate) / contributedToDate,
      monthlyReturn,
      ytdReturn: ytdHasData ? ytdChain - 1 : null,
      estimated,
    });

    previousBalance = totalBalance;
  }

  return {
    points,
    accountLabels,
    totalContributed,
    latest: points[points.length - 1] ?? null,
    monthsAfterLastBalance: ordered.length - 1 - lastObserved,
  };
}

/* Compensation -------------------------------------------------------------- */

export interface CompensationRow {
  id: string;
  company: string | null;
  date: string;
  baseSalary: number;
  signOnBonus: number;
  stockVesting: number;
  /** Base + sign-on + vesting stock, the workbook's "Total Compensation". */
  totalComp: number;
  /** Change from the previous entry; null for the first. */
  baseDelta: number | null;
  baseIncrease: number | null;
  totalDelta: number | null;
  totalIncrease: number | null;
  note: string | null;
}

/**
 * Salary history with each step's change worked out, ordered by date.
 *
 * The deltas are deliberately derived rather than stored: the source workbook
 * kept them as columns that had to be dragged down by hand every time a row was
 * added, which is exactly the kind of maintenance this app exists to remove.
 */
export function compensationRows(doc: BudgetDoc): CompensationRow[] {
  const sorted = [...doc.raises].sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map((raise, i) => {
    const signOnBonus = raise.signOnBonus ?? 0;
    const stockVesting = raise.stockVesting ?? 0;
    const totalComp = raise.baseSalary + signOnBonus + stockVesting;

    const previous = i === 0 ? null : sorted[i - 1];
    const previousTotal =
      previous === null
        ? null
        : previous.baseSalary + (previous.signOnBonus ?? 0) + (previous.stockVesting ?? 0);

    return {
      id: raise.id,
      company: raise.company ?? null,
      date: raise.date,
      baseSalary: raise.baseSalary,
      signOnBonus,
      stockVesting,
      totalComp,
      baseDelta: previous === null ? null : raise.baseSalary - previous.baseSalary,
      baseIncrease:
        previous === null || previous.baseSalary === 0
          ? null
          : (raise.baseSalary - previous.baseSalary) / previous.baseSalary,
      totalDelta: previousTotal === null ? null : totalComp - previousTotal,
      totalIncrease:
        previousTotal === null || previousTotal === 0
          ? null
          : (totalComp - previousTotal) / previousTotal,
      note: raise.note ?? null,
    };
  });
}

export interface VestingYear {
  year: number;
  units: number;
  /** Units times the price recorded against the vest. */
  value: number;
}

/** Vesting events rolled up by calendar year. */
export function vestingByYear(doc: BudgetDoc): VestingYear[] {
  const byYear = new Map<number, VestingYear>();

  for (const event of doc.vestingEvents) {
    const year = Number(event.date.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const row = byYear.get(year) ?? { year, units: 0, value: 0 };
    row.units += event.units;
    row.value += event.units * event.price;
    byYear.set(year, row);
  }

  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/**
 * Which years reference each category, ascending.
 *
 * Useful on its own, and the basis for spotting categories that look like a
 * rename of one another: two with adjacent, non-overlapping spans are usually
 * the same thing under different names.
 */
export function categoryUsage(doc: BudgetDoc): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const key of Object.keys(doc.years).sort()) {
    for (const line of doc.years[key].lines) {
      const years = usage.get(line.categoryId);
      if (years) years.push(key);
      else usage.set(line.categoryId, [key]);
    }
  }
  return usage;
}

/** A line's share of its own group, as the workbook's `R` column shows it. */
export function shareOfGroup(year: Year, line: Line): number {
  const total = groupTotal(year, line.group);
  return total === 0 ? 0 : lineTotal(line) / total;
}
