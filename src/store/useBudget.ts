import { create } from 'zustand';
import {
  type BudgetDoc,
  type Group,
  type Raise,
  type VestingEvent,
  createEmptyDoc,
  serializeDoc,
} from '../model/schema';
import { migrate } from '../model/migrate';
import { type NewBudget, createStarterDoc } from '../model/starter';
import * as mutate from '../model/mutate';
import { PickerCancelledError } from '../storage/adapter';
import { getStorage } from '../storage';
import {
  type CipherSession,
  type EncryptedEnvelope,
  WrongPassphraseError,
  createSession,
  isEncryptedEnvelope,
  seal,
  unseal,
} from '../storage/encryption';

const AUTOSAVE_DELAY_MS = 800;

export type BudgetStatus =
  | 'starting'
  | 'unsupported'
  | 'no-file'
  | 'needs-permission'
  | 'loading'
  /** The file is passphrase-protected and waiting for `unlock`. */
  | 'locked'
  | 'ready'
  | 'error';

interface BudgetState {
  status: BudgetStatus;
  error: string | null;
  doc: BudgetDoc | null;
  fileName: string | null;
  saving: boolean;
  lastSavedAt: number | null;
  /** True when the connected file is written encrypted. */
  encrypted: boolean;

  /** Year currently being viewed, as a string key. Null before a doc loads. */
  selectedYear: string | null;
  view: AppView;

  init: () => Promise<void>;
  openExisting: () => Promise<void>;
  /**
   * Create a budget from the New Budget wizard: named, with starter categories
   * laid out in the current year, and the investment accounts given. Resolves
   * false when the save-location picker is dismissed, so the wizard can stay
   * open rather than closing on a cancel. With a passphrase, the file is
   * encrypted from its very first write.
   */
  createFromWizard: (input: NewBudget, passphrase?: string) => Promise<boolean>;
  /** Resolves false on a wrong passphrase; other failures move to 'error'. */
  unlock: (passphrase: string) => Promise<boolean>;
  /** Encrypt the connected file from now on. Throws if the write fails. */
  enableProtection: (passphrase: string) => Promise<void>;
  /**
   * Write a readable copy somewhere the user picks. Resolves with its file
   * name, or null when the picker is dismissed.
   */
  exportUnencrypted: () => Promise<string | null>;
  reconnect: () => Promise<void>;
  forget: () => Promise<void>;
  /** Replace the document and schedule an autosave. */
  setDoc: (doc: BudgetDoc) => void;
  /** Resolves once the document on screen, as of this call, is on disk (or failed). */
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
/** The running save loop, so later callers can wait for it instead of racing it. */
let inFlight: Promise<void> | null = null;

/**
 * The derived key for an encrypted file. Deliberately outside the store: it is
 * not UI state, and keeping it out means it never shows up in a state dump.
 */
let session: CipherSession | null = null;
/** An encrypted file read but not yet unlocked. */
let lockedEnvelope: EncryptedEnvelope | null = null;

/** Name for an exported copy that says plainly what it is. */
function exportFileName(fileName: string | null): string {
  const base = (fileName ?? 'budget').replace(/\.json$/i, '');
  return `${base}-unencrypted.json`;
}

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
  encrypted: false,
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

  async createFromWizard(input, passphrase) {
    if (get().pendingSave) await get().saveNow();
    const storage = await getStorage();
    try {
      await storage.createNew(suggestedFileName(input.name));
    } catch (err) {
      if (err instanceof PickerCancelledError) return false;
      set({ status: 'error', error: describe(err) });
      return false;
    }

    // Before the first save, so the new file never exists unencrypted.
    session = passphrase ? await createSession(passphrase) : null;
    lockedEnvelope = null;
    const doc = createStarterDoc(input);
    set({
      status: 'ready',
      doc,
      error: null,
      fileName: storage.fileName,
      encrypted: session !== null,
      selectedYear: defaultYear(doc),
    });
    await get().saveNow();
    return true;
  },

  async unlock(passphrase) {
    if (!lockedEnvelope) return false;
    let plaintext: string;
    try {
      ({ plaintext, session } = await unseal(lockedEnvelope, passphrase));
    } catch (err) {
      if (err instanceof WrongPassphraseError) return false;
      set({ status: 'error', error: describe(err) });
      return true;
    }
    lockedEnvelope = null;
    try {
      applyLoaded(set, parseJson(plaintext, get().fileName), true);
    } catch (err) {
      session = null;
      set({ status: 'error', error: describe(err), doc: null });
    }
    return true;
  },

  async enableProtection(passphrase) {
    const next = await createSession(passphrase);
    session = next;
    // Waits out any save already running, then writes again under the new key,
    // so a plaintext write cannot land after the encrypted one.
    saveAgain = true;
    await get().saveNow();
    const { error } = get();
    if (error) {
      // The atomic write failed, so the file on disk is still the plaintext one.
      if (session === next) session = null;
      throw new Error(error);
    }
    set({ encrypted: true });
  },

  async exportUnencrypted() {
    const { doc, fileName } = get();
    if (!doc) return null;
    try {
      return await (await getStorage()).exportCopy(serializeDoc(doc), exportFileName(fileName));
    } catch (err) {
      if (err instanceof PickerCancelledError) return null;
      throw err;
    }
  },

  async reconnect() {
    const granted = await (await getStorage()).reconnect();
    if (!granted) return;
    await readIntoStore(set);
  },

  async forget() {
    if (get().pendingSave) await get().saveNow();
    await (await getStorage()).forget();
    session = null;
    lockedEnvelope = null;
    set({
      status: 'no-file',
      doc: null,
      fileName: null,
      error: null,
      lastSavedAt: null,
      encrypted: false,
    });
  },

  setDoc(doc) {
    set({ doc, pendingSave: true });
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_DELAY_MS);
  },

  saveNow() {
    if (inFlight) {
      saveAgain = true;
      return inFlight;
    }
    if (!get().doc) return Promise.resolve();
    inFlight = (async () => {
      try {
        do {
          saveAgain = false;
          const { doc } = get();
          if (!doc) return;
          if (autosaveTimer) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
          }

          set({ saving: true, pendingSave: false });
          try {
            const json = serializeDoc(doc);
            await (await getStorage()).writeText(session ? await seal(session, json) : json);
            set({ saving: false, lastSavedAt: Date.now(), error: null });
          } catch (err) {
            set({ saving: false, error: describe(err) });
            return;
          }
        } while (saveAgain);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
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

type SetState = (partial: Partial<BudgetState>) => void;

/**
 * Read, then either lock (encrypted) or parse, migrate, and validate. The
 * document stays null until a file is fully understood, so autosave cannot
 * fire — a file we failed to understand must never be written over, and the
 * previous file's document must never be written into this one.
 */
async function readIntoStore(set: SetState): Promise<void> {
  const storage = await getStorage();
  session = null;
  lockedEnvelope = null;
  set({ status: 'loading', error: null, doc: null, encrypted: false, fileName: storage.fileName });
  try {
    const text = await storage.readText();
    const raw = text.trim() ? parseJson(text, storage.fileName) : null;
    if (isEncryptedEnvelope(raw)) {
      lockedEnvelope = raw;
      set({ status: 'locked' });
      return;
    }
    applyLoaded(set, raw, false);
  } catch (err) {
    set({ status: 'error', error: describe(err), doc: null });
  }
}

/** Migrate and show a parsed budget; null means an empty file. Throws if it is not a budget. */
function applyLoaded(set: SetState, raw: unknown, encrypted: boolean): void {
  const doc = raw === null ? createEmptyDoc() : migrate(raw);
  set({
    status: 'ready',
    doc,
    error: null,
    encrypted,
    lastSavedAt: null,
    selectedYear: defaultYear(doc),
  });
}

function parseJson(text: string, fileName: string | null): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `"${fileName}" is not valid JSON and was not opened, so it has not been modified. ` +
        `(${(err as Error).message})`,
      { cause: err },
    );
  }
}
