import { useState } from 'react';
import { ACCOUNT_TYPES, MONTHS, monthKey, type BudgetDoc } from '../model/schema';
import { accountTypeColor, badgeColors, useChartTheme } from '../charts/palette';
import { budgetContributionFor, type InvestmentPoint } from '../model/derive';
import { formatAmount, formatPercent, parseAmount } from '../format';
import { useBudget } from '../store/useBudget';

/**
 * End-of-month balance entry, one year at a time.
 *
 * Balances are typed; everything to the right of them is derived. The two
 * contribution columns are deliberately separate: the budget column is read
 * from that month's Assets group and cannot be edited here, so the budget and
 * the investment record can never drift apart. Lump sums that never appeared in
 * the budget go in the manual column beside it.
 */
export function InvestmentGrid({
  doc,
  year,
  points,
  startMonths,
}: {
  doc: BudgetDoc;
  year: string;
  points: Map<string, InvestmentPoint>;
  /** Account id → the month it was first recorded, from `accountStartMonths`. */
  startMonths: Record<string, string>;
}) {
  const setAccountBalance = useBudget((s) => s.setAccountBalance);
  const setManualContribution = useBudget((s) => s.setManualContribution);

  const accounts = doc.investments.accounts;

  return (
    <div className="grid-scroll">
      <table className="year-grid investment-grid">
        <thead>
          <tr>
            <th className="col-label">Month</th>
            {accounts.map((a) => (
              <th key={a.id} title={a.type ? `${a.name} — ${a.type}` : a.name}>
                {a.name}
                {a.type && <AccountTypePill type={a.type} />}
              </th>
            ))}
            <th className="c-total derived">Total</th>
            <th className="derived derived-end">From budget</th>
            <th>One-off</th>
            <th className="derived">Contributed</th>
            <th className="derived">Month ROI</th>
            <th className="derived">Year to date ROI</th>
          </tr>
        </thead>
        <tbody>
          {MONTHS.map((label, index) => {
            const key = monthKey(Number(year), index);
            const entry = doc.investments.months[key];
            const point = points.get(key);
            const fromBudget = budgetContributionFor(doc, key);
            const manual = entry?.manualContribution ?? 0;

            return (
              <tr key={key}>
                <th className="col-label">{label}</th>

                {accounts.map((a) => (
                  <td
                    key={a.id}
                    className={
                      'cell' +
                      (startMonths[a.id] === key ? ' is-start' : '') +
                      (entry?.autofilled?.includes(a.id) ? ' is-autofilled' : '')
                    }
                    title={
                      entry?.autofilled?.includes(a.id)
                        ? 'Interpolated by "Fill gaps" — type over it to make it a real reading'
                        : undefined
                    }
                  >
                    <BalanceCell
                      value={entry?.balances[a.id] ?? null}
                      onChange={(v) => setAccountBalance(key, a.id, v)}
                    />
                    {startMonths[a.id] === key && (
                      <span
                        className="start-pill"
                        title={`${a.name} was first recorded in ${label} ${year}`}
                      >
                        Started
                      </span>
                    )}
                  </td>
                ))}

                <td className="num total derived">
                  {point ? formatAmount(point.totalBalance) : ''}
                </td>

                <td
                  className="num derived derived-end dim"
                  title="From this month's Assets in the budget"
                >
                  {fromBudget ? formatAmount(fromBudget) : ''}
                </td>
                <td className="cell">
                  <BalanceCell
                    value={entry?.manualContribution ?? null}
                    onChange={(v) => setManualContribution(key, v)}
                  />
                </td>
                <td className="num derived">
                  {fromBudget + manual ? formatAmount(fromBudget + manual) : ''}
                </td>

                <td
                  className={`num derived${(point?.monthlyReturn ?? 0) < 0 ? ' negative-cell' : ''}`}
                >
                  {point?.monthlyReturn == null ? '' : formatPercent(point.monthlyReturn)}
                </td>
                <td className={`num derived${(point?.ytdReturn ?? 0) < 0 ? ' negative-cell' : ''}`}>
                  {point?.ytdReturn == null ? '' : formatPercent(point.ytdReturn)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The account type, in its own colour.
 *
 * The fill comes from the validated series palette and the ink is chosen per
 * swatch, because those eight slots span too wide a lightness band for one ink
 * to stay readable on all of them.
 */
export function AccountTypePill({ type }: { type: string }) {
  const theme = useChartTheme();

  return (
    <span className="account-type" style={badgeColors(accountTypeColor(type, theme))}>
      {type}
    </span>
  );
}

/**
 * A balance cell. Empty is meaningfully different from zero: empty means the
 * month was not measured and the previous balance carries forward, zero means
 * the account really held nothing.
 */
function BalanceCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = parseAmount(raw);
    if (parsed === undefined) return; // unparseable: leave it alone
    if (parsed !== value) onChange(parsed);
  };

  return (
    <input
      className={`money-cell${value === null ? ' empty' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      placeholder="—"
      value={draft ?? formatAmount(value)}
      onFocus={(e) => {
        setDraft(value === null ? '' : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Add, rename, retype, reorder and remove the accounts the grid has columns for. */
export function AccountManager({ doc }: { doc: BudgetDoc }) {
  const addInvestmentAccount = useBudget((s) => s.addInvestmentAccount);
  const renameInvestmentAccount = useBudget((s) => s.renameInvestmentAccount);
  const setInvestmentAccountType = useBudget((s) => s.setInvestmentAccountType);
  const moveInvestmentAccount = useBudget((s) => s.moveInvestmentAccount);
  const removeInvestmentAccount = useBudget((s) => s.removeInvestmentAccount);
  const [name, setName] = useState('');

  // Index being dragged, and the index it would land on. Held in state rather
  // than read from the drop event so the row can show where it is going.
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const accounts = doc.investments.accounts;

  const endDrag = () => {
    if (dragging !== null && over !== null && over !== dragging) {
      moveInvestmentAccount(accounts[dragging].id, over);
    }
    setDragging(null);
    setOver(null);
  };

  const submit = () => {
    if (!name.trim()) return;
    addInvestmentAccount(name);
    setName('');
  };

  const confirmRemove = (id: string, accountName: string) => {
    const recorded = Object.values(doc.investments.months).filter((m) => id in m.balances).length;
    const ok = window.confirm(
      `Remove "${accountName}"?\n\n` +
        (recorded
          ? `${recorded} recorded balance${recorded === 1 ? '' : 's'} will be deleted. ` +
            `Unlike a budget category, an account's history lives only under it, so this cannot be undone.`
          : 'It has no recorded balances.'),
    );
    if (ok) removeInvestmentAccount(id);
  };

  return (
    <div className="account-manager">
      <ul className="editor-lines">
        {accounts.map((account, index) => (
          <li
            key={account.id}
            className={
              'editor-line' +
              (dragging === index ? ' dragging' : '') +
              (over === index && dragging !== null && dragging !== index ? ' drop-target' : '')
            }
            onDragOver={(e) => {
              // Without this the drop is refused and the row never highlights.
              e.preventDefault();
              if (over !== index) setOver(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              endDrag();
            }}
          >
            <span
              className="drag-handle"
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Reorder ${account.name}. Use the arrow keys, or drag.`}
              title="Drag to reorder — or focus and use ↑ / ↓"
              onDragStart={(e) => {
                setDragging(index);
                e.dataTransfer.effectAllowed = 'move';
                // Firefox ignores a drag that carries no data.
                e.dataTransfer.setData('text/plain', account.id);
              }}
              onDragEnd={endDrag}
              onKeyDown={(e) => {
                // Dragging is mouse-only; the arrows keep reordering reachable.
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveInvestmentAccount(account.id, index + (e.key === 'ArrowUp' ? -1 : 1));
                }
              }}
            >
              ⠿
            </span>
            <input
              className="line-rename"
              defaultValue={account.name}
              onBlur={(e) => renameInvestmentAccount(account.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  renameInvestmentAccount(account.id, e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
            />
            <input
              className="line-type"
              list="account-types"
              placeholder="Type"
              defaultValue={account.type ?? ''}
              title="Account type, e.g. RRSP or TFSA. Pick a suggestion or type your own."
              onBlur={(e) => setInvestmentAccountType(account.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setInvestmentAccountType(account.id, e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
            />
            {/* The colour this type will wear in the grid, shown while editing. */}
            <span className="type-preview">
              {account.type ? <AccountTypePill type={account.type} /> : null}
            </span>
            <button
              className="icon-btn danger"
              title="Remove this account"
              onClick={() => confirmRemove(account.id, account.name)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <datalist id="account-types">
        {ACCOUNT_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="editor-add">
        <input
          className="add-category"
          placeholder="Add an account…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button className="icon-btn" disabled={!name.trim()} onClick={submit} title="Add account">
          +
        </button>
      </div>
    </div>
  );
}
