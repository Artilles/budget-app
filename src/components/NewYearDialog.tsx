import { useState } from 'react';
import { useBudget } from '../store/useBudget';

/**
 * Creating a year copies another year's category structure. This is the other
 * half of the per-year category rule: a year created now inherits whatever its
 * source looks like at this moment, which is how a category removed earlier
 * stays gone going forward without ever touching history.
 */
export function NewYearDialog({ onClose }: { onClose: () => void }) {
  const doc = useBudget((s) => s.doc);
  const createYear = useBudget((s) => s.createYear);

  const existing = doc ? Object.keys(doc.years).sort() : [];
  const latest = existing.length ? Number(existing[existing.length - 1]) : new Date().getFullYear() - 1;

  const [year, setYear] = useState(String(latest + 1));
  const [source, setSource] = useState(existing.length ? existing[existing.length - 1] : '');
  const [copyAmounts, setCopyAmounts] = useState(false);

  if (!doc) return null;

  const parsed = Number(year);
  const valid = Number.isInteger(parsed) && parsed > 1900 && parsed < 2200;
  const clash = valid && Boolean(doc.years[String(parsed)]);
  const sourceYear = source ? doc.years[source] : undefined;

  const submit = () => {
    if (!valid || clash) return;
    createYear(parsed, source || null, copyAmounts);
    onClose();
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div
        className="panel narrow"
        role="dialog"
        aria-label="Add a year"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <h2>Add a year</h2>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
        </header>

        <label className="field">
          <span>Year</span>
          <input
            type="number"
            value={year}
            autoFocus
            onChange={(e) => setYear(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>
        {clash && <p className="field-error">{parsed} already exists.</p>}

        <label className="field">
          <span>Copy structure from</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Start empty</option>
            {existing.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {sourceYear && (
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={copyAmounts}
              onChange={(e) => setCopyAmounts(e.target.checked)}
            />
            <span>
              Copy the amounts too, not just the {sourceYear.lines.length} categories
            </span>
          </label>
        )}

        <div className="panel-actions">
          <button className="primary" disabled={!valid || clash} onClick={submit}>
            Create {valid ? parsed : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
