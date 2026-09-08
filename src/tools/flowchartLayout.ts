/**
 * Where each flowchart node sits on the grid: column 0 is the spine, column 1
 * holds the work a "yes" sends you off to do.
 *
 * Hand-placed rather than computed. A general graph-layout pass would be a lot
 * of machinery for one fixed chart, and placing it by hand lets each loop sit
 * level with the question it returns to — which turns an arrow that would curve
 * back up the page into a short horizontal one.
 *
 * Separate from `flowchart.ts` so that file stays the graph alone, and from the
 * component so the chart's shape can be read without the rendering. A test
 * asserts this covers every node and nothing else.
 */
export interface NodePosition {
  col: 0 | 1;
  row: number;
}

export const LAYOUT: Record<string, NodePosition> = {
  'create-budget': { col: 0, row: 0 },
  'pay-housing': { col: 0, row: 1 },
  'buy-food': { col: 0, row: 2 },
  'pay-essentials': { col: 0, row: 3 },
  'pay-income-earning': { col: 0, row: 4 },
  'pay-taxes': { col: 0, row: 5 },
  'minimum-payments': { col: 0, row: 6 },

  'small-emergency-fund': { col: 0, row: 7 },
  'pay-nonessential': { col: 0, row: 8 },

  'employer-match': { col: 0, row: 9 },
  'contribute-match': { col: 1, row: 9 },

  'high-interest-debt': { col: 0, row: 10 },
  'attack-high-interest': { col: 1, row: 10 },
  'increase-emergency-fund': { col: 0, row: 11 },

  'moderate-interest-debt': { col: 0, row: 12 },
  'attack-moderate-interest': { col: 1, row: 12 },

  'tfsa-vs-rrsp': { col: 0, row: 13 },
  'large-purchases': { col: 0, row: 14 },
  'save-for-purchases': { col: 1, row: 14 },

  'saving-fifteen': { col: 0, row: 15 },
  'increase-contributions': { col: 1, row: 15 },

  'children-college': { col: 0, row: 16 },
  resp: { col: 1, row: 16 },
  options: { col: 0, row: 17 },

  'retire-early': { col: 0, row: 18 },
  'immediate-goals': { col: 1, row: 18 },
  'max-out': { col: 0, row: 19 },
  'use-savings': { col: 1, row: 19 },
};
