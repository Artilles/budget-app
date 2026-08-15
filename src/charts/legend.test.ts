import { describe, expect, it } from 'vitest';
import {
  gridTopForLegend,
  LEGEND_TOP,
  legendOverflows,
  legendRows,
  type MeasureText,
} from './legend';

/**
 * An eight-account legend of the size that overlapped the plot, with the text
 * widths a browser reports for labels of these lengths at 11px.
 *
 * Fixed here so the wrapping can be tested without a canvas — jsdom's
 * measureText returns 0, which would make any such test pass regardless of the
 * logic. The labels are arbitrary; only their widths drive the arithmetic.
 */
const WIDTHS: Record<string, number> = {
  'Balanced Growth Fund (TFSA)': 159,
  'Broad Market Index ETF (TFSA)': 144,
  'Brokerage One (TFSA)': 90,
  'Brokerage Two (TFSA)': 104,
  'Brokerage Two (RRSP)': 107,
  'Employer Match Plan (RRSP)': 157,
  'Former Employer Locked-In (RRSP)': 186,
  'Brokerage Two Taxable (Non-Registered)': 198,
};

const ACCOUNTS = Object.keys(WIDTHS);

/** Falls back to a per-character estimate for labels not in the table. */
const measure: MeasureText = (text) => WIDTHS[text] ?? text.length * 5.5;

describe('legend wrapping', () => {
  it('reproduces the three rows seen at ~780px, which the plot must clear', () => {
    expect(legendRows(ACCOUNTS, 780, measure)).toBe(3);
  });

  it('needs fewer rows as the chart widens', () => {
    expect(legendRows(ACCOUNTS, 1600, measure)).toBeLessThan(
      legendRows(ACCOUNTS, 780, measure),
    );
  });

  it('is monotonic: a narrower chart never reserves less room', () => {
    const widths = [1600, 1280, 1024, 800, 640, 480, 360];
    const tops = widths.map((w) => gridTopForLegend(ACCOUNTS, w, measure));
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i], `width ${widths[i]} reserved less than ${widths[i - 1]}`)
        .toBeGreaterThanOrEqual(tops[i - 1]);
    }
  });

  it('puts one item per row when nothing fits beside it', () => {
    expect(legendRows(['aaa', 'bbb', 'ccc'], 40, () => 30)).toBe(3);
  });

  it('keeps a single row when everything fits', () => {
    expect(legendRows(ACCOUNTS, 4000, measure)).toBe(1);
  });
});

describe('legend space reservation', () => {
  it('reserves nothing for a chart with no series', () => {
    expect(legendRows([], 800, measure)).toBe(0);
  });

  it('assumes one row before the first layout pass, rather than zero', () => {
    // width 0 is what the first render sees; reserving nothing would put the
    // legend straight over the plot until the resize observer fires.
    expect(legendRows(ACCOUNTS, 0, measure)).toBe(1);
  });

  it('degrades to one row where there is no measurer, instead of throwing', () => {
    expect(legendRows(ACCOUNTS, 800, null)).toBe(1);
  });

  it('always starts the plot below the legend', () => {
    for (const width of [0, 320, 640, 1280, 4000]) {
      expect(gridTopForLegend(ACCOUNTS, width, measure)).toBeGreaterThan(LEGEND_TOP);
    }
  });

  it('caps the rows so the legend cannot crowd out the plot', () => {
    const many = Array.from({ length: 60 }, (_, i) => `A very long account name ${i}`);
    expect(legendRows(many, 200, measure)).toBeLessThanOrEqual(4);
  });

  it('switches to a scrolling legend once it hits the cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Account number ${i}`);
    expect(legendOverflows(many, 200, measure)).toBe(true);
    expect(legendOverflows(ACCOUNTS, 4000, measure)).toBe(false);
  });
});
