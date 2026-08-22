import {
  type BudgetDoc,
  type Category,
  type Group,
  type InvestmentMonth,
  type Line,
  type Raise,
  type VestingEvent,
  type Year,
  MAX_BUDGET_NAME,
  emptyMonths,
  slugify,
} from './schema';

/**
 * Immutable updates over the document.
 *
 * These are plain functions rather than store methods so they can be tested
 * without React, and so the "only this year changes" guarantee is visible in
 * one place: every helper rebuilds exactly one year and shares every other year
 * by reference. A bug that leaked across years would show up as a shared object
 * being mutated, which these functions structurally cannot do.
 */

/**
 * Rebuild one year.
 *
 * A locked year is refused here, which is the single choke point every content
 * mutation passes through — so locking cannot be defeated by a code path that
 * forgot to check. `setYearLocked` deliberately bypasses this.
 */
export function updateYear(
  doc: BudgetDoc,
  yearKey: string,
  fn: (year: Year) => Year,
): BudgetDoc {
  const year = doc.years[yearKey];
  if (!year || year.locked) return doc;
  const next = fn(year);
  if (next === year) return doc;
  return { ...doc, years: { ...doc.years, [yearKey]: next } };
}

export function updateLine(
  year: Year,
  categoryId: string,
  fn: (line: Line) => Line,
): Year {
  let changed = false;
  const lines = year.lines.map((line) => {
    if (line.categoryId !== categoryId) return line;
    const next = fn(line);
    // Compare the result, not just the id: a no-op edit (tabbing through a cell
    // without changing it) must not rebuild the year, or it would re-render the
    // grid and trigger an autosave for nothing.
    if (next !== line) changed = true;
    return next;
  });
  return changed ? { ...year, lines } : year;
}

export function setMonthValue(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
  monthIndex: number,
  value: number | null,
): BudgetDoc {
  if (monthIndex < 0 || monthIndex > 11) return doc;
  return updateYear(doc, yearKey, (year) =>
    updateLine(year, categoryId, (line) => {
      if (line.months[monthIndex] === value) return line;
      const months = [...line.months];
      months[monthIndex] = value;
      return { ...line, months };
    }),
  );
}

/** Fill every remaining month of a line with the same amount, from `fromIndex` on. */
export function fillAcross(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
  fromIndex: number,
): BudgetDoc {
  return updateYear(doc, yearKey, (year) =>
    updateLine(year, categoryId, (line) => {
      const value = line.months[fromIndex] ?? null;
      const months = line.months.map((m, i) => (i > fromIndex ? value : m));
      return { ...line, months };
    }),
  );
}

/* Category structure ------------------------------------------------------- */

/**
 * Find or create a category id for a name.
 *
 * Reuses the existing category when the name matches (case-insensitively), so
 * re-adding "Gas" to a later year continues the same series rather than
 * starting a parallel one. A slug collision between genuinely different names
 * gets a numeric suffix.
 */
function resolveCategory(
  doc: BudgetDoc,
  name: string,
): { categories: Record<string, Category>; id: string } {
  const trimmed = name.trim();
  const existing = Object.values(doc.categories).find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return { categories: doc.categories, id: existing.id };

  const base = slugify(trimmed);
  let id = base;
  for (let n = 2; doc.categories[id]; n += 1) id = `${base}-${n}`;

  return {
    categories: { ...doc.categories, [id]: { id, name: trimmed } },
    id,
  };
}

/** Next order value, so a new line lands at the end of its group. */
function nextOrder(year: Year): number {
  return year.lines.reduce((max, l) => Math.max(max, l.order), -1) + 1;
}

/**
 * Add a category to one year. Existing years are untouched; a year created
 * later inherits whatever its source year looks like at that moment.
 */
export function addCategoryToYear(
  doc: BudgetDoc,
  yearKey: string,
  name: string,
  group: Group,
): BudgetDoc {
  const year = doc.years[yearKey];
  // Builds the year directly rather than through updateYear, so the lock is
  // re-checked here.
  if (!year || year.locked || !name.trim()) return doc;

  const { categories, id } = resolveCategory(doc, name);
  if (year.lines.some((l) => l.categoryId === id)) return doc; // already present

  const line: Line = { categoryId: id, group, order: nextOrder(year), months: emptyMonths() };
  return {
    ...doc,
    categories,
    years: { ...doc.years, [yearKey]: { ...year, lines: [...year.lines, line] } },
  };
}

/**
 * Remove a category from one year only.
 *
 * The category itself stays in the registry, because earlier years may still
 * reference it and must keep resolving. Other existing years are untouched by
 * construction — this rebuilds exactly one year.
 */
export function removeCategoryFromYear(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
): BudgetDoc {
  return updateYear(doc, yearKey, (year) => {
    const lines = year.lines.filter((l) => l.categoryId !== categoryId);
    return lines.length === year.lines.length ? year : { ...year, lines };
  });
}

/** Renaming is deliberately global: it is the same concept, spelled differently. */
export function renameCategory(doc: BudgetDoc, categoryId: string, name: string): BudgetDoc {
  const category = doc.categories[categoryId];
  const trimmed = name.trim();
  if (!category || !trimmed || category.name === trimmed) return doc;
  return {
    ...doc,
    categories: { ...doc.categories, [categoryId]: { ...category, name: trimmed } },
  };
}

/** Move a line up or down within its own group. */
export function moveLine(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
  direction: -1 | 1,
): BudgetDoc {
  return updateYear(doc, yearKey, (year) => {
    const line = year.lines.find((l) => l.categoryId === categoryId);
    if (!line) return year;

    const siblings = year.lines
      .filter((l) => l.group === line.group)
      .sort((a, b) => a.order - b.order);
    const index = siblings.indexOf(line);
    const swapWith = siblings[index + direction];
    if (!swapWith) return year;

    return {
      ...year,
      lines: year.lines.map((l) => {
        if (l === line) return { ...l, order: swapWith.order };
        if (l === swapWith) return { ...l, order: line.order };
        return l;
      }),
    };
  });
}

/** Change which group a line belongs to, in this year only. */
export function setLineGroup(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
  group: Group,
): BudgetDoc {
  return updateYear(doc, yearKey, (year) =>
    updateLine(year, categoryId, (line) =>
      line.group === group ? line : { ...line, group, order: nextOrder(year) },
    ),
  );
}

/** Toggle whether a line counts toward its group total or toward left-over. */
export function setLineFlag(
  doc: BudgetDoc,
  yearKey: string,
  categoryId: string,
  flag: 'informational' | 'preIncome',
  value: boolean,
): BudgetDoc {
  return updateYear(doc, yearKey, (year) =>
    updateLine(year, categoryId, (line) => {
      if (Boolean(line[flag]) === value) return line;
      const next = { ...line };
      if (value) next[flag] = true;
      else delete next[flag];
      return next;
    }),
  );
}

/* Years -------------------------------------------------------------------- */

/**
 * Create a year by copying another year's structure. This is what makes
 * "future years that aren't created yet" inherit the current shape: whatever
 * the source year looks like when you create from it is what you get.
 */
export function createYear(
  doc: BudgetDoc,
  year: number,
  sourceYearKey: string | null,
  copyAmounts = false,
): BudgetDoc {
  const key = String(year);
  if (doc.years[key]) return doc;

  const source = sourceYearKey ? doc.years[sourceYearKey] : undefined;
  const lines: Line[] = source
    ? source.lines.map((l) => ({ ...l, months: copyAmounts ? [...l.months] : emptyMonths() }))
    : [];

  const created: Year = { year, lines };
  if (source?.jobTitle) created.jobTitle = source.jobTitle;

  return { ...doc, years: { ...doc.years, [key]: created } };
}

/** Refused for a locked year: locking would be hollow if it did not stop deletion. */
export function deleteYear(doc: BudgetDoc, yearKey: string): BudgetDoc {
  const year = doc.years[yearKey];
  if (!year || year.locked) return doc;
  const years = { ...doc.years };
  delete years[yearKey];
  return { ...doc, years };
}

/** The one mutation a locked year accepts. */
export function setYearLocked(doc: BudgetDoc, yearKey: string, locked: boolean): BudgetDoc {
  const year = doc.years[yearKey];
  if (!year || Boolean(year.locked) === locked) return doc;

  const next = { ...year };
  if (locked) next.locked = true;
  else delete next.locked;

  return { ...doc, years: { ...doc.years, [yearKey]: next } };
}

/** Years that a merge would have to rewrite but cannot, because they are locked. */
export function lockedYearsAffectedByMerge(doc: BudgetDoc, fromId: string): string[] {
  return Object.keys(doc.years)
    .filter((key) => doc.years[key].locked)
    .filter((key) => doc.years[key].lines.some((l) => l.categoryId === fromId))
    .sort();
}

/* Merging ------------------------------------------------------------------ */

/** Years where both categories appear, so a merge would combine their amounts. */
export function mergeOverlap(doc: BudgetDoc, fromId: string, intoId: string): string[] {
  return Object.keys(doc.years)
    .filter((key) => {
      const ids = doc.years[key].lines.map((l) => l.categoryId);
      return ids.includes(fromId) && ids.includes(intoId);
    })
    .sort();
}

/**
 * Fold one category into another across every year, so a category that was
 * renamed over the years becomes a single unbroken series.
 *
 * Where a year contains both, the months are summed and the surviving line
 * keeps the target's position and flags. Callers should show `mergeOverlap`
 * first — summing is right for a rename, but it is not reversible.
 */
export function mergeCategories(doc: BudgetDoc, fromId: string, intoId: string): BudgetDoc {
  if (fromId === intoId || !doc.categories[fromId] || !doc.categories[intoId]) return doc;

  // All or nothing: applying to some years and skipping locked ones would leave
  // them pointing at a category the merge is about to delete.
  if (lockedYearsAffectedByMerge(doc, fromId).length) return doc;

  const years: Record<string, Year> = {};
  for (const [key, year] of Object.entries(doc.years)) {
    const source = year.lines.find((l) => l.categoryId === fromId);
    if (!source) {
      years[key] = year;
      continue;
    }

    const target = year.lines.find((l) => l.categoryId === intoId);
    const lines = year.lines
      .filter((l) => l.categoryId !== fromId)
      .map((l) => {
        if (l.categoryId !== intoId) return l;
        const months = l.months.map((m, i) => {
          const other = source.months[i];
          if (m === null && other === null) return null;
          return (m ?? 0) + (other ?? 0);
        });
        return { ...l, months };
      });

    // No target line in this year: the source simply takes the new id.
    years[key] = {
      ...year,
      lines: target ? lines : lines.concat({ ...source, categoryId: intoId }),
    };
  }

  // Nothing references the folded category any more, so it leaves the registry.
  const categories = { ...doc.categories };
  delete categories[fromId];

  return { ...doc, categories, years };
}

/* Investments --------------------------------------------------------------- */

/** Rebuild one investment month, dropping it entirely when it holds nothing. */
function updateInvestmentMonth(
  doc: BudgetDoc,
  month: string,
  fn: (entry: InvestmentMonth) => InvestmentMonth,
): BudgetDoc {
  const current = doc.investments.months[month] ?? { balances: {} };
  const next = fn(current);
  if (next === current) return doc;

  const months = { ...doc.investments.months };
  if (!Object.keys(next.balances).length && next.manualContribution === undefined) {
    delete months[month];
  } else {
    months[month] = next;
  }

  return { ...doc, investments: { ...doc.investments, months } };
}

/**
 * Record an account's end-of-month balance. Passing null clears the reading,
 * which is not the same as recording zero — a cleared month is treated as
 * "not measured" and carries the previous balance forward.
 */
export function setAccountBalance(
  doc: BudgetDoc,
  month: string,
  accountId: string,
  value: number | null,
  /**
   * Marks the value as interpolated rather than observed. Defaults to false, so
   * every ordinary edit clears the flag without callers having to remember —
   * "Fill gaps" is the only thing that passes true.
   */
  autofilled = false,
): BudgetDoc {
  if (!doc.investments.accounts.some((a) => a.id === accountId)) return doc;

  return updateInvestmentMonth(doc, month, (entry) => {
    const flagged = entry.autofilled ?? [];
    const wasFlagged = flagged.includes(accountId);

    if (value === null) {
      if (!(accountId in entry.balances)) return entry;
      const balances = { ...entry.balances };
      delete balances[accountId];
      return withFlags(entry, balances, flagged.filter((id) => id !== accountId));
    }

    if (!Number.isFinite(value)) return entry;

    // Retyping the same figure over an autofilled one is a real change: it
    // promotes an estimate to an observation, even though the number is equal.
    if (entry.balances[accountId] === value && wasFlagged === autofilled) return entry;

    const nextFlags = autofilled
      ? wasFlagged
        ? flagged
        : [...flagged, accountId]
      : flagged.filter((id) => id !== accountId);

    return withFlags(entry, { ...entry.balances, [accountId]: value }, nextFlags);
  });
}

/** Rebuild an entry, dropping `autofilled` entirely when nothing is flagged. */
function withFlags(
  entry: InvestmentMonth,
  balances: Record<string, number>,
  flags: string[],
): InvestmentMonth {
  const next: InvestmentMonth = { ...entry, balances };
  if (flags.length) next.autofilled = flags;
  else delete next.autofilled;
  return next;
}

/** A lump sum made outside the monthly budget. Null clears it. */
export function setManualContribution(
  doc: BudgetDoc,
  month: string,
  value: number | null,
): BudgetDoc {
  return updateInvestmentMonth(doc, month, (entry) => {
    if (value === null || value === 0) {
      if (entry.manualContribution === undefined) return entry;
      const next = { ...entry };
      delete next.manualContribution;
      return next;
    }
    if (!Number.isFinite(value) || entry.manualContribution === value) return entry;
    return { ...entry, manualContribution: value };
  });
}

/** Calendar months strictly between two "YYYY-MM" keys. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));

  for (;;) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key >= to) return out;
    out.push(key);
    if (out.length > 600) return out; // guard against a malformed key
  }
}

export interface GapFill {
  month: string;
  accountId: string;
  value: number;
}

/** The month containing `date`, as a "YYYY-MM" key, in local time. */
export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Balances that could be interpolated for months with no reading.
 *
 * Two limits keep this to estimating rather than inventing:
 *
 *  - Only gaps *between* two real readings qualify. A month after the last
 *    reading has nothing to interpolate towards, so it is left alone; the
 *    derived series holds the last value there instead, flagged as an estimate.
 *
 *  - Nothing at or after the current month is filled, even when a later reading
 *    exists. A balance entered ahead of time — a projection, or a year set up
 *    in advance — must not cause the months in between to be written as though
 *    they had happened. Once those months pass and get real readings, the gaps
 *    either side of them fill normally.
 *
 * Gaps span year boundaries: a reading early in the next year is a perfectly
 * good right-hand anchor for a gap at the end of this one.
 *
 * `year` limits which months are *written*, not which are used as anchors — a
 * December gap still interpolates towards a February reading, it just does not
 * offer to fill February. Filling is done from the year you are looking at, so
 * it should not quietly rewrite months in years you cannot see.
 */
export function investmentGapFills(
  doc: BudgetDoc,
  now = new Date(),
  year?: string,
): GapFill[] {
  const { accounts, months } = doc.investments;
  const keys = Object.keys(months).sort();
  const cutoff = currentMonthKey(now);
  const fills: GapFill[] = [];

  for (const account of accounts) {
    const known = keys
      .filter((k) => typeof months[k].balances[account.id] === 'number')
      .map((k) => ({ key: k, value: months[k].balances[account.id] }));

    for (let i = 0; i < known.length - 1; i += 1) {
      const from = known[i];
      const to = known[i + 1];
      const between = monthsBetween(from.key, to.key);
      if (!between.length) continue;

      // A single missing month lands halfway; two split it in thirds. The
      // step is taken across the whole gap, so filling only the past part of
      // a gap still places those months correctly on the line.
      const step = (to.value - from.value) / (between.length + 1);
      between.forEach((month, n) => {
        if (month >= cutoff) return;
        if (year !== undefined && !month.startsWith(`${year}-`)) return;
        fills.push({
          month,
          accountId: account.id,
          value: Math.round((from.value + step * (n + 1)) * 100) / 100,
        });
      });
    }
  }

  return fills;
}

/** Write every interpolated balance from `investmentGapFills`. */
export function fillInvestmentGaps(
  doc: BudgetDoc,
  now = new Date(),
  year?: string,
): BudgetDoc {
  let next = doc;
  for (const fill of investmentGapFills(doc, now, year)) {
    next = setAccountBalance(next, fill.month, fill.accountId, fill.value, true);
  }
  return next;
}

export function addInvestmentAccount(doc: BudgetDoc, name: string): BudgetDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;

  const base = slugify(trimmed);
  let id = `acct-${base}`;
  for (let n = 2; doc.investments.accounts.some((a) => a.id === id); n += 1) {
    id = `acct-${base}-${n}`;
  }

  return {
    ...doc,
    investments: {
      ...doc.investments,
      accounts: [...doc.investments.accounts, { id, name: trimmed }],
    },
  };
}

export function renameInvestmentAccount(doc: BudgetDoc, id: string, name: string): BudgetDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;

  let changed = false;
  const accounts = doc.investments.accounts.map((a) => {
    if (a.id !== id || a.name === trimmed) return a;
    changed = true;
    return { ...a, name: trimmed };
  });
  return changed ? { ...doc, investments: { ...doc.investments, accounts } } : doc;
}

/**
 * Set an account's type ("RRSP", "TFSA", …). Empty clears it.
 *
 * Free text rather than an enum, because the list of account types a person
 * might hold is open-ended and a wrong guess here would block a real account.
 */
export function setInvestmentAccountType(
  doc: BudgetDoc,
  id: string,
  type: string,
): BudgetDoc {
  const trimmed = type.trim();
  let changed = false;

  const accounts = doc.investments.accounts.map((a) => {
    if (a.id !== id || (a.type ?? '') === trimmed) return a;
    changed = true;
    const next = { ...a };
    if (trimmed) next.type = trimmed;
    else delete next.type;
    return next;
  });

  return changed ? { ...doc, investments: { ...doc.investments, accounts } } : doc;
}

/**
 * Move an account to a new position in the list.
 *
 * Column order in the grid is this array's order, so this is purely
 * presentational — no balance moves with it, since balances are keyed by
 * account id rather than by position.
 */
export function moveInvestmentAccount(doc: BudgetDoc, id: string, toIndex: number): BudgetDoc {
  const accounts = doc.investments.accounts;
  const from = accounts.findIndex((a) => a.id === id);
  if (from < 0) return doc;

  const to = Math.max(0, Math.min(accounts.length - 1, toIndex));
  if (to === from) return doc;

  const next = [...accounts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return { ...doc, investments: { ...doc.investments, accounts: next } };
}

/**
 * Remove an account and every balance recorded against it.
 *
 * Unlike a budget category — which stays in the registry so history keeps
 * resolving — an account's balances live only under its own id, so leaving the
 * id behind would preserve nothing. Callers should confirm first.
 */
export function removeInvestmentAccount(doc: BudgetDoc, id: string): BudgetDoc {
  if (!doc.investments.accounts.some((a) => a.id === id)) return doc;

  const months: Record<string, InvestmentMonth> = {};
  for (const [key, entry] of Object.entries(doc.investments.months)) {
    if (!(id in entry.balances)) {
      months[key] = entry;
      continue;
    }
    const balances = { ...entry.balances };
    delete balances[id];
    if (Object.keys(balances).length || entry.manualContribution !== undefined) {
      // The flag has to go with the balance: an autofilled id with no balance
      // beside it is exactly what validateDoc rejects on the next load.
      months[key] = withFlags(entry, balances, (entry.autofilled ?? []).filter((a) => a !== id));
    }
  }

  return {
    ...doc,
    investments: {
      accounts: doc.investments.accounts.filter((a) => a.id !== id),
      months,
    },
  };
}

/* Compensation -------------------------------------------------------------- */

/** Unique id for a new list entry, stable across a session. */
function newId(prefix: string, existing: { id: string }[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((e) => e.id));
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

/**
 * Patch one entry in an id-keyed list.
 *
 * A field set to undefined is deleted rather than stored as undefined, so
 * clearing an optional field leaves no trace in the JSON. Returns the original
 * array when nothing changed, so callers can keep the document identical.
 */
function patchById<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<Omit<T, 'id'>>,
): T[] {
  let changed = false;

  const next = items.map((item) => {
    if (item.id !== id) return item;

    const draft = { ...item } as unknown as Record<string, unknown>;
    let itemChanged = false;

    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      if (value === undefined) {
        if (key in draft) {
          delete draft[key];
          itemChanged = true;
        }
      } else if (draft[key] !== value) {
        draft[key] = value;
        itemChanged = true;
      }
    }

    if (!itemChanged) return item;
    changed = true;
    return draft as unknown as T;
  });

  return changed ? next : items;
}

export function addRaise(doc: BudgetDoc, raise: Omit<Raise, 'id'>): BudgetDoc {
  const entry: Raise = { ...raise, id: newId('raise', doc.raises) };
  return { ...doc, raises: [...doc.raises, entry] };
}

export function updateRaise(
  doc: BudgetDoc,
  id: string,
  patch: Partial<Omit<Raise, 'id'>>,
): BudgetDoc {
  const raises = patchById(doc.raises, id, patch);
  return raises === doc.raises ? doc : { ...doc, raises };
}

export function removeRaise(doc: BudgetDoc, id: string): BudgetDoc {
  const raises = doc.raises.filter((r) => r.id !== id);
  return raises.length === doc.raises.length ? doc : { ...doc, raises };
}

export function addVestingEvent(doc: BudgetDoc, event: Omit<VestingEvent, 'id'>): BudgetDoc {
  const entry: VestingEvent = { ...event, id: newId('vest', doc.vestingEvents) };
  return { ...doc, vestingEvents: [...doc.vestingEvents, entry] };
}

export function updateVestingEvent(
  doc: BudgetDoc,
  id: string,
  patch: Partial<Omit<VestingEvent, 'id'>>,
): BudgetDoc {
  const vestingEvents = patchById(doc.vestingEvents, id, patch);
  return vestingEvents === doc.vestingEvents ? doc : { ...doc, vestingEvents };
}

export function removeVestingEvent(doc: BudgetDoc, id: string): BudgetDoc {
  const vestingEvents = doc.vestingEvents.filter((e) => e.id !== id);
  return vestingEvents.length === doc.vestingEvents.length ? doc : { ...doc, vestingEvents };
}

/**
 * Merge a patch into one tool's saved inputs. Keys set to undefined are
 * removed, so a tool can clear a field without leaving a null behind.
 */
/**
 * Name the budget. Empty clears the name, falling back to the file name.
 *
 * Trimming and the length cap live here rather than in the input, so every
 * caller gets them — the UI's maxLength stops a person typing past the limit,
 * but says nothing about a pasted value or a future call site. Trimmed again
 * after truncating, since cutting at the limit can leave a trailing space.
 *
 * Note this never touches the file itself: the name is a label stored inside
 * the document, and renaming a budget deliberately does not rename, move, or
 * re-create the file the user chose.
 */
export function setBudgetName(doc: BudgetDoc, name: string): BudgetDoc {
  const trimmed = name.trim().slice(0, MAX_BUDGET_NAME).trim();
  if ((doc.name ?? '') === trimmed) return doc;

  const next = { ...doc };
  if (trimmed) next.name = trimmed;
  else delete next.name;
  return next;
}

export function setToolState(
  doc: BudgetDoc,
  toolId: string,
  patch: Record<string, unknown>,
): BudgetDoc {
  const current = doc.tools?.[toolId] ?? {};
  const next: Record<string, unknown> = { ...current };

  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    } else if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) return doc;

  return { ...doc, tools: { ...doc.tools, [toolId]: next } };
}

export function setYearJobTitle(doc: BudgetDoc, yearKey: string, jobTitle: string): BudgetDoc {
  return updateYear(doc, yearKey, (year) => {
    const trimmed = jobTitle.trim();
    if (trimmed) return { ...year, jobTitle: trimmed };
    const next = { ...year };
    delete next.jobTitle;
    return next;
  });
}
