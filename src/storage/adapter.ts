/**
 * All persistence goes through this interface. Nothing above it may touch the
 * File System Access API, IndexedDB, or Tauri directly.
 *
 * The browser build implements it with the File System Access API; the Tauri
 * build implements it with plugin-fs. Keeping the surface this narrow is what
 * makes that swap a new file rather than a refactor.
 *
 * It deals in text, not documents: parsing and encryption happen once, above
 * it, instead of being duplicated in every implementation.
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

  /** Read the connected file's contents. Throws if no file is connected. */
  readText(): Promise<string>;

  /** Replace the connected file's contents atomically. Throws if no file is connected. */
  writeText(text: string): Promise<void>;

  /**
   * Prompt for a location and write `text` there, leaving the connected file
   * connected. Resolves with the chosen file's name. Requires a user gesture.
   */
  exportCopy(text: string, suggestedName: string): Promise<string>;
}

/** Refuses an export that would overwrite the budget it was exported from. */
export class ExportOverBudgetError extends Error {
  constructor() {
    super('That is the budget file itself. Choose a different name or folder for the copy.');
  }
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
