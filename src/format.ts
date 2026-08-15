const money0 = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const money2 = new Intl.NumberFormat('en-CA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent1 = new Intl.NumberFormat('en-CA', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Grid cells drop the cents when there are none, because a column of "680.00"
 * is harder to scan than a column of "680" — and most entries are round.
 */
export function formatAmount(value: number | null): string {
  if (value === null) return '';
  return Number.isInteger(value) ? money0.format(value) : money2.format(value);
}

/** Totals and the summary box always show cents, so they reconcile by eye. */
export function formatMoney(value: number): string {
  return `$${money2.format(value)}`;
}

export function formatPercent(value: number): string {
  return percent1.format(value);
}

/**
 * Parse what someone typed into a money cell. Accepts "1,234.50", "$1234.5",
 * "  12 ", and simple arithmetic like "1152.93*2" — the source spreadsheet is
 * full of that, and re-typing the product by hand would be a downgrade.
 * Returns undefined when the input cannot be understood, so the caller can
 * leave the previous value alone.
 */
export function parseAmount(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/^=/, '').replace(/[$,\s]/g, '');
  if (!cleaned) return null;

  if (/^-?\d*\.?\d+$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }

  // Arithmetic, restricted to digits and the four operators so nothing else
  // can be evaluated.
  if (/^[\d+\-*/.()]+$/.test(cleaned)) {
    try {
      const result = Function(`"use strict";return (${cleaned})`)() as unknown;
      return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
