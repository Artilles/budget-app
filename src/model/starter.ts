import {
  type BudgetDoc,
  type Category,
  type Group,
  type InvestmentAccount,
  type Line,
  createEmptyDoc,
  emptyMonths,
  slugify,
} from './schema';
import { setBudgetName } from './mutate';

/**
 * What a brand-new budget starts with.
 *
 * Structure only — every month is empty. The point is to skip the blank page,
 * not to guess anyone's numbers: a starting figure would be invented data
 * sitting in a file about real money, and indistinguishable from something the
 * user entered once it is there.
 *
 * Deliberately a short list. Anything unused is one click to remove, but a
 * category that is missing has to be thought of first, so the set leans toward
 * the lines almost every budget has.
 */
export const STARTER_CATEGORIES: readonly { name: string; group: Group }[] = [
  { name: 'Pay (1st)', group: 'income' },
  { name: 'Pay (15th)', group: 'income' },

  { name: 'Savings', group: 'assets' },
  { name: 'Investment Contributions', group: 'assets' },

  { name: 'Credit Card', group: 'debt' },
  { name: 'Loan Payments', group: 'debt' },

  { name: 'Rent / Mortgage', group: 'costOfLiving' },
  { name: 'Groceries', group: 'costOfLiving' },
  { name: 'Utilities', group: 'costOfLiving' },
  { name: 'Transport', group: 'costOfLiving' },
  { name: 'Phone / Internet', group: 'costOfLiving' },
  { name: 'Insurance', group: 'costOfLiving' },

  { name: 'Restaurants', group: 'discretionary' },
  { name: 'Entertainment', group: 'discretionary' },
  { name: 'Shopping', group: 'discretionary' },
];

export interface NewBudget {
  name: string;
  /** Names, in the order entered. Blanks and duplicates are dropped. */
  accounts: { name: string; type?: string }[];
  /** Defaults to the current calendar year. */
  year?: number;
}

/**
 * Build the document a completed "New budget" wizard produces.
 *
 * One year, the starter categories laid out in it, and the investment accounts
 * the user named. No amounts and no balances anywhere: the file is a shape to
 * fill in, and every figure in it should be one the user typed.
 */
export function createStarterDoc(input: NewBudget, now = new Date()): BudgetDoc {
  const year = input.year ?? now.getFullYear();
  const doc = createEmptyDoc();

  const categories: Record<string, Category> = {};
  const lines: Line[] = [];

  STARTER_CATEGORIES.forEach((entry, order) => {
    // Same slug rule the rest of the app uses, so a category added later by
    // hand resolves to the existing id rather than a parallel one.
    let id = slugify(entry.name);
    for (let n = 2; categories[id]; n += 1) id = `${slugify(entry.name)}-${n}`;

    categories[id] = { id, name: entry.name };
    lines.push({ categoryId: id, group: entry.group, order, months: emptyMonths() });
  });

  const accounts: InvestmentAccount[] = [];
  const seen = new Set<string>();
  for (const entry of input.accounts) {
    const name = entry.name.trim();
    const type = entry.type?.trim();
    // A blank row is someone who started typing and thought better of it, and
    // two accounts sharing a name would be indistinguishable in every chart.
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    let id = slugify(name);
    for (let n = 2; accounts.some((a) => a.id === id); n += 1) id = `${slugify(name)}-${n}`;

    const account: InvestmentAccount = { id, name };
    if (type) account.type = type;
    accounts.push(account);
  }

  // Through setBudgetName rather than assigning, so the trimming and the
  // length cap are the same ones every other rename goes through.
  return setBudgetName(
    {
      ...doc,
      years: { [String(year)]: { year, lines } },
      categories,
      investments: { accounts, months: {} },
    },
    input.name,
  );
}
