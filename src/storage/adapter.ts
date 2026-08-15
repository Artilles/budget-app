import type { BudgetDoc } from '../model/schema';

/**
 * All persistence goes through this interface. Nothing above it may touch the
 * File System Access API, IndexedDB, or Tauri directly.
 *
 * The browser build implements it with the File System Access API; the eventual
 * Tauri build implements it with plugin-fs. Keeping the surface this narrow is
 * what makes that swap a new file rather than a refactor.
 */
export interface StorageAdapter {
  /** False when the environment cannot support this adapter (e.g. Firefox). */
  isSupported(): boolean;

  /** The connected file's name, or null when nothing is connected. */
  readonly fileName: string | null;

  /** Prompt for an existing budget file. Requires a user gesture. */
  openExisting(): Promise<void>;

  /** Prompt for a location for a new budget file. Requires a user gesture. */
  createNew(suggestedName?: string): Promise<void>;

  /**
   * Silently reconnect to the last used file.
   * Resolves 'ready' when usable, 'needs-permission' when the file is
   * remembered but the user must re-grant access, 'none' when there is nothing
   * to restore.
   */
  restore(): Promise<'ready' | 'needs-permission' | 'none'>;

  /** Re-request permission on a remembered file. Requires a user gesture. */
  reconnect(): Promise<boolean>;

  /** Forget the remembered file without deleting it. */
  forget(): Promise<void>;

  /** Read and parse. Throws if no file is connected. */
  load(): Promise<unknown>;

  /** Serialise and write atomically. Throws if no file is connected. */
  save(doc: BudgetDoc): Promise<void>;
}

export class NoFileConnectedError extends Error {
  constructor() {
    super('No budget file is connected.');
  }
}

/** Thrown when the user dismisses a file picker — not an error worth surfacing. */
export class PickerCancelledError extends Error {
  constructor() {
    super('File selection was cancelled.');
  }
}

/**
 * True when running inside the Tauri shell rather than a browser tab.
 *
 * Lives here, in the dependency-free interface module, so the picker can be
 * chosen without importing either implementation.
 */
export function runningInTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
