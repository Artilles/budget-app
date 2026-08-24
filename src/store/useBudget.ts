import { create } from 'zustand';
import {
  type BudgetDoc,
  type Group,
  type Raise,
  type VestingEvent,
  createEmptyDoc,
} from '../model/schema';
import { migrate } from '../model/migrate';
import { type NewBudget, createStarterDoc } from '../model/starter';
import * as mutate from '../model/mutate';
import { PickerCancelledError } from '../storage/adapter';
import { getStorage } from '../storage';

const AUTOSAVE_DELAY_MS = 800;

export type BudgetStatus =
  | 'starting'
  | 'unsupported'
  | 'no-file'
  | 'needs-permission'
  | 'loading'
  | 'ready'
  | 'error';

interface BudgetState {
  status: BudgetStatus;
  error: string | null;
  doc: BudgetDoc | null;
  fileName: string | null;
  saving: boolean;
  lastSavedAt: number | null;

  /** Year currently being viewed, as a string key. Null before a doc loads. */
  selectedYear: string | null;
  view: AppView;

  init: () => Promise<void>;
  openExisting: () => Promise<void>;
  /**
   * Create a budget from the New Budget wizard: named, with starter categories
   * laid out in the current year, and the investment accounts given. Resolves
   * false when the save-location picker is dismissed, so the wizard can stay
   * open rather than closing on a cancel.
   */
  createFromWizard: (input: NewBudget) => Promise<boolean>;
  reconnect: () => Promise<void>;
  forget: () => Promise<void>;
  /** Replace the document and schedule an autosave. */
  setDoc: (doc: BudgetDoc) => void;
  saveNow: () => Promise<void>;
  /** True while an autosave is scheduled but has not run yet. */
  pendingSave: boolean;

  selectYear: (year: string) => void;
  setMonth: (categoryId: string, monthIndex: number, value: number | null) => void;
  fillAcross: (categoryId: string, fromIndex: number) => void;
  setJobTitle: (jobTitle: string) => void;

  // Structure. Every one of these acts on the selected year alone, except
  // renameCategory and mergeCategories which are category-level by design.
  addCategory: (name: string, group: Group) => void;
  removeCategory: (categoryId: string) => void;
  renameCategory: (categoryId: string, name: string) => void;
  moveLine: (categoryId: string, direction: -1 | 1) => void;
  /** Move a line to a position within its group, for drag reordering. */
  moveLineToIndex: (categoryId: string, toIndex: number) => void;
  setLineGroup: (categoryId: string, group: Group) => void;
  setLineFlag: (categoryId: string, flag: 'informational' | 'preIncome', value: boolean) => void;
  mergeCategories: (fromId: string, intoId: string) => void;

  createYear: (year: number, sourceYearKey: string | null, copyAmounts: boolean) => void;
  deleteYear: (yearKey: string) => void;
  setYearLocked: (yearKey: string, locked: boolean) => void;

  setAccountBalance: (month: string, accountId: string, value: number | null) => void;
  setManualContribution: (month: string, value: number | null) => void;
  addInvestmentAccount: (name: string) => void;
  renameInvestmentAccount: (id: string, name: string) => void;
  setInvestmentAccountType: (id: string, type: string) => void;
  moveInvestmentAccount: (id: string, toIndex: number) => void;
  removeInvestmentAccount: (id: string) => void;
  /** Fills only within `year`, the year the Investments page is showing. */
  fillInvestmentGaps: (year?: string) => void;

  addRaise: (raise: Omit<Raise, 'id'>) => void;
  updateRaise: (id: string, patch: Partial<Omit<Raise, 'id'>>) => void;
  removeRaise: (id: string) => void;
  addVestingEvent: (event: Omit<VestingEvent, 'id'>) => void;
  updateVestingEvent: (id: string, patch: Partial<Omit<VestingEvent, 'id'>>) => void;
  removeVestingEvent: (id: string) => void;

  setView: (view: AppView) => void;

  /** Year shown on the Investments page. Kept here so it survives navigation. */
  investmentYear: string | null;
  selectInvestmentYear: (year: string) => void;

  /** Which tool is open under the Tools section; null shows the index. */
  selectedTool: string | null;
  selectTool: (toolId: string | null) => void;
  setToolState: (toolId: string, patch: Record<string, unknown>) => void;

  /** Rename the budget. Never renames the file it is stored in. */
  setBudgetName: (name: string) => void;
}

export type AppView = 'year' | 'overview' | 'raises' | 'investments' | 'tools';

/** Prefer the current calendar year when it exists, else the most recent. */
function defaultYear(doc: BudgetDoc): string | null {
  const keys = Object.keys(doc.years).sort();
  if (!keys.length) return null;
  const thisYear = String(new Date().getFullYear());
  return keys.includes(thisYear) ? thisYear : keys[keys.length - 1];
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
/** Set when a change lands mid-save, so the newer state is not lost. */
let saveAgain = false;

/**
 * Offer the budget's name as the file name, so the two line up by default
 * without ever being tied together — the user can save it as anything.
 */
function suggestedFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'budget'}.json`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useBudget = create<BudgetState>((set, get) => ({
  status: 'starting',
  error: null,
  doc: null,
  fileName: null,
  saving: false,
  lastSavedAt: null,
  pendingSave: false,
  selectedYear: null,
  // Overview leads the nav, so it is also where the app opens.
  view: 'overview',
  investmentYear: null,
  selectedTool: null,

  async init() {
    const storage = await getStorage();
    if (!storage.isSupported()) {
      set({
        status: 'unsupported',
        error:
          'This browser cannot open local files. Chrome or Edge is required, ' +
          'or use the desktop build.',
      });
      return;
    }

    const restored = await storage.restore();
    if (restored === 'none') {
      set({ status: 'no-file' });
      return;
    }
    if (restored === 'needs-permission') {
      set({ status: 'needs-permission', fileName: storage.fileName });
      return;
    }
    await readIntoStore(set);
  },

  async openExisting() {
    // Flush to the file we are leaving. Without this a pending autosave could
    // fire after the handle has moved and write the old document into the new
    // file.
    if (get().pendingSave) await get().saveNow();
    try {
      await (await getStorage()).openExisting();
    } catch (err) {
      if (err instanceof PickerCancelledError) return;
      set({ status: 'error', error: describe(err) });
      return;
    }
    await readIntoStore(set);
  },

  async createFromWizard(input) {
    if (get().pendingSave) await get().saveNow();
    const storage = await getStorage();
    try {
      await storage.createNew(suggestedFileName(input.name));
    } catch (err) {
      if (err instanceof PickerCancelledError) return false;
      set({ status: 'error', error: describe(err) });
      return false;
    }

    const doc = createStarterDoc(input);
    set({
      status: 'ready',
      doc,
      error: null,
      fileName: storage.fileName,
      selectedYear: defaultYear(doc),
    });
    await get().saveNow();
    return true;
  },

  async reconnect() {
    const granted = await (await getStorage()).reconnect();
    if (!granted) return;
    await readIntoStore(set);
  },

  async forget() {
    if (get().pendingSave) await get().saveNow();
    await (await getStorage()).forget();
    set({ status: 'no-file', doc: null, fileName: null, error: null, lastSavedAt: null });
  },

  setDoc(doc) {
    set({ doc, pendingSave: true });
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_DELAY_MS);
  },

  async saveNow() {
    const { doc, saving } = get();
    if (!doc) return;
    if (saving) {
      saveAgain = true;
      return;
    }
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    set({ saving: true, pendingSave: false });
    try {
      await (await getStorage()).save(doc);
      set({ saving: false, lastSavedAt: Date.now(), error: null });
    } catch (err) {
      set({ saving: false, error: describe(err) });
      return;
    }

    if (saveAgain) {
      saveAgain = false;
      await get().saveNow();
    }
  },

  selectYear(year) {
    if (get().doc?.years[year]) set({ selectedYear: year });
  },

  setMonth(categoryId, monthIndex, value) {
    const { doc, selectedYear, setDoc } = get();
    if (!doc || !selectedYear) return;
    setDoc(mutate.setMonthValue(doc, selectedYear, categoryId, monthIndex, value));
  },

  fillAcross(categoryId, fromIndex) {
    const { doc, selectedYear, setDoc } = get();
    if (!doc || !selectedYear) return;
    setDoc(mutate.fillAcross(doc, selectedYear, categoryId, fromIndex));
  },

  setJobTitle(jobTitle) {
    const { doc, selectedYear, setDoc } = get();
    if (!doc || !selectedYear) return;
    setDoc(mutate.setYearJobTitle(doc, selectedYear, jobTitle));
  },

  addCategory(name, group) {
    inYear((doc, key) => mutate.addCategoryToYear(doc, key, name, group));
  },

  removeCategory(categoryId) {
    inYear((doc, key) => mutate.removeCategoryFromYear(doc, key, categoryId));
  },

  moveLine(categoryId, direction) {
    inYear((doc, key) => mutate.moveLine(doc, key, categoryId, direction));
  },

  moveLineToIndex(categoryId, toIndex) {
    inYear((doc, key) => mutate.moveLineToIndex(doc, key, categoryId, toIndex));
  },

  setLineGroup(categoryId, group) {
    inYear((doc, key) => mutate.setLineGroup(doc, key, categoryId, group));
  },

  setLineFlag(categoryId, flag, value) {
    inYear((doc, key) => mutate.setLineFlag(doc, key, categoryId, flag, value));
  },

  renameCategory(categoryId, name) {
    const { doc, setDoc } = get();
    if (doc) setDoc(mutate.renameCategory(doc, categoryId, name));
  },

  mergeCategories(fromId, intoId) {
    const { doc, setDoc } = get();
    if (doc) setDoc(mutate.mergeCategories(doc, fromId, intoId));
  },

  createYear(year, sourceYearKey, copyAmounts) {
    const { doc, setDoc } = get();
    if (!doc) return;
    const next = mutate.createYear(doc, year, sourceYearKey, copyAmounts);
    if (next === doc) return;
    setDoc(next);
    set({ selectedYear: String(year) });
  },

  deleteYear(yearKey) {
    const { doc, setDoc, selectedYear } = get();
    if (!doc) return;
    const next = mutate.deleteYear(doc, yearKey);
    if (next === doc) return;
    setDoc(next);
    if (selectedYear === yearKey) set({ selectedYear: defaultYear(next) });
  },

  setView(view) {
    set({ view });
  },

  setYearLocked(yearKey, locked) {
    const { doc, setDoc } = get();
    if (!doc) return;
    const next = mutate.setYearLocked(doc, yearKey, locked);
    if (next === doc) return;
    setDoc(next);
    // Locking is deliberate and infrequent, and the whole point is that it
    // sticks — so it does not wait out the autosave debounce.
    void get().saveNow();
  },

  setAccountBalance(month, accountId, value) {
    onDoc((doc) => mutate.setAccountBalance(doc, month, accountId, value));
  },
  setManualContribution(month, value) {
    onDoc((doc) => mutate.setManualContribution(doc, month, value));
  },
  addInvestmentAccount(name) {
    onDoc((doc) => mutate.addInvestmentAccount(doc, name));
  },
  renameInvestmentAccount(id, name) {
    onDoc((doc) => mutate.renameInvestmentAccount(doc, id, name));
  },
  setInvestmentAccountType(id, type) {
    onDoc((doc) => mutate.setInvestmentAccountType(doc, id, type));
  },
  moveInvestmentAccount(id, toIndex) {
    onDoc((doc) => mutate.moveInvestmentAccount(doc, id, toIndex));
  },
  removeInvestmentAccount(id) {
    onDoc((doc) => mutate.removeInvestmentAccount(doc, id));
  },
  fillInvestmentGaps(year) {
    onDoc((doc) => mutate.fillInvestmentGaps(doc, new Date(), year));
  },

  addRaise(raise) {
    onDoc((doc) => mutate.addRaise(doc, raise));
  },
  updateRaise(id, patch) {
    onDoc((doc) => mutate.updateRaise(doc, id, patch));
  },
  removeRaise(id) {
    onDoc((doc) => mutate.removeRaise(doc, id));
  },
  addVestingEvent(event) {
    onDoc((doc) => mutate.addVestingEvent(doc, event));
  },
  updateVestingEvent(id, patch) {
    onDoc((doc) => mutate.updateVestingEvent(doc, id, patch));
  },
  removeVestingEvent(id) {
    onDoc((doc) => mutate.removeVestingEvent(doc, id));
  },

  selectInvestmentYear(year) {
    set({ investmentYear: year });
  },

  selectTool(toolId) {
    set({ selectedTool: toolId });
  },

  setToolState(toolId, patch) {
    const { doc, setDoc } = get();
    if (doc) setDoc(mutate.setToolState(doc, toolId, patch));
  },

  setBudgetName(name) {
    const { doc, setDoc } = get();
    if (doc) setDoc(mutate.setBudgetName(doc, name));
  },
}));

/** Apply a mutation to the whole document. */
function onDoc(fn: (doc: BudgetDoc) => BudgetDoc): void {
  const { doc, setDoc } = useBudget.getState();
  if (doc) setDoc(fn(doc));
}

/** Apply a mutation to the selected year, or do nothing when none is selected. */
function inYear(fn: (doc: BudgetDoc, yearKey: string) => BudgetDoc): void {
  const { doc, selectedYear, setDoc } = useBudget.getState();
  if (!doc || !selectedYear) return;
  setDoc(fn(doc, selectedYear));
}

// Dev-only handle for inspecting and driving the store from the console, which
// is the only way to exercise the app without walking through the OS file
// picker. Stripped from production builds by the DEV guard.
if (import.meta.env.DEV) {
  (globalThis as unknown as { __budget?: typeof useBudget }).__budget = useBudget;
}

/**
 * Read, migrate, validate. On failure the document is left null so autosave
 * cannot fire — a file we failed to understand must never be written over.
 */
async function readIntoStore(set: (partial: Partial<BudgetState>) => void): Promise<void> {
  const storage = await getStorage();
  set({ status: 'loading', error: null, fileName: storage.fileName });
  try {
    const raw = await storage.load();
    const doc = raw === null ? createEmptyDoc() : migrate(raw);
    set({
      status: 'ready',
      doc,
      error: null,
      lastSavedAt: null,
      selectedYear: defaultYear(doc),
    });
  } catch (err) {
    set({ status: 'error', error: describe(err), doc: null });
  }
}
