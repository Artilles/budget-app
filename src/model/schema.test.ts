import { describe, expect, it } from 'vitest';
import {
  type BudgetDoc,
  SCHEMA_VERSION,
  ValidationError,
  createEmptyDoc,
  emptyMonths,
  serializeDoc,
  slugify,
  validateDoc,
} from './schema';
import { SchemaVersionError, migrate } from './migrate';

function sampleDoc(): BudgetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: {
      mortgage: { id: 'mortgage', name: 'Mortgage' },
      'apartment-rent': { id: 'apartment-rent', name: 'Apartment Rent' },
      'pay-1st': { id: 'pay-1st', name: 'Income after Taxes (1st)' },
    },
    years: {
      // 2016 uses a category that 2025 has dropped — the case the whole
      // append-only-registry design exists to support.
      '2016': {
        year: 2016,
        jobTitle: 'Unemployed',
        lines: [
          { categoryId: 'pay-1st', group: 'income', order: 0, months: emptyMonths() },
          { categoryId: 'apartment-rent', group: 'costOfLiving', order: 1, months: emptyMonths() },
          // Mortgage sat under Cost of Living before it moved to Debt.
          { categoryId: 'mortgage', group: 'costOfLiving', order: 2, months: emptyMonths() },
        ],
      },
      '2025': {
        year: 2025,
        jobTitle: 'Software Engineer',
        lines: [
          // Awkward decimals on purpose: serialisation must not round them.
          { categoryId: 'pay-1st', group: 'income', order: 0, months: Array(12).fill(3500.09) },
          { categoryId: 'mortgage', group: 'debt', order: 1, months: Array(12).fill(2000.86) },
        ],
      },
    },
    raises: [{ id: 'r1', company: 'Globex L5', baseSalary: 120000, date: '2022-10-01' }],
    vestingEvents: [{ id: 'v1', date: '2025-05-15', units: 100, price: 200 }],
    investments: {
      accounts: [{ id: 'tfsa', name: 'Brokerage One TFSA' }],
      months: {
        '2025-01': { balances: { tfsa: 50000.95 }, manualContribution: 2000 },
        '2025-02': { balances: { tfsa: 52000.36 } },
      },
    },
  };
}

describe('validateDoc', () => {
  it('accepts an empty document', () => {
    expect(() => validateDoc(createEmptyDoc())).not.toThrow();
  });

  it('accepts a populated document', () => {
    expect(() => validateDoc(sampleDoc())).not.toThrow();
  });

  it('rejects a months array that is not exactly 12 long', () => {
    const doc = sampleDoc();
    doc.years['2025'].lines[0].months = [1, 2, 3];
    expect(() => validateDoc(doc)).toThrow(ValidationError);
  });

  it('rejects a line referencing an unknown category', () => {
    const doc = sampleDoc();
    doc.years['2025'].lines[0].categoryId = 'does-not-exist';
    expect(() => validateDoc(doc)).toThrow(/unknown category/);
  });

  it('rejects the same category appearing twice in one year', () => {
    const doc = sampleDoc();
    doc.years['2025'].lines[1].categoryId = 'pay-1st';
    expect(() => validateDoc(doc)).toThrow(/more than once/);
  });

  it('rejects a year whose key and year field disagree', () => {
    const doc = sampleDoc();
    doc.years['2025'].year = 2024;
    expect(() => validateDoc(doc)).toThrow(/mismatched year/);
  });

  it('rejects an unknown group on a line', () => {
    const doc = sampleDoc();
    // @ts-expect-error deliberately invalid
    doc.years['2025'].lines[1].group = 'savings';
    expect(() => validateDoc(doc)).toThrow(/unknown group/);
  });

  it('allows one category to sit in different groups in different years', () => {
    // Mortgage really does move from Cost of Living to Debt in the source data.
    expect(() => validateDoc(sampleDoc())).not.toThrow();
  });

  it('rejects a balance against an account that does not exist', () => {
    const doc = sampleDoc();
    doc.investments.months['2025-01'].balances.ghost = 100;
    expect(() => validateDoc(doc)).toThrow(/unknown account/);
  });

  it('rejects a month key that is not YYYY-MM', () => {
    const doc = sampleDoc();
    doc.investments.months['2025-13'] = { balances: {} };
    expect(() => validateDoc(doc)).toThrow(/not a "YYYY-MM" key/);
  });

  it('rejects duplicate investment account ids', () => {
    const doc = sampleDoc();
    doc.investments.accounts.push({ id: 'tfsa', name: 'Another' });
    expect(() => validateDoc(doc)).toThrow(/Duplicate investment account/);
  });
});

describe('migrate', () => {
  it('round-trips a document through JSON without loss', () => {
    const original = sampleDoc();
    const restored = migrate(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
  });

  it('preserves a category that only older years reference', () => {
    const restored = migrate(JSON.parse(JSON.stringify(sampleDoc())));
    expect(restored.categories['apartment-rent']).toBeDefined();
    expect(restored.years['2025'].lines.map((l) => l.categoryId)).not.toContain('apartment-rent');
    expect(restored.years['2016'].lines.map((l) => l.categoryId)).toContain('apartment-rent');
  });

  it('keeps each year\'s own grouping of a shared category', () => {
    const restored = migrate(JSON.parse(JSON.stringify(sampleDoc())));
    const groupOf = (year: string) =>
      restored.years[year].lines.find((l) => l.categoryId === 'mortgage')?.group;
    expect(groupOf('2016')).toBe('costOfLiving');
    expect(groupOf('2025')).toBe('debt');
  });

  it('migrates v1 investments into the month map, recovering lump sums', () => {
    // v1 stored budget + one-off contributions added together. 2020 budgets
    // 100/month into assets, so a stored 1,100 means a 1,000 lump sum.
    const v1 = {
      schemaVersion: 1,
      categories: { tfsa: { id: 'tfsa', name: 'TFSA' } },
      years: {
        '2020': {
          year: 2020,
          lines: [
            { categoryId: 'tfsa', group: 'assets', order: 0, months: Array(12).fill(100) },
          ],
        },
      },
      raises: [],
      vestingEvents: [],
      investments: {
        months: ['2020-01', '2020-02'],
        accounts: [{ id: 'a', name: 'TFSA', balances: [500, 1_700] }],
        contributions: [100, 1_100],
      },
    };

    const migrated = migrate(v1);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.investments.accounts).toEqual([{ id: 'a', name: 'TFSA' }]);
    expect(migrated.investments.months['2020-01'].balances).toEqual({ a: 500 });

    // January was budget-only, so no lump sum is invented.
    expect(migrated.investments.months['2020-01'].manualContribution).toBeUndefined();
    // February had 1,100 against a 100 budget: the 1,000 remainder survives.
    expect(migrated.investments.months['2020-02'].manualContribution).toBe(1_000);
  });

  it('refuses a file written by a newer schema', () => {
    const doc = { ...sampleDoc(), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrate(doc)).toThrow(SchemaVersionError);
  });

  it('rejects a missing or malformed schemaVersion', () => {
    expect(() => migrate({})).toThrow(ValidationError);
    expect(() => migrate(null)).toThrow(ValidationError);
  });
});

describe('serializeDoc', () => {
  it('puts a year’s metadata before its lines, so it is visible in the file', () => {
    const doc = sampleDoc();
    doc.years['2025'].locked = true;

    const json = serializeDoc(doc);
    const block = json.slice(json.indexOf('"2025"'));
    // All three appear before the long months array begins.
    expect(block.indexOf('"jobTitle"')).toBeLessThan(block.indexOf('"lines"'));
    expect(block.indexOf('"locked"')).toBeLessThan(block.indexOf('"lines"'));
  });

  it('round-trips without losing anything', () => {
    const doc = sampleDoc();
    doc.years['2025'].locked = true;
    expect(migrate(JSON.parse(serializeDoc(doc)))).toEqual(doc);
  });

  it('omits absent optional fields rather than writing null', () => {
    const json = serializeDoc(sampleDoc());
    expect(json).not.toContain('"locked"');
    expect(json).not.toContain('null,\n      "months"');
  });

  it('writes years in ascending order', () => {
    const json = serializeDoc(sampleDoc());
    expect(json.indexOf('"2016"')).toBeLessThan(json.indexOf('"2025"'));
  });
});

describe('slugify', () => {
  it('produces stable, readable ids', () => {
    expect(slugify('Food/Groceries/Indiscretionary Expenses')).toBe(
      'food-groceries-indiscretionary-expenses',
    );
    expect(slugify('Coquitlam Water+Sewage')).toBe('coquitlam-water-sewage');
    expect(slugify('!!!')).toBe('category');
  });
});
