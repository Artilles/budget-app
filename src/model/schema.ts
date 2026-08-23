/**
 * The shape of the persisted document.
 *
 * Two rules govern this schema, and most of the app's behaviour follows from them:
 *
 *  1. `categories` is an append-only registry. Entries are never deleted, only
 *     dereferenced. That is what lets a category dropped in 2018 still resolve
 *     correctly when rendering 2016.
 *
 *  2. Each year owns its own `lines` array. Years share nothing, so removing a
 *     category from one year cannot affect another — the requirement holds
 *     structurally rather than by being careful at every call site.
 *
 * Nothing derived is stored: annual totals, percentages, and every chart series
 * are computed from these fields. See `derive.ts`.
 */

/**
 * 2 — investments moved from parallel arrays indexed by a months list to a map
 *     keyed "YYYY-MM", and regular contributions became derived from the budget
 *     rather than stored.
 */
export const SCHEMA_VERSION = 2;

/**
 * Longest budget name accepted. The name is a label for a person's own file,
 * not a key, so this exists only to keep it renderable in the header chip.
 */
export const MAX_BUDGET_NAME = 50;

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type Group = 'income' | 'assets' | 'debt' | 'costOfLiving' | 'discretionary';

export const GROUPS: readonly Group[] = [
  'income',
  'assets',
  'debt',
  'costOfLiving',
  'discretionary',
];

export const GROUP_LABELS: Record<Group, string> = {
  income: 'Income',
  assets: 'Assets',
  debt: 'Debt',
  costOfLiving: 'Cost of Living',
  discretionary: 'Discretionary Expenses',
};

export type CategoryId = string;

/**
 * Identity and display name only. A category deliberately has no group: the
 * source data moves categories between groups over time (Mortgage sits under
 * Cost of Living in 2023 and under Debt from 2024), so the group is a property
 * of the year's line, not of the category itself.
 */
export interface Category {
  id: CategoryId;
  name: string;
  /** Hidden when seeding a new year, but still resolves for existing years. */
  archived?: boolean;
}

/** One category's twelve monthly amounts within one year. `null` means "no entry". */
export interface Line {
  categoryId: CategoryId;
  group: Group;
  order: number;
  months: (number | null)[];

  /**
   * Tracked but not counted in its group total, because the amount is already
   * included inside another line. In the source workbook this is
   * "Reimbursements incl. in paystub", which the take-home formula skips.
   */
  informational?: boolean;

  /**
   * Deducted before take-home pay is calculated. Counts toward its group total,
   * but is *not* subtracted again when deriving left-over — doing so would
   * double-count it. In the source this is "RRSP Contributions (Pre-Income)".
   */
  preIncome?: boolean;
}

export interface Year {
  year: number;
  /** Free text from the source sheet's D16, e.g. "Software Engineer II". */
  jobTitle?: string;
  lines: Line[];

  /**
   * A closed year. Every mutation targeting it is refused at the model layer,
   * not merely disabled in the UI — so a stale component, a keyboard shortcut,
   * or a future code path cannot quietly edit a year you consider settled.
   * `setYearLocked` is the only mutation it accepts; even deletion is refused.
   * Renaming a category is still allowed, since that is global metadata rather
   * than the year's own figures.
   */
  locked?: boolean;
}

export interface Raise {
  id: string;
  /** Carried forward from the previous entry when blank in the source. */
  company?: string;
  baseSalary: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  signOnBonus?: number;
  stockVesting?: number;
  note?: string;
}

export interface VestingEvent {
  id: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  units: number;
  price: number;
  note?: string;
}

/**
 * Suggested account types. Deliberately suggestions, not an enum: the field is
 * a free string, so an account type this list has never heard of still works.
 */
export const ACCOUNT_TYPES = [
  'RRSP',
  'TFSA',
  'FHSA',
  'RESP',
  'RRIF',
  'LIRA',
  'Non-Registered',
  'Pension',
] as const;

export interface InvestmentAccount {
  id: string;
  name: string;
  /** e.g. "RRSP", "TFSA". Free text — `ACCOUNT_TYPES` only suggests. */
  type?: string;
  /** Hidden from entry, but historical balances still resolve. */
  archived?: boolean;
}

/** One month's end-of-month readings. */
export interface InvestmentMonth {
  /**
   * Account id to end-of-month balance. A missing key means "not recorded",
   * never zero — see `investmentSeries` for how gaps are handled.
   */
  balances: Record<string, number>;
  /**
   * Account ids in this month whose balance was written by "Fill gaps" rather
   * than typed. Marked so an interpolated figure never passes for a real
   * reading — the grid tints them, and the flag survives in the file.
   *
   * Kept as a list beside `balances` rather than wrapping each balance in an
   * object: the file stays readable, and every existing reader of `balances`
   * keeps working. Editing a cell clears its flag; see `setAccountBalance`.
   */
  autofilled?: string[];
  /**
   * A contribution made outside the monthly budget — a lump sum, a transfer,
   * a windfall. Regular contributions are not stored here: they are read from
   * the Assets group of the matching month in the budget, so the two can never
   * disagree.
   */
  manualContribution?: number;
}

export interface Investments {
  accounts: InvestmentAccount[];
  /** Keyed "YYYY-MM". Sparse by design; a month with no readings is absent. */
  months: Record<string, InvestmentMonth>;
}

export interface BudgetDoc {
  schemaVersion: number;
  /**
   * What the user calls this budget, shown in the header instead of the file
   * name. Optional: an unnamed budget falls back to its file name, so a file
   * written before this existed stays valid and needs no migration.
   *
   * Purely a label. Renaming never touches the file on disk — the two are
   * deliberately independent, so a budget can be renamed freely without the app
   * moving or rewriting anything the user chose the location of.
   */
  name?: string;
  categories: Record<CategoryId, Category>;
  /** Keyed by year as a string, e.g. "2016". */
  years: Record<string, Year>;
  raises: Raise[];
  vestingEvents: VestingEvent[];
  investments: Investments;

  /**
   * Saved inputs for the calculators under Tools, keyed by tool id.
   *
   * Deliberately untyped at this level: a tool is meant to be added without
   * touching the schema or writing a migration. Each tool owns the shape of its
   * own slice and reads it defensively with defaults, so an unknown or
   * malformed key costs a default value rather than a failed load.
   */
  tools?: Record<string, Record<string, unknown>>;
}

export function createEmptyDoc(): BudgetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: {},
    years: {},
    raises: [],
    vestingEvents: [],
    investments: { accounts: [], months: {} },
  };
}

/**
 * Serialise the document with a stable, readable key order.
 *
 * Object key order is otherwise whatever construction happened to produce, and
 * a year built by the importer puts `lines` before its metadata — which buries
 * `jobTitle` and `locked` thousands of lines below the year they describe. The
 * file is meant to be opened and understood, so small fields come first and the
 * long arrays last.
 */
export function serializeDoc(doc: BudgetDoc): string {
  const years: Record<string, Year> = {};
  for (const key of Object.keys(doc.years).sort()) {
    const year = doc.years[key];
    const ordered: Year = { year: year.year } as Year;
    if (year.jobTitle !== undefined) ordered.jobTitle = year.jobTitle;
    if (year.locked !== undefined) ordered.locked = year.locked;
    ordered.lines = year.lines.map((line) => {
      const next: Line = {
        categoryId: line.categoryId,
        group: line.group,
        order: line.order,
      } as Line;
      if (line.informational !== undefined) next.informational = line.informational;
      if (line.preIncome !== undefined) next.preIncome = line.preIncome;
      next.months = line.months;
      return next;
    });
    years[key] = ordered;
  }

  // Destructured rather than listing the keys before a spread of the whole
  // document: naming a key on both sides is a type error, and this keeps the
  // name near the top of the file instead of wherever a spread happened to put
  // it. `years` comes after the spread, so the sorted copy wins.
  const { schemaVersion, name, ...rest } = doc;
  const ordered =
    name === undefined
      ? { schemaVersion, ...rest, years }
      : { schemaVersion, name, ...rest, years };

  return JSON.stringify(ordered, null, 2);
}

/** Month key for a year and zero-based month index: (2025, 0) -> "2025-01". */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function emptyMonths(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

/** Stable, readable ids — the JSON is meant to be hand-inspectable. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'category';
}

export class ValidationError extends Error {}

/**
 * Checked on every load. The file is user-editable by design, so a hand-edit
 * that breaks an invariant must fail loudly here rather than surface later as a
 * wrong number in a chart.
 */
export function validateDoc(value: unknown): asserts value is BudgetDoc {
  const fail = (msg: string): never => {
    throw new ValidationError(msg);
  };

  if (typeof value !== 'object' || value === null) fail('Document is not an object.');
  const doc = value as Record<string, unknown>;

  if (typeof doc.schemaVersion !== 'number') fail('Missing schemaVersion.');

  if (doc.name !== undefined) {
    if (typeof doc.name !== 'string') fail('"name" must be a string.');
    if ((doc.name as string).length > MAX_BUDGET_NAME) {
      fail(
        `"name" is ${(doc.name as string).length} characters; the maximum is ` +
          `${MAX_BUDGET_NAME}.`,
      );
    }
  }
  for (const key of ['categories', 'years', 'investments'] as const) {
    if (typeof doc[key] !== 'object' || doc[key] === null) fail(`Missing or invalid "${key}".`);
  }
  for (const key of ['raises', 'vestingEvents'] as const) {
    if (!Array.isArray(doc[key])) fail(`Missing or invalid "${key}".`);
  }

  const categories = doc.categories as Record<string, Category>;
  for (const [id, cat] of Object.entries(categories)) {
    if (cat?.id !== id) fail(`Category "${id}" has a mismatched id field.`);
    if (typeof cat.name !== 'string' || !cat.name) fail(`Category "${id}" has no name.`);
  }

  const years = doc.years as Record<string, Year>;
  for (const [key, year] of Object.entries(years)) {
    if (year?.year !== Number(key)) fail(`Year "${key}" has a mismatched year field.`);
    if (!Array.isArray(year.lines)) fail(`Year "${key}" has no lines array.`);

    const seen = new Set<string>();
    for (const line of year.lines) {
      if (!categories[line.categoryId]) {
        fail(`Year "${key}" references unknown category "${line.categoryId}".`);
      }
      if (seen.has(line.categoryId)) {
        fail(`Year "${key}" references category "${line.categoryId}" more than once.`);
      }
      seen.add(line.categoryId);

      if (!GROUPS.includes(line.group)) {
        fail(`Year "${key}", category "${line.categoryId}": unknown group "${line.group}".`);
      }

      if (!Array.isArray(line.months) || line.months.length !== 12) {
        fail(`Year "${key}", category "${line.categoryId}": months must have exactly 12 entries.`);
      }
      for (const m of line.months) {
        if (m !== null && (typeof m !== 'number' || !Number.isFinite(m))) {
          fail(`Year "${key}", category "${line.categoryId}": non-numeric month value.`);
        }
      }
    }
  }

  if (doc.tools !== undefined) {
    if (typeof doc.tools !== 'object' || doc.tools === null || Array.isArray(doc.tools)) {
      fail('"tools" must be an object keyed by tool id.');
    }
    for (const [id, state] of Object.entries(doc.tools as Record<string, unknown>)) {
      if (typeof state !== 'object' || state === null || Array.isArray(state)) {
        fail(`Tool "${id}" state must be an object.`);
      }
    }
  }

  const inv = doc.investments as Investments;
  if (!Array.isArray(inv.accounts)) fail('investments.accounts must be an array.');
  if (typeof inv.months !== 'object' || inv.months === null || Array.isArray(inv.months)) {
    fail('investments.months must be an object keyed by "YYYY-MM".');
  }

  const accountIds = new Set<string>();
  for (const acct of inv.accounts) {
    if (!acct?.id || typeof acct.name !== 'string' || !acct.name) {
      fail('Every investment account needs an id and a name.');
    }
    if (acct.type !== undefined && typeof acct.type !== 'string') {
      fail(`Investment account "${acct.id}": type must be a string.`);
    }
    if (accountIds.has(acct.id)) fail(`Duplicate investment account id "${acct.id}".`);
    accountIds.add(acct.id);
  }

  for (const [key, month] of Object.entries(inv.months)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
      fail(`Investment month "${key}" is not a "YYYY-MM" key.`);
    }
    if (typeof month?.balances !== 'object' || month.balances === null) {
      fail(`Investment month "${key}" has no balances object.`);
    }
    for (const [acctId, value] of Object.entries(month.balances)) {
      if (!accountIds.has(acctId)) {
        fail(`Investment month "${key}" references unknown account "${acctId}".`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(`Investment month "${key}", account "${acctId}": balance must be a number.`);
      }
    }
    if (month.autofilled !== undefined) {
      if (!Array.isArray(month.autofilled)) {
        fail(`Investment month "${key}": autofilled must be an array of account ids.`);
      }
      for (const acctId of month.autofilled) {
        if (!accountIds.has(acctId)) {
          fail(`Investment month "${key}": autofilled references unknown account "${acctId}".`);
        }
        // A flag with no balance beside it would tint nothing and quietly
        // misreport what is estimated, so treat it as a broken file.
        if (!(acctId in month.balances)) {
          fail(
            `Investment month "${key}": account "${acctId}" is flagged autofilled ` +
              `but has no balance.`,
          );
        }
      }
    }
    if (month.manualContribution !== undefined) {
      const v = month.manualContribution;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        fail(`Investment month "${key}": manualContribution must be a number.`);
      }
    }
  }
}
