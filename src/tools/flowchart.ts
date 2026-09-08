/**
 * The Canadian personal income spending flowchart, as data.
 *
 * Deliberately not an image. The chart is only worth having here if it can
 * eventually say something about *your* budget — which step you are on, where
 * this year's money should go next — and a picture can never do that. Every
 * node is addressable, so highlighting one, attaching an amount to it, or
 * answering a decision from a year's own figures becomes a change to the
 * renderer rather than a redraw.
 *
 * The wording stays close to the source, because in a chart like this the
 * wording is the advice.
 *
 * Source: flowchart by Reddit user /u/atlasvoid (2016), based on an earlier one
 * by /u/beached89. Reproduced as general guidance, not financial advice.
 */

export type PhaseId =
  | 'budget'
  | 'emergency'
  | 'match'
  | 'debt'
  | 'retirement'
  | 'more-retirement'
  | 'goals';

export interface Phase {
  id: PhaseId;
  /** Numbered as the source chart numbers them. */
  step: number;
  label: string;
}

export const PHASES: readonly Phase[] = [
  { id: 'budget', step: 0, label: 'Budget & reduce expenses, set realistic goals' },
  { id: 'emergency', step: 1, label: 'Build an emergency fund' },
  { id: 'match', step: 2, label: 'Employer-sponsored matching funds' },
  { id: 'debt', step: 3, label: 'Pay down high/moderate interest debts' },
  { id: 'retirement', step: 4, label: 'Retirement savings, higher education expenses' },
  { id: 'more-retirement', step: 5, label: 'Save more for retirement' },
  { id: 'goals', step: 6, label: 'Save for other goals & advanced methods' },
];

export interface FlowNode {
  id: string;
  phase: PhaseId;
  kind: 'action' | 'decision';
  title: string;
  detail?: string;
  /** Where an action leads. More than one where the chart forks without asking. */
  next?: readonly string[];
  /** Where a decision leads. A decision has both. */
  yes?: string;
  no?: string;
}

/**
 * In reading order, top to bottom. The order is presentation only — the edges
 * are what define the graph.
 */
export const FLOW: readonly FlowNode[] = [
  {
    id: 'create-budget',
    phase: 'budget',
    kind: 'action',
    title: 'Create a budget',
    detail:
      'Knowing where the money goes is the foundation for everything below. A budget shows your ' +
      'income less your expenses.',
    next: ['pay-housing'],
  },
  {
    id: 'pay-housing',
    phase: 'budget',
    kind: 'action',
    title: 'Pay rent or mortgage',
    detail: 'Including renters or homeowners insurance, if required.',
    next: ['buy-food'],
  },
  {
    id: 'buy-food',
    phase: 'budget',
    kind: 'action',
    title: 'Buy food and groceries',
    detail:
      'Depending on how tight things are, you may want to put utilities ahead of this.',
    next: ['pay-essentials'],
  },
  {
    id: 'pay-essentials',
    phase: 'budget',
    kind: 'action',
    title: 'Pay essential items',
    detail: 'Power, water, heat, toiletries.',
    next: ['pay-income-earning'],
  },
  {
    id: 'pay-income-earning',
    phase: 'budget',
    kind: 'action',
    title: 'Pay income-earning expenses',
    detail:
      'Necessary transportation, possibly internet and phone — whatever is required to keep ' +
      'earning income.',
    next: ['pay-taxes'],
  },
  {
    id: 'pay-taxes',
    phase: 'budget',
    kind: 'action',
    title: 'Pay taxes',
    next: ['minimum-payments'],
  },
  {
    id: 'minimum-payments',
    phase: 'budget',
    kind: 'action',
    title: 'Make minimum payments on all debts and loans',
    detail: 'Student loans, credit cards, anything with a minimum.',
    next: ['small-emergency-fund'],
  },

  {
    id: 'small-emergency-fund',
    phase: 'emergency',
    kind: 'action',
    title: 'Build a small emergency fund',
    detail:
      'Either $1,000 or one month of expenses, whichever is greater. Keep it in a savings or ' +
      'chequing account.',
    next: ['pay-nonessential'],
  },
  {
    id: 'pay-nonessential',
    phase: 'emergency',
    kind: 'action',
    title: 'Pay any non-essential bills in full',
    detail: 'Cable, internet, phone, and similar.',
    next: ['employer-match'],
  },

  {
    id: 'employer-match',
    phase: 'match',
    kind: 'decision',
    title: 'Does your employer offer a retirement account with a match?',
    detail: 'A Group RRSP, for example.',
    yes: 'contribute-match',
    no: 'high-interest-debt',
  },
  {
    id: 'contribute-match',
    phase: 'match',
    kind: 'action',
    title: 'Contribute enough to get the full match, and no more',
    detail: 'Anything above the match does more good further down this list for now.',
    next: ['high-interest-debt'],
  },

  {
    id: 'high-interest-debt',
    phase: 'debt',
    kind: 'decision',
    title: 'Do you have any high interest debt?',
    detail: 'Debt at 10% or higher.',
    yes: 'attack-high-interest',
    no: 'increase-emergency-fund',
  },
  {
    id: 'attack-high-interest',
    phase: 'debt',
    kind: 'action',
    title: 'Pay it down, by avalanche or snowball',
    detail:
      'Weigh the two against your own financial and psychological situation, and use whichever ' +
      'you will actually stick to.',
    next: ['moderate-interest-debt'],
  },

  {
    id: 'increase-emergency-fund',
    phase: 'emergency',
    kind: 'action',
    title: 'Increase the emergency fund to 3–6 months of living expenses',
    detail: 'Still savings or chequing — this money has to be there on the day you need it.',
    next: ['moderate-interest-debt'],
  },

  {
    id: 'moderate-interest-debt',
    phase: 'debt',
    kind: 'decision',
    title: 'Do you have any moderate interest debt?',
    detail: 'Remaining debt over 4–5%, excluding the mortgage.',
    yes: 'attack-moderate-interest',
    no: 'tfsa-vs-rrsp',
  },
  {
    id: 'attack-moderate-interest',
    phase: 'debt',
    kind: 'action',
    title: 'Pay it down the same way',
    detail: 'Then ask again, until nothing is left above that rate.',
    next: ['moderate-interest-debt'],
  },

  {
    id: 'tfsa-vs-rrsp',
    phase: 'retirement',
    kind: 'action',
    title: 'Weigh a TFSA against an RRSP, and contribute up to 15% of pre-tax income',
    detail:
      'Which suits you depends on your income now against your income in retirement, and on the ' +
      'room you have in each.',
    next: ['large-purchases'],
  },
  {
    id: 'large-purchases',
    phase: 'retirement',
    kind: 'decision',
    title: 'Any large, required purchases coming up?',
    detail: 'College, a professional certification, a car you need in order to work.',
    yes: 'save-for-purchases',
    no: 'saving-fifteen',
  },
  {
    id: 'save-for-purchases',
    phase: 'retirement',
    kind: 'action',
    title: 'Save what those need, in a savings or chequing account',
    detail: 'Money needed within a few years does not belong in the market.',
    next: ['saving-fifteen'],
  },

  {
    id: 'saving-fifteen',
    phase: 'more-retirement',
    kind: 'decision',
    title: 'Are you saving at least 15% of pre-tax income for retirement?',
    detail:
      'Counting every retirement account together. You may need more than 15% if you are behind.',
    yes: 'children-college',
    no: 'increase-contributions',
  },
  {
    id: 'increase-contributions',
    phase: 'more-retirement',
    kind: 'action',
    title: 'Increase contributions to your TFSA and RRSP',
    detail:
      'Prioritise whichever suits your situation. If both are maxed, consider a taxable account.',
    next: ['saving-fifteen'],
  },

  {
    id: 'children-college',
    phase: 'goals',
    kind: 'decision',
    title: 'Do you have children whose education you want to help with?',
    yes: 'resp',
    no: 'options',
  },
  {
    id: 'resp',
    phase: 'goals',
    kind: 'action',
    title: 'Look at an RESP, and contribute accordingly',
    detail: 'The government grant on RESP contributions is rarely worth leaving on the table.',
    next: ['options'],
  },
  {
    id: 'options',
    phase: 'goals',
    kind: 'action',
    title: 'From here it follows your own goals',
    detail: 'Both paths below are reasonable, and they are not mutually exclusive.',
    next: ['retire-early', 'immediate-goals'],
  },
  {
    id: 'retire-early',
    phase: 'goals',
    kind: 'decision',
    title: 'Would you like to retire early?',
    yes: 'max-out',
    no: 'immediate-goals',
  },
  {
    id: 'max-out',
    phase: 'goals',
    kind: 'action',
    title: 'Max out the TFSA, RRSP and any employer account, then use a taxable account',
  },
  {
    id: 'immediate-goals',
    phase: 'goals',
    kind: 'decision',
    title: 'Do you have more immediate goals?',
    yes: 'use-savings',
    no: 'max-out',
  },
  {
    id: 'use-savings',
    phase: 'goals',
    kind: 'action',
    title: 'Match the account to the timeline',
    detail:
      'Savings for anything sooner than 3–5 years, and a conservative mix of stocks and bonds ' +
      'beyond that. Down payments, vehicles, paying down a mortgage, travel.',
  },
];

/** Node lookup, so a branch can name where it leads. */
export const NODES: Record<string, FlowNode> = Object.fromEntries(
  FLOW.map((node) => [node.id, node]),
);

export interface FlowEdge {
  from: string;
  to: string;
  label?: 'Yes' | 'No';
}

/** Every edge in the graph. Used to check the data, and later to trace a path. */
export function edges(): FlowEdge[] {
  const out: FlowEdge[] = [];
  for (const node of FLOW) {
    for (const to of node.next ?? []) out.push({ from: node.id, to });
    if (node.yes) out.push({ from: node.id, to: node.yes, label: 'Yes' });
    if (node.no) out.push({ from: node.id, to: node.no, label: 'No' });
  }
  return out;
}
