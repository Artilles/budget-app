import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  ExportOverBudgetError,
  NoFileConnectedError,
  PickerCancelledError,
  runningInTauri,
  type StorageAdapter,
} from './adapter';

/**
 * Desktop implementation of the same interface the browser build uses.
 *
 * Access works like the browser's: the app may only touch files the user has
 * picked in a dialog. The shell remembers those grants across restarts, so
 * `restore()` only returns 'needs-permission' for a path with no grant, such as
 * one remembered before grants were persisted; `reconnect()` re-picks it.
 *
 * Saves go through the shell's `write_budget_file` command, which writes a
 * sibling temp file and renames it over the target — atomic on the same
 * volume, so a crash mid-write leaves the original budget intact. It is native
 * because the temp file was never picked, so the fs plugin would refuse it.
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
    // A missing file resolves false and is reported on load; only a path the
    // shell refuses to look at throws.
    try {
      await exists(path);
    } catch {
      return 'needs-permission';
    }
    return 'ready';
  }

  async reconnect(): Promise<boolean> {
    if (!this.#path) return false;
    const picked = await openDialog({
      multiple: false,
      directory: false,
      defaultPath: this.#path,
      filters: FILE_FILTER,
    });
    if (typeof picked !== 'string') return false;
    await this.#remember(picked);
    return true;
  }

  async forget(): Promise<void> {
    this.#path = null;
    await idbDel(PATH_KEY);
  }

  async readText(): Promise<string> {
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

    return readTextFile(path);
  }

  async writeText(text: string): Promise<void> {
    await invoke('write_budget_file', { path: this.#require(), contents: text });
  }

  async exportCopy(text: string, suggestedName: string): Promise<string> {
    const current = this.#require();
    const picked = await saveDialog({ defaultPath: suggestedName, filters: FILE_FILTER });
    if (typeof picked !== 'string') throw new PickerCancelledError();
    // Case-folded because Windows paths are case-insensitive; on other systems
    // this only ever over-refuses a name differing from the budget by case.
    const same = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    if (same(picked) === same(current)) throw new ExportOverBudgetError();
    await writeTextFile(picked, text);
    return picked.split(/[\\/]/).pop() || picked;
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
