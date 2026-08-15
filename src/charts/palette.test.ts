import { describe, expect, it } from 'vitest';
import { ACCOUNT_TYPES } from '../model/schema';
import { accountTypeColor, badgeColors, readableInk } from './palette';

/**
 * The two themes, restated here rather than exported, so a change to the real
 * palette has to be made deliberately in both places to pass.
 */
const LIGHT_SERIES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];
const DARK_SERIES = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];

const theme = (series: string[]) =>
  ({ series } as unknown as Parameters<typeof accountTypeColor>[1]);

const light = theme(LIGHT_SERIES);
const dark = theme(DARK_SERIES);

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('account type colours', () => {
  it('gives each known type its own slot, with no two sharing', () => {
    const assigned = ACCOUNT_TYPES.map((t) => accountTypeColor(t, light));
    expect(new Set(assigned).size).toBe(ACCOUNT_TYPES.length);
  });

  it('is case- and whitespace-insensitive, so "tfsa" is not a new type', () => {
    expect(accountTypeColor('  tfsa ', light)).toBe(accountTypeColor('TFSA', light));
  });

  it('gives an unknown type a stable colour rather than a random one', () => {
    const once = accountTypeColor('Crypto Wallet', light);
    expect(accountTypeColor('Crypto Wallet', light)).toBe(once);
    expect(LIGHT_SERIES).toContain(once);
  });

  it('keeps a type on the same slot across themes', () => {
    ACCOUNT_TYPES.forEach((t) => {
      expect(DARK_SERIES.indexOf(accountTypeColor(t, dark))).toBe(
        LIGHT_SERIES.indexOf(accountTypeColor(t, light)),
      );
    });
  });

  it('never returns a colour outside the validated palette', () => {
    const inputs = [...ACCOUNT_TYPES, 'Crypto', '', 'x', 'Ünïcodé', '12345'];
    inputs.forEach((t) => expect(LIGHT_SERIES).toContain(accountTypeColor(t, light)));
  });
});

describe('badge legibility', () => {
  const ALL = [...LIGHT_SERIES, ...DARK_SERIES];

  /**
   * The badge carries small text on a series colour, so every one of the
   * sixteen swatches has to clear WCAG AA — not just the mid-tones.
   */
  it('clears 4.5:1 on every slot in both themes', () => {
    for (const hex of ALL) {
      const { background, color } = badgeColors(hex);
      const ratio = contrast(background, color);
      expect(ratio, `${hex} -> ${background} on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('picks the better of the two inks, not merely a passing one', () => {
    for (const hex of ALL) {
      const chosen = contrast(hex, readableInk(hex));
      const other = contrast(hex, readableInk(hex) === '#ffffff' ? '#141413' : '#ffffff');
      expect(chosen, `wrong ink chosen for ${hex}`).toBeGreaterThanOrEqual(other);
    }
  });

  it('leaves a swatch alone when it already passes', () => {
    // Green is dark enough for white text as-is.
    expect(badgeColors('#008300').background).toBe('#008300');
  });

  it('darkens only the swatches that cannot carry small text', () => {
    // #2a78d6 peaks at 4.42:1 against white, so it must be adjusted.
    const { background } = badgeColors('#2a78d6');
    expect(background).not.toBe('#2a78d6');
    expect(contrast('#2a78d6', '#ffffff')).toBeLessThan(4.5);
  });

  it('preserves hue when it adjusts, so the badge still reads as its category', () => {
    for (const hex of ALL) {
      const { background } = badgeColors(hex);
      if (background === hex) continue;
      // Same channel ordering (which is largest / smallest) means same hue family.
      const rank = (c: string) => {
        const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        return [v.indexOf(Math.max(...v)), v.indexOf(Math.min(...v))].join('');
      };
      expect(rank(background), `${hex} -> ${background} shifted hue`).toBe(rank(hex));
    }
  });

  it('uses white on dark fills and dark ink on light fills', () => {
    expect(readableInk('#008300')).toBe('#ffffff');
    expect(readableInk('#eda100')).toBe('#141413');
  });
});
