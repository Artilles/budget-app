import { useRef, useState } from 'react';
import { formatAmount, parseAmount } from '../format';

interface Props {
  value: number | null;
  categoryId: string;
  monthIndex: number;
  onChange: (value: number | null) => void;
  /** Copy this cell's value across the rest of the year. */
  onFill: () => void;
  disabled?: boolean;
}

/** Lets arrow keys move between cells without threading refs through the grid. */
function cellId(categoryId: string, monthIndex: number): string {
  return `cell:${categoryId}:${monthIndex}`;
}

function focusCell(categoryId: string, monthIndex: number): boolean {
  const el = document.getElementById(cellId(categoryId, monthIndex));
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
    return true;
  }
  return false;
}

/** Move to the cell directly above or below, staying in the same month column. */
function focusVertical(input: HTMLInputElement, monthIndex: number, delta: number): void {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[data-month]')];
  const sameColumn = inputs.filter((el) => Number(el.dataset.month) === monthIndex);
  const index = sameColumn.indexOf(input);
  const next = sameColumn[index + delta];
  if (next) {
    next.focus();
    next.select();
  }
}

/**
 * A single month's amount. Shows a formatted value at rest and the raw number
 * while editing, so nothing is lost to formatting round-trips. Input that
 * cannot be parsed leaves the stored value untouched rather than clearing it.
 */
export function MoneyCell({ value, categoryId, monthIndex, onChange, onFill, disabled }: Props) {
  // Null while at rest, so the displayed value always follows the store.
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const commit = (raw: string): void => {
    const parsed = parseAmount(raw);
    setDraft(null);
    if (parsed === undefined) return; // unparseable: keep what was there
    if (parsed !== value) onChange(parsed);
  };

  return (
    <input
      ref={ref}
      id={cellId(categoryId, monthIndex)}
      data-month={monthIndex}
      className={`money-cell${value === null ? ' empty' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      value={draft ?? formatAmount(value)}
      onFocus={(e) => {
        setDraft(value === null ? '' : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        const input = e.currentTarget;
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            commit(input.value);
            if (e.shiftKey) onFill();
            input.blur();
            break;
          case 'Escape':
            e.preventDefault();
            setDraft(null);
            input.blur();
            break;
          case 'ArrowLeft':
            if (input.selectionStart !== 0) return;
            e.preventDefault();
            commit(input.value);
            focusCell(categoryId, monthIndex - 1);
            break;
          case 'ArrowRight':
            if (input.selectionEnd !== input.value.length) return;
            e.preventDefault();
            commit(input.value);
            focusCell(categoryId, monthIndex + 1);
            break;
          case 'ArrowUp':
            e.preventDefault();
            commit(input.value);
            focusVertical(input, monthIndex, -1);
            break;
          case 'ArrowDown':
            e.preventDefault();
            commit(input.value);
            focusVertical(input, monthIndex, 1);
            break;
          default:
            break;
        }
      }}
    />
  );
}
