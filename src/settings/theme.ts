import { useSyncExternalStore } from 'react';
import { runningInTauri } from '../storage/adapter';

/**
 * Whether the app renders light or dark.
 *
 * Deliberately not part of the budget document. Which theme a screen shows is a
 * property of the machine looking at it, not of the budget — copying the file to
 * another computer should not drag one machine's appearance along with it. So it
 * lives in localStorage, read synchronously before the first paint.
 *
 * 'system' stores no `data-theme` stamp at all, leaving the stylesheet's
 * `prefers-color-scheme` block to decide. That means a change to the OS setting
 * takes effect on its own, with nothing here listening for it.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const KEY = 'budget:theme';

/** Anything unrecognised — absent, misspelt, or written by an older build — follows the OS. */
export function normalizePreference(stored: string | null | undefined): ThemePreference {
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

/** The `data-theme` value for a preference, or null to leave the attribute off. */
export function stampFor(preference: ThemePreference): 'light' | 'dark' | null {
  return preference === 'system' ? null : preference;
}

function read(): ThemePreference {
  try {
    return normalizePreference(localStorage.getItem(KEY));
  } catch {
    // A locked-down profile or private window: follow the OS rather than fail.
    return 'system';
  }
}

function applyTheme(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const stamp = stampFor(preference);
  if (stamp) document.documentElement.dataset.theme = stamp;
  else delete document.documentElement.dataset.theme;
  syncWindowTheme(preference);
}

/**
 * Keep the desktop window's own chrome in step with the page.
 *
 * The title bar is drawn by Windows, not by the webview, so without this a
 * budget pinned to Light on a dark machine gets a dark title bar above a light
 * app. Loaded on demand so the browser build never pulls the shell API in, and
 * best-effort: a window that refuses must not stop the page theme changing.
 */
function syncWindowTheme(preference: ThemePreference): void {
  if (!runningInTauri()) return;
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(stampFor(preference)))
    .catch(() => {});
}

// A hand-rolled store rather than state in a component: the preference is read
// once before React mounts, and every reader has to see the same value.
const listeners = new Set<() => void>();
let current: ThemePreference | null = null;

function snapshot(): ThemePreference {
  current ??= read();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemePreference(next: ThemePreference): void {
  if (snapshot() === next) return;
  current = next;
  applyTheme(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Unwritable storage costs the preference on the next start, nothing more.
  }
  for (const listener of listeners) listener();
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, snapshot, () => 'system');
}

/**
 * Stamp the stored preference on the document. Called before the first render,
 * so the app never paints one theme and then swaps to the other.
 */
export function initTheme(): void {
  applyTheme(snapshot());
}
