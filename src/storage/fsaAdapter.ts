import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { type BudgetDoc, serializeDoc } from '../model/schema';
import { NoFileConnectedError, PickerCancelledError, type StorageAdapter } from './adapter';

/**
 * IndexedDB holds the *file handle only* — never the budget data itself.
 * The data lives in the user's own file (typically in OneDrive), so clearing
 * browser storage costs at most a re-pick, never a loss of history.
 */
const HANDLE_KEY = 'budget:file-handle';

/** Keeps the OS picker anchored to the same folder between sessions. */
const PICKER_ID = 'budget-file';

const FILE_TYPES: FilePickerAcceptType[] = [
  { description: 'Budget file', accept: { 'application/json': ['.json'] } },
];

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export class FsaStorageAdapter implements StorageAdapter {
  #handle: FileSystemFileHandle | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
  }

  get fileName(): string | null {
    return this.#handle?.name ?? null;
  }

  async openExisting(): Promise<void> {
    if (!window.showOpenFilePicker) throw new Error('This browser cannot open local files.');
    try {
      const [handle] = await window.showOpenFilePicker({
        id: PICKER_ID,
        multiple: false,
        types: FILE_TYPES,
      });
      await this.#remember(handle);
    } catch (err) {
      if (isAbort(err)) throw new PickerCancelledError();
      throw err;
    }
  }

  async createNew(suggestedName = 'budget.json'): Promise<void> {
    if (!window.showSaveFilePicker) throw new Error('This browser cannot create local files.');
    try {
      const handle = await window.showSaveFilePicker({
        id: PICKER_ID,
        suggestedName,
        types: FILE_TYPES,
      });
      await this.#remember(handle);
    } catch (err) {
      if (isAbort(err)) throw new PickerCancelledError();
      throw err;
    }
  }

  async restore(): Promise<'ready' | 'needs-permission' | 'none'> {
    const handle = await idbGet<FileSystemFileHandle>(HANDLE_KEY);
    if (!handle) return 'none';

    // queryPermission never prompts, so this is safe to call on page load.
    // Requesting permission needs a user gesture, which is why that lives in
    // reconnect() behind a button instead.
    const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (state === 'granted') {
      this.#handle = handle;
      return 'ready';
    }
    if (state === 'prompt') {
      this.#handle = handle;
      return 'needs-permission';
    }
    return 'none';
  }

  async reconnect(): Promise<boolean> {
    if (!this.#handle) return false;
    const state = (await this.#handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
    return state === 'granted';
  }

  async forget(): Promise<void> {
    this.#handle = null;
    await idbDel(HANDLE_KEY);
  }

  async load(): Promise<unknown> {
    const handle = this.#require();
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(
        `"${handle.name}" is not valid JSON and was not opened, so it has not been modified. ` +
          `(${(err as Error).message})`,
        { cause: err },
      );
    }
  }

  async save(doc: BudgetDoc): Promise<void> {
    const handle = this.#require();
    // createWritable() writes to a swap file and commits atomically on close,
    // so an interrupted save cannot truncate the existing file.
    const writable = await handle.createWritable();
    try {
      await writable.write(serializeDoc(doc));
    } catch (err) {
      await writable.abort();
      throw err;
    }
    await writable.close();
  }

  async #remember(handle: FileSystemFileHandle): Promise<void> {
    this.#handle = handle;
    await idbSet(HANDLE_KEY, handle);
  }

  #require(): FileSystemFileHandle {
    if (!this.#handle) throw new NoFileConnectedError();
    return this.#handle;
  }
}
