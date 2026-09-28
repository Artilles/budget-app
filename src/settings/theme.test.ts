import { describe, expect, it } from 'vitest';
import { normalizePreference, stampFor, THEME_OPTIONS, type ThemePreference } from './theme';

describe('theme preference', () => {
  it('offers exactly the three modes, System first', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });

  it('keeps a recognised stored value', () => {
    for (const value of ['system', 'light', 'dark'] as const) {
      expect(normalizePreference(value)).toBe(value);
    }
  });

  it('falls back to following the OS for anything else', () => {
    // Nothing stored yet, and values an older or corrupted store might hold.
    expect(normalizePreference(null)).toBe('system');
    expect(normalizePreference(undefined)).toBe('system');
    expect(normalizePreference('')).toBe('system');
    expect(normalizePreference('Dark')).toBe('system');
    expect(normalizePreference('auto')).toBe('system');
  });

  it('stamps only an explicit choice, so the media query is left to decide otherwise', () => {
    expect(stampFor('light')).toBe('light');
    expect(stampFor('dark')).toBe('dark');
    expect(stampFor('system')).toBeNull();
  });

  it('stamps a value the stylesheet actually matches', () => {
    // The stylesheet keys off [data-theme='light'] and [data-theme='dark'];
    // a stamp is either one of those or absent.
    const stamps = (['system', 'light', 'dark'] as ThemePreference[]).map(stampFor);
    expect(stamps.every((s) => s === null || s === 'light' || s === 'dark')).toBe(true);
  });
});
