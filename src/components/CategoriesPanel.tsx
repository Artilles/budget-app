import { useMemo, useState } from 'react';
import { useBudget } from '../store/useBudget';
import { categoryUsage } from '../model/derive';
import { lockedYearsAffectedByMerge, mergeOverlap } from '../model/mutate';

/**
 * Every category across every year, with the years it appears in.
 *
 * The point of this view is merging: the source spreadsheet accumulated
 * near-duplicates as things got renamed ("Reimbursment Pay" became
 * "Reimbursements"), and folding those together is what turns a broken pair of
 * stubs into one continuous series in the multi-year charts.
 */
export function CategoriesPanel({ onClose }: { onClose: () => void }) {
  const doc = useBudget((s) => s.doc);
  const renameCategory = useBudget((s) => s.renameCategory);
  const merge = useBudget((s) => s.mergeCategories);
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    if (!doc) return [];
    const usage = categoryUsage(doc);
    return Object.values(doc.categories)
      .map((c) => ({ category: c, years: usage.get(c.id) ?? [] }))
      .sort((a, b) => a.category.name.localeCompare(b.category.name));
  }, [doc]);

  if (!doc) return null;

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? rows.filter((r) => r.category.name.toLowerCase().includes(needle))
    : rows;

  const doMerge = (fromId: string, intoId: string) => {
    if (!intoId || fromId === intoId) return;
    const from = doc.categories[fromId];
    const into = doc.categories[intoId];

    // Merging rewrites every year that used the source, so it cannot proceed
    // while any of them is locked — a partial merge would leave those years
    // pointing at a category that is about to be removed.
    const blocked = lockedYearsAffectedByMerge(doc, fromId);
    if (blocked.length) {
      window.alert(
        `Cannot merge "${from.name}": ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} locked.\n\n` +
          `Unlock ${blocked.length === 1 ? 'that year' : 'those years'} first, or merge a category they do not use.`,
      );
      return;
    }

    const overlap = mergeOverlap(doc, fromId, intoId);

    const warning = overlap.length
      ? `\n\nBoth appear in ${overlap.join(', ')}. Their monthly amounts will be added together.`
      : '';
    const ok = window.confirm(
      `Merge "${from.name}" into "${into.name}"?\n\n` +
        `Every year that used "${from.name}" will use "${into.name}" instead, ` +
        `so they become one continuous series.${warning}\n\nThis cannot be undone.`,
    );
    if (ok) merge(fromId, intoId);
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-label="Categories"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <h2>Categories</h2>
          <input
            className="panel-filter"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button onClick={onClose}>Done</button>
        </header>

        <p className="panel-note">
          {rows.length} categories. Renaming applies everywhere. Merging folds one category into
          another across every year — use it where a category was renamed over time.
        </p>

        <div className="panel-scroll">
          <table className="category-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Years</th>
                <th>Used in</th>
                <th>Merge into…</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ category, years }) => (
                <tr key={category.id}>
                  <td>
                    <input
                      className="cat-rename"
                      defaultValue={category.name}
                      onBlur={(e) => renameCategory(category.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </td>
                  <td className="num">{years.length}</td>
                  <td className="cat-span">
                    {years.length ? `${years[0]}–${years[years.length - 1]}` : 'unused'}
                  </td>
                  <td>
                    <select
                      value=""
                      onChange={(e) => {
                        doMerge(category.id, e.target.value);
                        e.currentTarget.value = '';
                      }}
                    >
                      <option value="">—</option>
                      {rows
                        .filter((r) => r.category.id !== category.id)
                        .map((r) => (
                          <option key={r.category.id} value={r.category.id}>
                            {r.category.name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
