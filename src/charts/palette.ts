import { useEffect, useState } from 'react';
import type { Group } from '../model/schema';

/**
 * Chart colours, validated rather than chosen by eye.
 *
 * Both sets were run through the palette validator against this app's own chart
 * surfaces (#ffffff light, #1e1e23 dark) as a 4-slot categorical palette:
 * lightness band, chroma floor, adjacent-pair CVD separation, normal-vision
 * floor and contrast all pass. Light mode reports a contrast WARN on aqua
 * (2.82:1) and yellow (2.17:1), which obliges visible relief — hence the always-
 * present legend, the direct labels on the donut, and the fact that the grid
 * directly above every chart is the same numbers as a table.
 *
 * Slot order is the colourblind-safety mechanism, not decoration. Do not
 * reorder or extend these without re-running the validator.
 */
/**
 * Eight categorical slots. The first four cover every group-shaped chart; all
 * eight are used by the per-account investment stack, and validate together on
 * the adjacent pairlist (the ordering is the colourblind-safety mechanism, so
 * it must not be reordered or extended without re-running the validator).
 */
export type SeriesColors = [string, string, string, string, string, string, string, string];

export interface ChartTheme {
  mode: 'light' | 'dark';
  series: SeriesColors;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  gridline: string;
  axis: string;
  negative: string;
}

const LIGHT: ChartTheme = {
  mode: 'light',
  series: [
    '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
    '#e87ba4', '#008300', '#4a3aa7', '#e34948',
  ],
  surface: '#ffffff',
  textPrimary: '#1c1c1a',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  axis: '#c3c2b7',
  negative: '#a33329',
};

const DARK: ChartTheme = {
  mode: 'dark',
  series: [
    '#3987e5', '#d95926', '#199e70', '#c98500',
    '#d55181', '#008300', '#9085e9', '#e66767',
  ],
  surface: '#1e1e23',
  textPrimary: '#e8e8e4',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  axis: '#383835',
  negative: '#e0736a',
};

/**
 * The colour each budget group wears, everywhere it appears.
 *
 * These match the year chart's stacking exactly, so a group looks the same in
 * the grid as it does in the chart above it. Income has no band in that chart —
 * it is the dashed take-home reference line — so it takes the same neutral ink
 * rather than borrowing a spending colour it would be confused with.
 */
export function groupColor(group: Group, theme: ChartTheme): string {
  switch (group) {
    case 'costOfLiving':
      return theme.series[0];
    case 'debt':
      return theme.series[1];
    case 'assets':
      return theme.series[2];
    // Slot 3 is the derived left-over row, so this takes the next validated
    // slot rather than reusing one and colliding with it.
    case 'discretionary':
      return theme.series[4];
    case 'income':
      return theme.textSecondary;
  }
}

/** The colour of the derived Left Over row. */
export function leftOverColor(theme: ChartTheme): string {
  return theme.series[3];
}

/**
 * The colour an account type wears in the grid.
 *
 * Drawn from the same eight validated slots rather than a new palette, so the
 * page stays one colour system — and so a type badge can never collide with a
 * chart series in a way the validator has not already checked.
 *
 * `ACCOUNT_TYPES` is eight long precisely so the known types map one-to-one
 * onto the slots. The type is free text, though, so anything unrecognised is
 * hashed into a slot: stable across sessions and machines, because it depends
 * only on the string.
 */
export function accountTypeColor(type: string, theme: ChartTheme): string {
  const key = type.trim().toLowerCase();
  const known = KNOWN_TYPE_SLOTS[key];
  if (known !== undefined) return theme.series[known];

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return theme.series[hash % theme.series.length];
}

const KNOWN_TYPE_SLOTS: Record<string, number> = {
  rrsp: 0,
  'non-registered': 1,
  tfsa: 2,
  fhsa: 3,
  resp: 4,
  pension: 5,
  rrif: 6,
  lira: 7,
};

const DARK_INK = '#141413';
const LIGHT_INK = '#ffffff';

function rgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

function hex(channels: [number, number, number]): string {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance. */
function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white ink for text sitting on `fill`, whichever is more legible.
 *
 * The eight slots span too wide a lightness band for one ink to work on all of
 * them, so this is decided per swatch rather than fixed.
 */
export function readableInk(fill: string): string {
  return contrastRatio(fill, DARK_INK) >= contrastRatio(fill, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/** Blend `color` toward `target` by `t` (0 = unchanged, 1 = fully target). */
function mix(color: string, target: [number, number, number], t: number): string {
  const c = rgb(color);
  return hex([0, 1, 2].map((i) => c[i] + (target[i] - c[i]) * t) as [number, number, number]);
}

/**
 * Fill and ink for an account-type badge, guaranteed to clear WCAG AA (4.5:1)
 * for small text.
 *
 * Some series colours cannot host small text at AA in either ink — #2a78d6
 * peaks at 4.42:1 against white — so where the raw swatch falls short its
 * lightness is nudged in whichever direction the chosen ink needs, in small
 * steps, stopping the moment it passes. Hue is untouched, so the badge still
 * reads as the same category colour as the charts; only its depth shifts, and
 * only for the swatches that need it.
 */
export function badgeColors(fill: string): { background: string; color: string } {
  const color = readableInk(fill);
  if (contrastRatio(fill, color) >= 4.5) return { background: fill, color };

  const toward: [number, number, number] = color === LIGHT_INK ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const background = mix(fill, toward, t);
    if (contrastRatio(background, color) >= 4.5) return { background, color };
  }
  // Unreachable: full black against white ink is 21:1.
  return { background: color === LIGHT_INK ? '#000000' : '#ffffff', color };
}

function currentMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const stamped = document.documentElement.dataset.theme;
  if (stamped === 'dark') return 'dark';
  if (stamped === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Follows both theme sources the stylesheet honours: the OS preference and an
 * explicit `data-theme` stamp. Charts have to re-render on a change because
 * their colours are baked into the ECharts option, not inherited from CSS.
 */
export function useChartTheme(): ChartTheme {
  const [mode, setMode] = useState<'light' | 'dark'>(currentMode);

  useEffect(() => {
    const sync = () => setMode(currentMode());

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      media.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return mode === 'dark' ? DARK : LIGHT;
}

/**
 * Mirror the group colours into CSS custom properties.
 *
 * The grid tints its rows by group, and those tints have to be the same colours
 * the charts use. Publishing them from here rather than restating the hexes in
 * the stylesheet means the validated palette stays the single source — a change
 * to one cannot drift from the other.
 */
export function usePublishGroupColors(theme: ChartTheme): void {
  useEffect(() => {
    const root = document.documentElement;
    const groups: Group[] = ['income', 'assets', 'debt', 'costOfLiving', 'discretionary'];
    for (const group of groups) {
      root.style.setProperty(`--group-${group}`, groupColor(group, theme));
    }
    root.style.setProperty('--group-leftOver', leftOverColor(theme));
  }, [theme]);
}
