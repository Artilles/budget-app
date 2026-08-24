import { describe, expect, it } from 'vitest';
import { GROUPS, validateDoc } from './schema';
import { STARTER_CATEGORIES, createStarterDoc } from './starter';

const base = { name: 'Household', accounts: [] as { name: string; type?: string }[] };

describe('a budget created by the wizard', () => {
  it('is a valid document', () => {
    expect(() => validateDoc(createStarterDoc(base))).not.toThrow();
  });

  it('takes the name it was given', () => {
    expect(createStarterDoc(base).name).toBe('Household');
  });

  it('trims and caps the name, like renaming does', () => {
    expect(createStarterDoc({ ...base, name: '   Spaced   ' }).name).toBe('Spaced');
    expect(createStarterDoc({ ...base, name: 'x'.repeat(80) }).name).toHaveLength(50);
  });

  it('leaves an unnamed budget with no name key at all', () => {
    expect(createStarterDoc({ ...base, name: '  ' })).not.toHaveProperty('name');
  });

  it('opens on the current year by default', () => {
    const doc = createStarterDoc(base, new Date(2031, 5, 1));
    expect(Object.keys(doc.years)).toEqual(['2031']);
    expect(doc.years['2031'].year).toBe(2031);
  });

  it('lays every starter category into that year', () => {
    const doc = createStarterDoc(base);
    const year = Object.values(doc.years)[0];
    expect(year.lines).toHaveLength(STARTER_CATEGORIES.length);
    expect(Object.keys(doc.categories)).toHaveLength(STARTER_CATEGORIES.length);
  });

  it('gives every line a category that exists', () => {
    const doc = createStarterDoc(base);
    for (const line of Object.values(doc.years)[0].lines) {
      expect(doc.categories[line.categoryId]).toBeDefined();
    }
  });

  it('uses only real groups', () => {
    const doc = createStarterDoc(base);
    for (const line of Object.values(doc.years)[0].lines) {
      expect(GROUPS).toContain(line.group);
    }
  });

  it('populates no numbers anywhere — the whole point', () => {
    const doc = createStarterDoc({
      name: 'Household',
      accounts: [{ name: 'Brokerage', type: 'TFSA' }],
    });
    for (const line of Object.values(doc.years)[0].lines) {
      expect(line.months).toHaveLength(12);
      expect(line.months.every((m) => m === null)).toBe(true);
    }
    expect(doc.investments.months).toEqual({});
    expect(doc.raises).toEqual([]);
    expect(doc.vestingEvents).toEqual([]);
  });

  it('gives each line a distinct order within its group', () => {
    const doc = createStarterDoc(base);
    const lines = Object.values(doc.years)[0].lines;
    for (const group of GROUPS) {
      const orders = lines.filter((l) => l.group === group).map((l) => l.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('creates the investment accounts it was given, in order', () => {
    const doc = createStarterDoc({
      ...base,
      accounts: [
        { name: 'Brokerage One', type: 'TFSA' },
        { name: 'Brokerage Two', type: 'RRSP' },
      ],
    });
    expect(doc.investments.accounts.map((a) => [a.name, a.type])).toEqual([
      ['Brokerage One', 'TFSA'],
      ['Brokerage Two', 'RRSP'],
    ]);
  });

  it('drops blank rows, which are just abandoned typing', () => {
    const doc = createStarterDoc({
      ...base,
      accounts: [{ name: '  ' }, { name: 'Real' }, { name: '' }],
    });
    expect(doc.investments.accounts.map((a) => a.name)).toEqual(['Real']);
  });

  it('drops a duplicate name, which no chart could tell apart', () => {
    const doc = createStarterDoc({
      ...base,
      accounts: [{ name: 'Brokerage' }, { name: '  brokerage  ' }],
    });
    expect(doc.investments.accounts).toHaveLength(1);
  });

  it('omits the type when none was chosen, rather than storing empty', () => {
    const doc = createStarterDoc({ ...base, accounts: [{ name: 'Plain', type: '  ' }] });
    expect(doc.investments.accounts[0]).not.toHaveProperty('type');
  });

  it('gives accounts unique ids', () => {
    const doc = createStarterDoc({
      ...base,
      accounts: [{ name: 'A B' }, { name: 'A  B!' }],
    });
    const ids = doc.investments.accounts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => validateDoc(doc)).not.toThrow();
  });

  it('validates with accounts present', () => {
    const doc = createStarterDoc({ ...base, accounts: [{ name: 'Brokerage', type: 'TFSA' }] });
    expect(() => validateDoc(doc)).not.toThrow();
  });
});
