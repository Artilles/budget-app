import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { type BudgetDoc, serializeDoc } from '../model/schema';
import {
  NoFileConnectedError,
  PickerCancelledError,
  runningInTauri,
  type StorageAdapter,
} from './adapter';

/**
 * Desktop implementation of the same interface the browser build uses.
 *
 * Two differences from the browser adapter, both in our favour:
 *
 *  - The remembered value is a plain path, not an opaque handle, so there is no
 *    permission to re-request on startup. `restore()` never returns
 *    'needs-permission'.
 *  - Atomic writes have to be built by hand. The browser's `createWritable()`
 *    commits through a swap file for us; here we write a sibling temp file and
 *    rename it over the target, which is atomic on the same volume. A crash
 *    mid-write leaves the original budget intact.
 */
const PATH_KEY = 'budget:file-path';

const FILE_FILTER = [{ name: 'Budget file', extensions: ['json'] }];

export class TauriStorageAdapter implements StorageAdapter {
  #path: string | null = null;

  isSupported(): boolean {
    return runningInTauri();
  }

  get fileName(): string | null {
    if (!this.#path) return null;
    const parts = this.#path.split(/[\\/]/);
    return parts[parts.length - 1] || this.#path;
  }

  async openExisting(): Promise<void> {
    const picked = await openDialog({ multiple: false, directory: false, filters: FILE_FILTER });
    if (typeof picked !== 'string') throw new PickerCancelledError();
    await this.#remember(picked);
  }

  async createNew(suggestedName = 'budget.json'): Promise<void> {
    const picked = await saveDialog({ defaultPath: suggestedName, filters: FILE_FILTER });
    if (typeof picked !== 'string') throw new PickerCancelledError();
    await this.#remember(picked);
  }

  async restore(): Promise<'ready' | 'needs-permission' | 'none'> {
    const path = await idbGet<string>(PATH_KEY);
    if (!path) return 'none';
    this.#path = path;
    return 'ready';
  }

  async reconnect(): Promise<boolean> {
    // Nothing to re-grant: the path either reads or it does not.
    return this.#path !== null;
  }

  async forget(): Promise<void> {
    this.#path = null;
    await idbDel(PATH_KEY);
  }

  async load(): Promise<unknown> {
    const path = this.#require();

    // A remembered path is just a string, so the file it named may have been
    // moved, renamed, or deleted since. Say so plainly rather than letting a
    // raw OS error surface.
    if (!(await exists(path))) {
      throw new Error(
        `"${this.fileName}" is no longer at ${path}. It may have been moved or ` +
          `renamed — choose it again from its new location.`,
      );
    }

    const text = await readTextFile(path);
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(
        `"${this.fileName}" is not valid JSON and was not opened, so it has not been modified. ` +
          `(${(err as Error).message})`,
        { cause: err },
      );
    }
  }

  async save(doc: BudgetDoc): Promise<void> {
    const path = this.#require();
    const temp = `${path}.tmp`;

    await writeTextFile(temp, serializeDoc(doc));
    try {
      // Same directory, so this is a true atomic replace rather than a copy.
      await rename(temp, path);
    } catch (err) {
      // Leave no debris behind if the swap failed.
      await remove(temp).catch(() => undefined);
      throw err;
    }
  }

  async #remember(path: string): Promise<void> {
    this.#path = path;
    await idbSet(PATH_KEY, path);
  }

  #require(): string {
    if (!this.#path) throw new NoFileConnectedError();
    return this.#path;
  }
}
