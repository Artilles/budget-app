import { useState } from 'react';
import type { CompensationRow } from '../model/derive';
import type { VestingEvent } from '../model/schema';
import { formatMoney, formatPercent, parseAmount } from '../format';
import { useBudget } from '../store/useBudget';

/** Today, as the default date for a new entry. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * An inline cell that commits on Enter or blur and reverts on Escape.
 *
 * Commits on Enter directly rather than relying on blur to fire, matching the
 * budget grid — a typed value should land whether or not focus moves.
 */
function EditCell({
  value,
  align = 'right',
  placeholder,
  parse,
  format,
  onCommit,
}: {
  value: string;
  align?: 'left' | 'right';
  placeholder?: string;
  parse?: (raw: string) => string | undefined;
  format?: (raw: string) => string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = parse ? parse(raw) : raw;
    if (parsed === undefined) return; // unparseable: keep what was there
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      className="edit-cell"
      style={{ textAlign: align }}
      placeholder={placeholder}
      value={draft ?? (format ? format(value) : value)}
      onFocus={() => setDraft(value)}
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

const asNumber = (raw: string): string | undefined => {
  const parsed = parseAmount(raw);
  if (parsed === undefined) return undefined;
  return String(parsed ?? 0);
};

const asOptionalNumber = (raw: string): string | undefined => {
  if (!raw.trim()) return '';
  const parsed = parseAmount(raw);
  return parsed === undefined ? undefined : String(parsed ?? 0);
};

export function CompensationTable({ rows }: { rows: CompensationRow[] }) {
  const updateRaise = useBudget((s) => s.updateRaise);
  const removeRaise = useBudget((s) => s.removeRaise);
  const addRaise = useBudget((s) => s.addRaise);

  const confirmRemove = (row: CompensationRow) => {
    const ok = window.confirm(
      `Delete the ${row.date} entry${row.company ? ` at ${row.company}` : ''}?\n\n` +
        `Changes after it will be recalculated against the entry before it.`,
    );
    if (ok) removeRaise(row.id);
  };

  /** Seed a new step from the latest one, since a raise is usually a delta. */
  const addStep = () => {
    const last = rows[rows.length - 1];
    addRaise({
      date: today(),
      baseSalary: last?.baseSalary ?? 0,
      ...(last?.company ? { company: last.company } : {}),
    });
  };

  return (
    <div className="grid-scroll">
      <table className="overview-table editable">
        <thead>
          <tr>
            <th className="col-label">Effective</th>
            <th style={{ textAlign: 'left' }}>Company</th>
            <th>Base salary</th>
            <th>Change</th>
            <th>%</th>
            <th className="sep">Sign-on</th>
            <th>Stock vesting</th>
            <th>Total comp</th>
            <th>Change</th>
            <th>%</th>
            <th style={{ textAlign: 'left' }}>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th className="col-label">
                <EditCell
                  value={row.date}
                  align="left"
                  placeholder="YYYY-MM-DD"
                  parse={(raw) => (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined)}
                  onCommit={(v) => updateRaise(row.id, { date: v })}
                />
              </th>
              <td>
                <EditCell
                  value={row.company ?? ''}
                  align="left"
                  placeholder="—"
                  onCommit={(v) => updateRaise(row.id, { company: v.trim() || undefined })}
                />
              </td>
              <td>
                <EditCell
                  value={String(row.baseSalary)}
                  parse={asNumber}
                  format={(v) => formatMoney(Number(v))}
                  onCommit={(v) => updateRaise(row.id, { baseSalary: Number(v) })}
                />
              </td>
              <td className={`num${(row.baseDelta ?? 0) < 0 ? ' negative' : ''}`}>
                {row.baseDelta === null ? '—' : formatMoney(row.baseDelta)}
              </td>
              <td className={`num dim${(row.baseIncrease ?? 0) < 0 ? ' negative' : ''}`}>
                {row.baseIncrease === null ? '—' : formatPercent(row.baseIncrease)}
              </td>
              <td className="sep">
                <EditCell
                  value={row.signOnBonus ? String(row.signOnBonus) : ''}
                  placeholder="—"
                  parse={asOptionalNumber}
                  format={(v) => (v ? formatMoney(Number(v)) : '')}
                  onCommit={(v) => updateRaise(row.id, { signOnBonus: v ? Number(v) : undefined })}
                />
              </td>
              <td>
                <EditCell
                  value={row.stockVesting ? String(row.stockVesting) : ''}
                  placeholder="—"
                  parse={asOptionalNumber}
                  format={(v) => (v ? formatMoney(Number(v)) : '')}
                  onCommit={(v) => updateRaise(row.id, { stockVesting: v ? Number(v) : undefined })}
                />
              </td>
              <td className="num">{formatMoney(row.totalComp)}</td>
              <td className={`num${(row.totalDelta ?? 0) < 0 ? ' negative' : ''}`}>
                {row.totalDelta === null ? '—' : formatMoney(row.totalDelta)}
              </td>
              <td className={`num dim${(row.totalIncrease ?? 0) < 0 ? ' negative' : ''}`}>
                {row.totalIncrease === null ? '—' : formatPercent(row.totalIncrease)}
              </td>
              <td>
                <EditCell
                  value={row.note ?? ''}
                  align="left"
                  placeholder="—"
                  onCommit={(v) => updateRaise(row.id, { note: v.trim() || undefined })}
                />
              </td>
              <td>
                <button
                  className="icon-btn danger"
                  title="Delete this entry"
                  onClick={() => confirmRemove(row)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-actions">
        <button onClick={addStep}>+ Add compensation step</button>
      </div>
    </div>
  );
}

export function VestingTable({ events }: { events: VestingEvent[] }) {
  const updateVestingEvent = useBudget((s) => s.updateVestingEvent);
  const removeVestingEvent = useBudget((s) => s.removeVestingEvent);
  const addVestingEvent = useBudget((s) => s.addVestingEvent);

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid-scroll">
      <table className="overview-table editable">
        <thead>
          <tr>
            <th className="col-label">Vest date</th>
            <th>Units</th>
            <th>Price</th>
            <th>Value</th>
            <th style={{ textAlign: 'left' }}>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((event) => (
            <tr key={event.id}>
              <th className="col-label">
                <EditCell
                  value={event.date}
                  align="left"
                  placeholder="YYYY-MM-DD"
                  parse={(raw) => (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined)}
                  onCommit={(v) => updateVestingEvent(event.id, { date: v })}
                />
              </th>
              <td>
                <EditCell
                  value={String(event.units)}
                  parse={asNumber}
                  onCommit={(v) => updateVestingEvent(event.id, { units: Number(v) })}
                />
              </td>
              <td>
                <EditCell
                  value={String(event.price)}
                  parse={asNumber}
                  format={(v) => formatMoney(Number(v))}
                  onCommit={(v) => updateVestingEvent(event.id, { price: Number(v) })}
                />
              </td>
              <td className="num">{formatMoney(event.units * event.price)}</td>
              <td>
                <EditCell
                  value={event.note ?? ''}
                  align="left"
                  placeholder="—"
                  onCommit={(v) => updateVestingEvent(event.id, { note: v.trim() || undefined })}
                />
              </td>
              <td>
                <button
                  className="icon-btn danger"
                  title="Delete this vest"
                  onClick={() => {
                    if (window.confirm(`Delete the ${event.date} vest of ${event.units} units?`)) {
                      removeVestingEvent(event.id);
                    }
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="col-label">Total</th>
            <td className="num">{sorted.reduce((s, e) => s + e.units, 0).toLocaleString('en-CA')}</td>
            <td />
            <td className="num">
              {formatMoney(sorted.reduce((s, e) => s + e.units * e.price, 0))}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <div className="table-actions">
        <button onClick={() => addVestingEvent({ date: today(), units: 0, price: 0 })}>
          + Add vesting event
        </button>
      </div>
    </div>
  );
}
