import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  ExportOverBudgetError,
  NoFileConnectedError,
  PickerCancelledError,
  type StorageAdapter,
} from './adapter';

/**
 * IndexedDB holds the *file handle only* — never the budget data itself.
 * The data lives in the user's own file (typically in OneDrive), so clearing
 * browser storage costs at most a re-pick, never a loss of history.
 */
const HANDLE_KEY = 'budget:file-handle';

/** Keeps the OS picker anchored to the same folder between sessions. */
const PICKER_ID = 'budget-file';
/** Separate, so an export folder never becomes where the budget picker opens. */
const EXPORT_PICKER_ID = 'budget-export';

const FILE_TYPES: FilePickerAcceptType[] = [
  { description: 'Budget file', accept: { 'application/json': ['.json'] } },
];

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * createWritable() writes to a swap file and commits atomically on close, so
 * an interrupted save cannot truncate the existing file.
 */
async function writeTo(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } catch (err) {
    await writable.abort();
    throw err;
  }
  await writable.close();
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

  async readText(): Promise<string> {
    const file = await this.#require().getFile();
    return file.text();
  }

  async writeText(text: string): Promise<void> {
    await writeTo(this.#require(), text);
  }

  async exportCopy(text: string, suggestedName: string): Promise<string> {
    const current = this.#require();
    if (!window.showSaveFilePicker) throw new Error('This browser cannot create local files.');
    let target: FileSystemFileHandle;
    try {
      target = await window.showSaveFilePicker({ id: EXPORT_PICKER_ID, suggestedName, types: FILE_TYPES });
    } catch (err) {
      if (isAbort(err)) throw new PickerCancelledError();
      throw err;
    }
    if (await target.isSameEntry(current)) throw new ExportOverBudgetError();
    await writeTo(target, text);
    return target.name;
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
