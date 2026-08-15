import { type StorageAdapter, runningInTauri } from './adapter';

/**
 * Picks the storage implementation for the environment, once.
 *
 * The import is dynamic so each build only pulls in the adapter it can
 * actually use: a browser bundle never ships the Tauri plugins, and the
 * desktop bundle never ships the File System Access fallback.
 */
let cached: StorageAdapter | null = null;

export async function getStorage(): Promise<StorageAdapter> {
  if (cached) return cached;

  if (runningInTauri()) {
    const { TauriStorageAdapter } = await import('./tauriAdapter');
    cached = new TauriStorageAdapter();
  } else {
    const { FsaStorageAdapter } = await import('./fsaAdapter');
    cached = new FsaStorageAdapter();
  }
  return cached;
}
