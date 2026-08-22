import { describe, expect, it } from 'vitest';
import { type BudgetDoc, MAX_BUDGET_NAME, SCHEMA_VERSION, validateDoc } from './schema';
import {
  addCategoryToYear,
  addRaise,
  addVestingEvent,
  createYear,
  deleteYear,
  fillAcross,
  fillInvestmentGaps,
  investmentGapFills,
  lockedYearsAffectedByMerge,
  mergeCategories,
  mergeOverlap,
  moveInvestmentAccount,
  moveLine,
  removeCategoryFromYear,
  removeInvestmentAccount,
  removeRaise,
  removeVestingEvent,
  renameCategory,
  setAccountBalance,
  setBudgetName,
  setInvestmentAccountType,
  setLineGroup,
  setMonthValue,
  setToolState,
  setYearJobTitle,
  setYearLocked,
  updateRaise,
  updateVestingEvent,
} from './mutate';
import { linesIn, yearTotals } from './derive';

function doc(): BudgetDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: {
      pay: { id: 'pay', name: 'Income after Taxes (1st)' },
      rent: { id: 'rent', name: 'Apartment Rent' },
      mortgage: { id: 'mortgage', name: 'Mortgage' },
      rrsp: { id: 'rrsp', name: 'RRSP Contributions (Pre-Income)' },
      reimb: { id: 'reimb', name: 'Reimbursements incl. in paystub' },
    },
    years: {
      '2016': {
        year: 2016,
        lines: [
          { categoryId: 'pay', group: 'income', order: 0, months: Array(12).fill(1000) },
          { categoryId: 'rent', group: 'costOfLiving', order: 1, months: Array(12).fill(500) },
        ],
      },
      '2025': {
        year: 2025,
        lines: [
          { categoryId: 'pay', group: 'income', order: 0, months: Array(12).fill(2000) },
          { categoryId: 'mortgage', group: 'debt', order: 1, months: Array(12).fill(800) },
          { categoryId: 'rrsp', group: 'assets', order: 2, months: Array(12).fill(100), preIncome: true },
          { categoryId: 'reimb', group: 'income', order: 3, months: Array(12).fill(50), informational: true },
        ],
      },
    },
    raises: [],
    vestingEvents: [],
    investments: { accounts: [], months: {} },
  };
}

describe('setMonthValue', () => {
  it('changes only the targeted cell', () => {
    const before = doc();
    const after = setMonthValue(before, '2025', 'mortgage', 3, 950);

    expect(after.years['2025'].lines[1].months[3]).toBe(950);
    expect(after.years['2025'].lines[1].months[2]).toBe(800);
    expect(after.years['2025'].lines[0].months[3]).toBe(2000);
  });

  it('leaves every other year untouched by reference', () => {
    // The strongest available statement of "editing 2025 cannot affect 2016":
    // the other year is not merely equal, it is the same object.
    const before = doc();
    const after = setMonthValue(before, '2025', 'mortgage', 3, 950);

    expect(after.years['2016']).toBe(before.years['2016']);
    expect(after.categories).toBe(before.categories);
  });

  it('does not mutate the original document', () => {
    const before = doc();
    const snapshot = JSON.stringify(before);
    setMonthValue(before, '2025', 'mortgage', 3, 950);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('accepts null to clear a cell', () => {
    const after = setMonthValue(doc(), '2025', 'mortgage', 0, null);
    expect(after.years['2025'].lines[1].months[0]).toBeNull();
  });

  it('returns the same document for an out-of-range month or unknown year', () => {
    const before = doc();
    expect(setMonthValue(before, '2025', 'mortgage', 12, 1)).toBe(before);
    expect(setMonthValue(before, '1999', 'mortgage', 0, 1)).toBe(before);
  });

  it('returns the identical document when the value is unchanged', () => {
    // A no-op edit must not produce a new object, or the grid re-renders and
    // the debounced autosave fires for nothing.
    const before = doc();
    expect(setMonthValue(before, '2025', 'mortgage', 0, 800)).toBe(before);
  });
});

describe('fillAcross', () => {
  it('fills forward only, leaving earlier months alone', () => {
    let d = doc();
    d = setMonthValue(d, '2025', 'mortgage', 5, 999);
    d = fillAcross(d, '2025', 'mortgage', 5);

    const months = d.years['2025'].lines[1].months;
    expect(months.slice(0, 5)).toEqual(Array(5).fill(800));
    expect(months.slice(5)).toEqual(Array(7).fill(999));
  });

  it('propagates an empty cell as empty', () => {
    let d = setMonthValue(doc(), '2025', 'mortgage', 0, null);
    d = fillAcross(d, '2025', 'mortgage', 0);
    expect(d.years['2025'].lines[1].months.every((m) => m === null)).toBe(true);
  });
});

describe('locking a year', () => {
  function locked(): BudgetDoc {
    return setYearLocked(doc(), '2025', true);
  }

  it('refuses every content mutation, not just the ones the UI disables', () => {
    const d = locked();

    // Each of these reaches the year by a different route.
    expect(setMonthValue(d, '2025', 'mortgage', 0, 1)).toBe(d);
    expect(fillAcross(d, '2025', 'mortgage', 0)).toBe(d);
    expect(addCategoryToYear(d, '2025', 'Gym', 'costOfLiving')).toBe(d);
    expect(removeCategoryFromYear(d, '2025', 'mortgage')).toBe(d);
    expect(moveLine(d, '2025', 'mortgage', -1)).toBe(d);
    expect(setLineGroup(d, '2025', 'mortgage', 'costOfLiving')).toBe(d);
    expect(setYearJobTitle(d, '2025', 'Anything')).toBe(d);
  });

  it('refuses deletion, so the lock cannot be sidestepped', () => {
    const d = locked();
    expect(deleteYear(d, '2025')).toBe(d);
  });

  it('leaves other years fully editable', () => {
    const d = locked();
    const after = setMonthValue(d, '2016', 'rent', 0, 999);
    expect(after.years['2016'].lines[1].months[0]).toBe(999);
    expect(after.years['2025']).toBe(d.years['2025']);
  });

  it('unlocks cleanly, dropping the flag rather than storing false', () => {
    const unlocked = setYearLocked(locked(), '2025', false);
    expect('locked' in unlocked.years['2025']).toBe(false);
    expect(setMonthValue(unlocked, '2025', 'mortgage', 0, 1).years['2025'].lines[1].months[0]).toBe(1);
  });

  it('blocks a merge that would have to rewrite a locked year', () => {
    const d = locked();
    expect(lockedYearsAffectedByMerge(d, 'mortgage')).toEqual(['2025']);
    // All-or-nothing: a partial merge would orphan the locked year's reference.
    expect(mergeCategories(d, 'mortgage', 'rent')).toBe(d);
  });

  it('allows a merge that does not touch the locked year', () => {
    const d = setYearLocked(doc(), '2016', true);
    // "reimb" exists only in 2025, so 2016 being locked is irrelevant.
    expect(lockedYearsAffectedByMerge(d, 'reimb')).toEqual([]);
    expect(mergeCategories(d, 'reimb', 'pay')).not.toBe(d);
  });

  it('still allows renaming, which is global metadata not the year’s figures', () => {
    const d = locked();
    expect(renameCategory(d, 'mortgage', 'Home loan').categories.mortgage.name).toBe('Home loan');
  });
});

describe('filling investment gaps', () => {
  function invDoc(): BudgetDoc {
    return {
      ...doc(),
      investments: {
        accounts: [
          { id: 'a', name: 'TFSA' },
          { id: 'b', name: 'RRSP' },
        ],
        months: {
          '2020-01': { balances: { a: 1_000 } },
          '2020-04': { balances: { a: 4_000 } },
          '2020-05': { balances: { a: 5_000, b: 200 } },
        },
      },
    };
  }

  it('offers thirds for a two-month gap', () => {
    const fills = investmentGapFills(invDoc()).filter((f) => f.accountId === 'a');
    expect(fills.map((f) => [f.month, f.value])).toEqual([
      ['2020-02', 2_000],
      ['2020-03', 3_000],
    ]);
  });

  it('offers the midpoint for a single missing month', () => {
    const d = invDoc();
    d.investments.months = {
      '2020-01': { balances: { a: 1_000 } },
      '2020-03': { balances: { a: 2_000 } },
    };
    expect(investmentGapFills(d)).toEqual([{ month: '2020-02', accountId: 'a', value: 1_500 }]);
  });

  it('does not invent anything past the last reading', () => {
    // Account b is only ever read once, so it has no gap to interpolate.
    expect(investmentGapFills(invDoc()).some((f) => f.accountId === 'b')).toBe(false);
  });

  describe('the current month is the ceiling', () => {
    /** A gap running Jan -> Jun, with "today" landing inside it. */
    function spanning(): BudgetDoc {
      return {
        ...doc(),
        investments: {
          accounts: [{ id: 'a', name: 'TFSA' }],
          months: {
            '2026-01': { balances: { a: 1_000 } },
            '2026-06': { balances: { a: 6_000 } },
          },
        },
      };
    }

    it('fills only the months already past', () => {
      // Today is April: Feb and Mar are fillable, Apr and May are not.
      const fills = investmentGapFills(spanning(), new Date(2026, 3, 14));
      expect(fills.map((f) => f.month)).toEqual(['2026-02', '2026-03']);
    });

    it('places them on the line across the whole gap, not the filled part', () => {
      // Jan 1,000 -> Jun 6,000 over five steps of 1,000 — February is 2,000
      // whether or not the later months get written.
      const fills = investmentGapFills(spanning(), new Date(2026, 3, 14));
      expect(fills.map((f) => f.value)).toEqual([2_000, 3_000]);
    });

    it('fills nothing when the whole gap is still ahead', () => {
      expect(investmentGapFills(spanning(), new Date(2026, 0, 15))).toEqual([]);
    });

    it('fills the lot once the gap is behind', () => {
      const fills = investmentGapFills(spanning(), new Date(2026, 6, 1));
      expect(fills.map((f) => f.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05']);
    });

    it('uses a reading in the following year to anchor a gap in this one', () => {
      const d: BudgetDoc = {
        ...doc(),
        investments: {
          accounts: [{ id: 'a', name: 'TFSA' }],
          months: {
            '2025-11': { balances: { a: 1_000 } },
            '2026-02': { balances: { a: 4_000 } },
          },
        },
      };
      const fills = investmentGapFills(d, new Date(2026, 5, 1));
      expect(fills.map((f) => [f.month, f.value])).toEqual([
        ['2025-12', 2_000],
        ['2026-01', 3_000],
      ]);
    });
  });

  describe('scoped to one year', () => {
    /** A gap running Nov 2025 -> Feb 2026, straddling the year boundary. */
    function straddling(): BudgetDoc {
      return {
        ...doc(),
        investments: {
          accounts: [{ id: 'a', name: 'TFSA' }],
          months: {
            '2025-11': { balances: { a: 1_000 } },
            '2026-02': { balances: { a: 4_000 } },
          },
        },
      };
    }

    it('writes only months inside the year asked for', () => {
      const fills = investmentGapFills(straddling(), new Date(2026, 5, 1), '2025');
      expect(fills.map((f) => f.month)).toEqual(['2025-12']);
    });

    it('still anchors on the next year, so the value is unchanged by scoping', () => {
      // Nov 1,000 -> Feb 4,000 is three steps of 1,000; December is 2,000
      // whether or not January is also being written.
      const scoped = investmentGapFills(straddling(), new Date(2026, 5, 1), '2025');
      const all = investmentGapFills(straddling(), new Date(2026, 5, 1));
      expect(scoped[0].value).toBe(2_000);
      expect(all.find((f) => f.month === '2025-12')!.value).toBe(2_000);
    });

    it('leaves the other year untouched when filling', () => {
      const filled = fillInvestmentGaps(straddling(), new Date(2026, 5, 1), '2025');
      expect(filled.investments.months['2025-12'].balances.a).toBe(2_000);
      expect(filled.investments.months['2026-01']).toBeUndefined();
    });

    it('fills everything when no year is given', () => {
      const filled = fillInvestmentGaps(straddling(), new Date(2026, 5, 1));
      expect(filled.investments.months['2026-01'].balances.a).toBe(3_000);
    });

    it('offers nothing for a year with no gaps of its own', () => {
      expect(investmentGapFills(straddling(), new Date(2026, 5, 1), '2024')).toEqual([]);
    });
  });

  describe('marking autofilled values', () => {
    it('flags what it writes, and only what it writes', () => {
      const filled = fillInvestmentGaps(invDoc());
      expect(filled.investments.months['2020-02'].autofilled).toEqual(['a']);
      expect(filled.investments.months['2020-03'].autofilled).toEqual(['a']);
      // January was typed by hand, so it must not be flagged.
      expect(filled.investments.months['2020-01'].autofilled).toBeUndefined();
    });

    it('clears the flag when the value is edited', () => {
      let d = fillInvestmentGaps(invDoc());
      expect(d.investments.months['2020-02'].autofilled).toEqual(['a']);
      d = setAccountBalance(d, '2020-02', 'a', 2_222);
      expect(d.investments.months['2020-02'].autofilled).toBeUndefined();
      expect(d.investments.months['2020-02'].balances.a).toBe(2_222);
    });

    it('clears the flag when the same value is retyped, promoting it to observed', () => {
      let d = fillInvestmentGaps(invDoc());
      const same = d.investments.months['2020-02'].balances.a;
      d = setAccountBalance(d, '2020-02', 'a', same);
      expect(d.investments.months['2020-02'].autofilled).toBeUndefined();
    });

    it('drops the flag when the balance is cleared', () => {
      let d = fillInvestmentGaps(invDoc());
      d = setAccountBalance(d, '2020-02', 'a', null);
      expect(d.investments.months['2020-02']?.autofilled).toBeUndefined();
    });

    it('drops the flag with the account, so the file still validates', () => {
      const filled = fillInvestmentGaps(invDoc());
      const gone = removeInvestmentAccount(filled, 'a');
      for (const m of Object.values(gone.investments.months)) {
        expect(m.autofilled).toBeUndefined();
      }
      expect(() => validateDoc(gone)).not.toThrow();
    });

    it('produces a document that validates', () => {
      expect(() => validateDoc(fillInvestmentGaps(invDoc()))).not.toThrow();
    });
  });

  it('offers nothing when every month is already recorded', () => {
    const d = invDoc();
    d.investments.months = {
      '2020-01': { balances: { a: 1 } },
      '2020-02': { balances: { a: 2 } },
    };
    expect(investmentGapFills(d)).toEqual([]);
  });

  it('writes the fills, and then has nothing left to offer', () => {
    const filled = fillInvestmentGaps(invDoc());
    expect(filled.investments.months['2020-02'].balances.a).toBe(2_000);
    expect(filled.investments.months['2020-03'].balances.a).toBe(3_000);
    expect(investmentGapFills(filled)).toEqual([]);
    expect(() => validateDoc(filled)).not.toThrow();
  });

  it('leaves a document with no gaps identical', () => {
    const before = doc();
    expect(fillInvestmentGaps(before)).toBe(before);
  });
});

describe('naming the budget', () => {
  it('stores the name on the document', () => {
    expect(setBudgetName(doc(), 'Household').name).toBe('Household');
  });

  it('trims surrounding whitespace', () => {
    expect(setBudgetName(doc(), '   Household budget  ').name).toBe('Household budget');
  });

  it('caps the name at 50 characters', () => {
    const long = 'x'.repeat(80);
    expect(setBudgetName(doc(), long).name).toHaveLength(MAX_BUDGET_NAME);
  });

  it('does not leave a trailing space when truncating mid-gap', () => {
    // 50 characters lands exactly on a space, which must not survive the cut.
    const awkward = `${'x'.repeat(49)} tail`;
    const named = setBudgetName(doc(), awkward).name!;
    expect(named).toBe('x'.repeat(49));
    expect(named).not.toMatch(/s$/);
  });

  it('clears the name when set to empty or whitespace', () => {
    const named = setBudgetName(doc(), 'Household');
    expect('name' in setBudgetName(named, '   ')).toBe(false);
  });

  it('returns the identical document when the name is unchanged', () => {
    const named = setBudgetName(doc(), 'Household');
    expect(setBudgetName(named, 'Household')).toBe(named);
    expect(setBudgetName(named, '  Household  ')).toBe(named);
  });

  it('leaves an unnamed document untouched when clearing', () => {
    const d = doc();
    expect(setBudgetName(d, '')).toBe(d);
  });

  it('touches nothing else, so renaming cannot disturb the budget', () => {
    const before = doc();
    const after = setBudgetName(before, 'Household');
    expect(after.years).toBe(before.years);
    expect(after.categories).toBe(before.categories);
    expect(after.investments).toBe(before.investments);
    expect(() => validateDoc(after)).not.toThrow();
  });

  it('renames a document with a locked year, since the name is not year data', () => {
    const d = setYearLocked(doc(), '2025', true);
    expect(setBudgetName(d, 'Household').name).toBe('Household');
  });
});

describe('investment accounts', () => {
  function withAccounts(): BudgetDoc {
    return {
      ...doc(),
      investments: {
        accounts: [
          { id: 'a', name: 'TFSA' },
          { id: 'b', name: 'RRSP' },
          { id: 'c', name: 'Cash' },
        ],
        months: { '2020-01': { balances: { a: 1, b: 2, c: 3 } } },
      },
    };
  }

  const order = (d: BudgetDoc) => d.investments.accounts.map((a) => a.id);

  it('moves an account to a later position', () => {
    expect(order(moveInvestmentAccount(withAccounts(), 'a', 2))).toEqual(['b', 'c', 'a']);
  });

  it('moves an account to an earlier position', () => {
    expect(order(moveInvestmentAccount(withAccounts(), 'c', 0))).toEqual(['c', 'a', 'b']);
  });

  it('clamps an index past either end rather than dropping the account', () => {
    expect(order(moveInvestmentAccount(withAccounts(), 'a', 99))).toEqual(['b', 'c', 'a']);
    expect(order(moveInvestmentAccount(withAccounts(), 'c', -5))).toEqual(['c', 'a', 'b']);
  });

  it('leaves the document identical when nothing would move', () => {
    const d = withAccounts();
    expect(moveInvestmentAccount(d, 'a', 0)).toBe(d);
    expect(moveInvestmentAccount(d, 'nope', 1)).toBe(d);
  });

  it('does not disturb balances, which are keyed by id not position', () => {
    const moved = moveInvestmentAccount(withAccounts(), 'a', 2);
    expect(moved.investments.months['2020-01'].balances).toEqual({ a: 1, b: 2, c: 3 });
    expect(() => validateDoc(moved)).not.toThrow();
  });

  it('sets and clears an account type', () => {
    let d = setInvestmentAccountType(withAccounts(), 'a', ' TFSA ');
    expect(d.investments.accounts[0].type).toBe('TFSA');
    d = setInvestmentAccountType(d, 'a', '  ');
    expect(d.investments.accounts[0]).not.toHaveProperty('type');
    expect(() => validateDoc(d)).not.toThrow();
  });

  it('leaves the document identical when the type is unchanged', () => {
    const d = setInvestmentAccountType(withAccounts(), 'a', 'TFSA');
    expect(setInvestmentAccountType(d, 'a', 'TFSA')).toBe(d);
  });
});

describe('editing compensation entries', () => {
  function withRaises(): BudgetDoc {
    return {
      ...doc(),
      raises: [
        { id: 'r1', company: 'Initech', baseSalary: 50_000, date: '2016-07-04' },
        { id: 'r2', company: 'Globex', baseSalary: 100_000, date: '2021-05-31', signOnBonus: 30_000 },
      ],
    };
  }

  it('adds an entry with a fresh id', () => {
    const after = addRaise(withRaises(), { baseSalary: 200_000, date: '2027-01-01' });
    expect(after.raises).toHaveLength(3);
    expect(new Set(after.raises.map((r) => r.id)).size).toBe(3);
  });

  it('patches only the named fields, leaving other entries untouched', () => {
    const before = withRaises();
    const after = updateRaise(before, 'r2', { baseSalary: 120_000 });

    const r2 = after.raises.find((r) => r.id === 'r2')!;
    expect(r2.baseSalary).toBe(120_000);
    expect(r2.company).toBe('Globex');
    expect(r2.signOnBonus).toBe(30_000);
    // The entry that was not patched is the same object, not a copy.
    expect(after.raises[0]).toBe(before.raises[0]);
  });

  it('deletes a field set to undefined rather than storing undefined', () => {
    const after = updateRaise(withRaises(), 'r2', { signOnBonus: undefined });
    expect('signOnBonus' in after.raises.find((r) => r.id === 'r2')!).toBe(false);
  });

  it('returns the identical document when nothing changes', () => {
    const before = withRaises();
    expect(updateRaise(before, 'r2', { baseSalary: 100_000 })).toBe(before);
    expect(updateRaise(before, 'nope', { baseSalary: 1 })).toBe(before);
  });

  it('removes an entry', () => {
    const after = removeRaise(withRaises(), 'r1');
    expect(after.raises.map((r) => r.id)).toEqual(['r2']);
  });

  it('handles vesting events the same way', () => {
    const base: BudgetDoc = {
      ...doc(),
      vestingEvents: [{ id: 'v1', date: '2023-05-15', units: 17, price: 177, note: 'Promotion' }],
    };
    expect(addVestingEvent(base, { date: '2024-05-15', units: 20, price: 200 }).vestingEvents)
      .toHaveLength(2);
    expect(updateVestingEvent(base, 'v1', { units: 25 }).vestingEvents[0].units).toBe(25);
    expect('note' in updateVestingEvent(base, 'v1', { note: undefined }).vestingEvents[0]).toBe(false);
    expect(removeVestingEvent(base, 'v1').vestingEvents).toEqual([]);
  });
});

describe('setToolState', () => {
  it('creates a tool slice on first write', () => {
    const after = setToolState(doc(), 'emergency-fund', { months: 6 });
    expect(after.tools).toEqual({ 'emergency-fund': { months: 6 } });
    expect(() => validateDoc(after)).not.toThrow();
  });

  it('merges into an existing slice without disturbing other tools', () => {
    let d = setToolState(doc(), 'emergency-fund', { months: 6, saved: 1_000 });
    d = setToolState(d, 'contribution-room', { tfsaAllowed: 95_000 });
    d = setToolState(d, 'emergency-fund', { saved: 2_000 });

    expect(d.tools!['emergency-fund']).toEqual({ months: 6, saved: 2_000 });
    expect(d.tools!['contribution-room']).toEqual({ tfsaAllowed: 95_000 });
  });

  it('removes a key when set to undefined', () => {
    let d = setToolState(doc(), 'emergency-fund', { months: 6, saved: 1_000 });
    d = setToolState(d, 'emergency-fund', { saved: undefined });
    expect(d.tools!['emergency-fund']).toEqual({ months: 6 });
  });

  it('returns the identical document when nothing changes', () => {
    const before = setToolState(doc(), 'emergency-fund', { months: 6 });
    expect(setToolState(before, 'emergency-fund', { months: 6 })).toBe(before);
    expect(setToolState(before, 'emergency-fund', {})).toBe(before);
  });

  it('leaves the rest of the document untouched by reference', () => {
    const before = doc();
    const after = setToolState(before, 'emergency-fund', { months: 6 });
    expect(after.years).toBe(before.years);
    expect(after.categories).toBe(before.categories);
  });
});

describe('setYearJobTitle', () => {
  it('sets and clears', () => {
    const set = setYearJobTitle(doc(), '2025', '  Software Engineer  ');
    expect(set.years['2025'].jobTitle).toBe('Software Engineer');

    const cleared = setYearJobTitle(set, '2025', '   ');
    expect('jobTitle' in cleared.years['2025']).toBe(false);
  });
});

describe('removing a category', () => {
  it('removes it from the current year only', () => {
    const before = doc();
    const after = removeCategoryFromYear(before, '2025', 'mortgage');

    expect(after.years['2025'].lines.map((l) => l.categoryId)).not.toContain('mortgage');
    // The requirement: other existing years must not be modified.
    expect(after.years['2016']).toBe(before.years['2016']);
  });

  it('keeps the category in the registry so older years still resolve', () => {
    const after = removeCategoryFromYear(doc(), '2016', 'rent');
    expect(after.categories.rent).toBeDefined();
    expect(() => validateDoc(after)).not.toThrow();
  });

  it('is inherited by years created afterwards, but not by years already created', () => {
    let d = doc();
    d = createYear(d, 2026, '2025'); // 2026 exists before the removal
    d = removeCategoryFromYear(d, '2025', 'mortgage');
    d = createYear(d, 2027, '2025'); // 2027 created after it

    expect(d.years['2026'].lines.map((l) => l.categoryId)).toContain('mortgage');
    expect(d.years['2027'].lines.map((l) => l.categoryId)).not.toContain('mortgage');
  });
});

describe('adding a category', () => {
  it('adds to the current year only, leaving others alone', () => {
    const before = doc();
    const after = addCategoryToYear(before, '2016', 'Gym', 'costOfLiving');

    expect(after.years['2016'].lines.map((l) => l.categoryId)).toContain('gym');
    expect(after.years['2025']).toBe(before.years['2025']);
    expect(after.categories.gym.name).toBe('Gym');
  });

  it('reuses an existing category by name, continuing the same series', () => {
    const after = addCategoryToYear(doc(), '2016', 'mortgage', 'debt');
    expect(after.years['2016'].lines.filter((l) => l.categoryId === 'mortgage')).toHaveLength(1);
    expect(Object.keys(after.categories)).toHaveLength(5); // no new category invented
  });

  it('refuses to add the same category twice to one year', () => {
    const before = doc();
    expect(addCategoryToYear(before, '2025', 'Mortgage', 'debt')).toBe(before);
  });

  it('starts new lines empty', () => {
    const after = addCategoryToYear(doc(), '2025', 'Gym', 'costOfLiving');
    const line = after.years['2025'].lines.find((l) => l.categoryId === 'gym')!;
    expect(line.months).toEqual(Array(12).fill(null));
  });
});

describe('renaming', () => {
  it('applies everywhere, because it is the same concept spelled differently', () => {
    const after = renameCategory(doc(), 'pay', 'Salary (1st)');
    expect(after.categories.pay.name).toBe('Salary (1st)');
    // Both years reference the same id, so both display the new name.
    expect(after.years['2016'].lines[0].categoryId).toBe('pay');
    expect(after.years['2025'].lines[0].categoryId).toBe('pay');
  });
});

describe('reordering and regrouping', () => {
  it('moves a line within its group only', () => {
    let d = addCategoryToYear(doc(), '2025', 'Gym', 'costOfLiving');
    d = addCategoryToYear(d, '2025', 'Hydro', 'costOfLiving');
    expect(linesIn(d.years['2025'], 'costOfLiving').map((l) => l.categoryId)).toEqual([
      'gym',
      'hydro',
    ]);

    d = moveLine(d, '2025', 'hydro', -1);
    expect(linesIn(d.years['2025'], 'costOfLiving').map((l) => l.categoryId)).toEqual([
      'hydro',
      'gym',
    ]);
  });

  it('will not move past the end of a group', () => {
    const d = addCategoryToYear(doc(), '2025', 'Gym', 'costOfLiving');
    expect(moveLine(d, '2025', 'gym', -1)).toBe(d);
  });

  it('regroups in one year without touching another', () => {
    // Exactly the Mortgage case: Cost of Living in 2016, Debt in 2025.
    const before = doc();
    const after = setLineGroup(before, '2025', 'mortgage', 'costOfLiving');

    expect(after.years['2025'].lines.find((l) => l.categoryId === 'mortgage')!.group).toBe(
      'costOfLiving',
    );
    expect(after.years['2016']).toBe(before.years['2016']);
    expect(yearTotals(after.years['2025']).debt).toBe(0);
  });
});

describe('creating a year', () => {
  it('copies structure but not amounts by default', () => {
    const after = createYear(doc(), 2026, '2025');
    expect(after.years['2026'].lines.map((l) => l.categoryId)).toEqual(
      doc().years['2025'].lines.map((l) => l.categoryId),
    );
    expect(after.years['2026'].lines.every((l) => l.months.every((m) => m === null))).toBe(true);
  });

  it('copies amounts and flags when asked', () => {
    const after = createYear(doc(), 2026, '2025', true);
    const rrsp = after.years['2026'].lines.find((l) => l.categoryId === 'rrsp')!;
    expect(rrsp.months).toEqual(Array(12).fill(100));
    expect(rrsp.preIncome).toBe(true);
  });

  it('refuses to overwrite an existing year', () => {
    const before = doc();
    expect(createYear(before, 2025, '2016')).toBe(before);
  });
});

describe('merging categories', () => {
  it('folds a renamed category into one unbroken series', () => {
    // "rent" only in 2016, "mortgage" only in 2025 — the real-world shape.
    const before = doc();
    expect(mergeOverlap(before, 'rent', 'mortgage')).toEqual([]);

    const after = mergeCategories(before, 'rent', 'mortgage');
    expect(after.categories.rent).toBeUndefined();
    expect(after.years['2016'].lines.map((l) => l.categoryId)).toContain('mortgage');
    expect(after.years['2016'].lines.find((l) => l.categoryId === 'mortgage')!.months).toEqual(
      Array(12).fill(500),
    );
    expect(() => validateDoc(after)).not.toThrow();
  });

  it('reports overlap and sums amounts where both appear in a year', () => {
    const before = addCategoryToYear(doc(), '2025', 'Apartment Rent', 'costOfLiving');
    const withData = setMonthValue(before, '2025', 'rent', 0, 300);

    expect(mergeOverlap(withData, 'rent', 'mortgage')).toEqual(['2025']);

    const after = mergeCategories(withData, 'rent', 'mortgage');
    expect(after.years['2025'].lines.find((l) => l.categoryId === 'mortgage')!.months[0]).toBe(
      1100, // 800 mortgage + 300 rent
    );
    expect(after.years['2025'].lines.filter((l) => l.categoryId === 'rent')).toHaveLength(0);
    expect(() => validateDoc(after)).not.toThrow();
  });

  it('leaves the document alone for a no-op or unknown merge', () => {
    const before = doc();
    expect(mergeCategories(before, 'rent', 'rent')).toBe(before);
    expect(mergeCategories(before, 'nope', 'mortgage')).toBe(before);
  });
});

describe('edits flow through to the derived totals', () => {
  it('recomputes the summary without storing anything', () => {
    const before = yearTotals(doc().years['2025']);
    // 2000 x 12 income, informational reimbursement excluded.
    expect(before.income).toBe(24_000);
    // preIncome RRSP counts in assets...
    expect(before.assets).toBe(1_200);
    // ...but is not subtracted from left-over: 24000 - 9600 debt = 14400.
    expect(before.leftOver).toBe(14_400);

    const after = yearTotals(setMonthValue(doc(), '2025', 'mortgage', 0, 1_800).years['2025']);
    expect(after.debt).toBe(10_600);
    expect(after.leftOver).toBe(13_400);
  });
});
