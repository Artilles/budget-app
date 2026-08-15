import { type BudgetDoc, SCHEMA_VERSION, ValidationError, validateDoc } from './schema';

/**
 * Migrations are keyed by the version they upgrade *from*, and are applied in
 * sequence until the document reaches SCHEMA_VERSION.
 *
 * Adding one: bump SCHEMA_VERSION in schema.ts, then register the transform
 * here under the previous version number. Migrations receive a plain object,
 * not a validated BudgetDoc — the shape they accept is by definition the old
 * shape, so they are typed loosely on purpose.
 */
type RawDoc = Record<string, unknown>;

/** Sum of a year's Assets lines for one month, ignoring informational rows. */
function assetsForMonth(doc: RawDoc, year: string, monthIndex: number): number {
  const years = (doc.years ?? {}) as Record<string, { lines?: RawLine[] }>;
  const lines = years[year]?.lines ?? [];
  let total = 0;
  for (const line of lines) {
    if (line.group !== 'assets' || line.informational) continue;
    const value = line.months?.[monthIndex];
    if (typeof value === 'number') total += value;
  }
  return total;
}

interface RawLine {
  group?: string;
  informational?: boolean;
  months?: (number | null)[];
}

interface V1Investments {
  months?: string[];
  accounts?: { id: string; name: string; balances?: (number | null)[] }[];
  contributions?: (number | null)[];
}

const migrations: Record<number, (doc: RawDoc) => RawDoc> = {
  /**
   * 1 -> 2. Investments become a map keyed "YYYY-MM", and regular
   * contributions stop being stored because they are now read from the budget.
   *
   * The v1 `contributions` array held budget *plus* one-off amounts added
   * together, so the one-off part is recovered by subtracting what the budget
   * already accounts for. That keeps the migration lossless rather than
   * dropping the lump sums or double-counting them.
   */
  1: (doc) => {
    const old = (doc.investments ?? {}) as V1Investments;
    const keys = old.months ?? [];
    const accounts = (old.accounts ?? []).map(({ id, name }) => ({ id, name }));
    const months: Record<string, { balances: Record<string, number>; manualContribution?: number }> = {};

    keys.forEach((key, i) => {
      const balances: Record<string, number> = {};
      for (const account of old.accounts ?? []) {
        const value = account.balances?.[i];
        if (typeof value === 'number' && Number.isFinite(value)) balances[account.id] = value;
      }

      const combined = old.contributions?.[i];
      const entry: { balances: Record<string, number>; manualContribution?: number } = { balances };

      if (typeof combined === 'number' && Number.isFinite(combined)) {
        const [year, month] = key.split('-');
        const fromBudget = assetsForMonth(doc, year, Number(month) - 1);
        const manual = Math.round((combined - fromBudget) * 100) / 100;
        // Below a cent is float noise, not a contribution.
        if (manual >= 0.005) entry.manualContribution = manual;
      }

      if (Object.keys(balances).length || entry.manualContribution !== undefined) {
        months[key] = entry;
      }
    });

    return { ...doc, schemaVersion: 2, investments: { accounts, months } };
  },
};

export class SchemaVersionError extends Error {}

/**
 * Brings a loaded document up to the current schema and validates it.
 * Throws SchemaVersionError or ValidationError rather than returning a partial
 * result — a budget file that cannot be read correctly must not be opened at
 * all, because the app autosaves and would overwrite the original.
 */
export function migrate(raw: unknown): BudgetDoc {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('Budget file is empty or not valid JSON.');
  }

  let doc = { ...(raw as RawDoc) };
  const startVersion = doc.schemaVersion;

  if (typeof startVersion !== 'number' || !Number.isInteger(startVersion) || startVersion < 1) {
    throw new ValidationError(`Budget file has an invalid schemaVersion: ${String(startVersion)}`);
  }

  if (startVersion > SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `This file was written by a newer version of the app (schema v${startVersion}; ` +
        `this build understands up to v${SCHEMA_VERSION}). Update the app before opening it.`,
    );
  }

  while ((doc.schemaVersion as number) < SCHEMA_VERSION) {
    const from = doc.schemaVersion as number;
    const step = migrations[from];
    if (!step) {
      throw new SchemaVersionError(
        `No migration registered from schema v${from} to v${from + 1}.`,
      );
    }
    doc = step(doc);
    if ((doc.schemaVersion as number) <= from) {
      throw new SchemaVersionError(`Migration from v${from} did not advance schemaVersion.`);
    }
  }

  validateDoc(doc);
  return doc;
}
