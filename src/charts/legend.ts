/**
 * How much vertical room a wrapping ECharts legend needs.
 *
 * ECharts lays the legend out inside the canvas but does not reserve space for
 * it — `grid.top` is a number the caller supplies, and if the legend wraps to
 * more rows than that number allows, it simply draws over the plot. A constant
 * cannot be right either, because the number of rows depends on the chart's
 * width: the same eight accounts sit on one row at full width and four in a
 * three-up column.
 *
 * So measure the labels in the legend's own font and wrap them the way ECharts
 * will, then hand back a `grid.top` that clears them.
 */

/** Matches `legend.textStyle.fontSize` on the charts that use this. */
const FONT = '11px sans-serif';

/** `legend.itemWidth`, and the gap ECharts leaves between icon and text. */
const ICON_WIDTH = 10;
const ICON_TEXT_GAP = 5;

/** `legend.itemGap`. */
const ITEM_GAP = 12;

/**
 * Canvas `measureText` does not reproduce ECharts' own layout: it consistently
 * reports narrower than ECharts lays out at the same nominal font, so an
 * uncorrected estimate wraps later than the real legend does and under-reserves
 * space — which is the overlap this module exists to prevent.
 *
 * 1.2 is taken from where a real eight-account legend actually broke. The two
 * errors are not symmetric: too many rows costs a little whitespace above the
 * plot, too few draws the legend over it. So this is set to err high.
 */
const WIDTH_SAFETY = 1.2;

/** Row pitch for 11px text. */
const ROW_HEIGHT = 19;

/**
 * Vertical layout, shared by every chart so they line up with each other.
 *
 * A chart title is drawn at the top of the canvas and, like the legend, takes
 * no space of its own — everything below it is positioned by these offsets. So
 * the gap under a heading is the difference between the title's height and
 * whatever comes next, and it has to be set here rather than in CSS.
 */

/** `legend.top` — where the legend starts, below the title. */
export const LEGEND_TOP = 34;

/** `grid.top` for a chart whose legend sits above the plot. */
export const GRID_TOP_WITH_LEGEND = 70;

/** `grid.top` for a chart with no legend, or one docked to the side. */
export const GRID_TOP_PLAIN = 52;

/** Breathing room between the last legend row and the plot. */
const CLEARANCE = 14;

/**
 * Past this the legend would eat the plot, so it stops growing and the legend
 * is expected to scroll instead.
 */
const MAX_ROWS = 4;

/** Width of a string in the legend's font, in CSS pixels. */
export type MeasureText = (text: string) => number;

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * The canvas-backed measurer, or null where there is no DOM to make one with.
 * Injectable so the wrapping arithmetic can be tested without a real canvas —
 * jsdom's `measureText` returns 0, which would make such a test meaningless.
 */
export function canvasMeasurer(): MeasureText | null {
  if (ctx === undefined) {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!ctx) return null;
  ctx.font = FONT;
  const context = ctx;
  return (text) => context.measureText(text).width;
}

/** Rows the legend will occupy at this width. */
export function legendRows(
  labels: string[],
  width: number,
  measure: MeasureText | null = canvasMeasurer(),
): number {
  if (!labels.length) return 0;

  // Before the first layout pass width is 0, and without a measurer there is
  // nothing to wrap against. One row is the safe assumption: too small a
  // reservation is corrected on the next pass, too large leaves a visible gap.
  if (!width || !measure) return 1;

  let rows = 1;
  let x = 0;
  for (const label of labels) {
    const itemWidth = ICON_WIDTH + ICON_TEXT_GAP + measure(label) * WIDTH_SAFETY;
    if (x > 0 && x + itemWidth > width) {
      rows += 1;
      x = 0;
    }
    x += itemWidth + ITEM_GAP;
  }
  return Math.min(rows, MAX_ROWS);
}

/** `grid.top` that clears a legend of this many rows. */
export function gridTopForLegend(
  labels: string[],
  width: number,
  measure?: MeasureText | null,
): number {
  return LEGEND_TOP + legendRows(labels, width, measure) * ROW_HEIGHT + CLEARANCE;
}

/** True once the legend needs more rows than it is allowed, so it must scroll. */
export function legendOverflows(
  labels: string[],
  width: number,
  measure?: MeasureText | null,
): boolean {
  return legendRows(labels, width, measure) >= MAX_ROWS;
}
