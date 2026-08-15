import { useState, type ReactNode } from 'react';
import { parseAmount } from '../format';

/**
 * A labelled numeric input for tools.
 *
 * Commits on blur or Enter, keeps the previous value when the input cannot be
 * parsed, and accepts the same arithmetic the budget grid does — `60000/12` is
 * often how you actually know a monthly figure.
 */
export function ToolField({
  label,
  hint,
  value,
  suffix,
  onCommit,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = parseAmount(raw);
    if (parsed === undefined || parsed === null) return;
    onCommit(parsed);
  };

  return (
    <label className="tool-field">
      <span className="tool-field-label">{label}</span>
      <span className="tool-input-wrap">
        <input
          className="tool-input"
          inputMode="decimal"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            // Commit on Enter directly rather than leaning on blur to do it —
            // the value should land whether or not focus actually moves.
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
        {suffix && <span className="tool-input-suffix">{suffix}</span>}
      </span>
      {hint && <span className="tool-field-hint">{hint}</span>}
    </label>
  );
}

/** A computed figure. `tone` colours the value when it carries a verdict. */
export function ToolResult({
  label,
  value,
  detail,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: 'good' | 'bad';
  emphasis?: boolean;
}) {
  return (
    <div className={`tool-result${emphasis ? ' emphasis' : ''}`}>
      <span className="tool-result-label">{label}</span>
      <span className={`tool-result-value${tone ? ` ${tone}` : ''}`}>{value}</span>
      {detail && <span className="tool-result-detail">{detail}</span>}
    </div>
  );
}
