import { useState } from 'react';
import { useBudget } from '../store/useBudget';
import { YearGrid } from '../components/YearGrid';
import { CategoryEditor } from '../components/CategoryEditor';
import { SummaryBox } from '../components/SummaryBox';
import { CategoriesPanel } from '../components/CategoriesPanel';
import { NewYearDialog } from '../components/NewYearDialog';
import { YearCharts } from '../components/YearCharts';

export function YearView() {
  const doc = useBudget((s) => s.doc);
  const selectedYear = useBudget((s) => s.selectedYear);
  const selectYear = useBudget((s) => s.selectYear);
  const setJobTitle = useBudget((s) => s.setJobTitle);
  const deleteYear = useBudget((s) => s.deleteYear);
  const setYearLocked = useBudget((s) => s.setYearLocked);

  const [editing, setEditing] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showNewYear, setShowNewYear] = useState(false);

  if (!doc) return null;

  const years = Object.keys(doc.years).sort();
  const year = selectedYear ? doc.years[selectedYear] : undefined;
  const locked = Boolean(year?.locked);

  const confirmDeleteYear = () => {
    if (!year) return;
    const ok = window.confirm(
      `Delete ${year.year} entirely?\n\n` +
        `All ${year.lines.length} categories and their amounts for that year will be lost. ` +
        `Other years are unaffected.\n\nThis cannot be undone.`,
    );
    if (ok) deleteYear(String(year.year));
  };

  return (
    <div className="year-view">
      <nav className="year-tabs" aria-label="Budget year">
        {years.map((y) => {
          const isLocked = Boolean(doc.years[y].locked);
          return (
            <button
              key={y}
              className={`year-tab${y === selectedYear ? ' active' : ''}${isLocked ? ' is-locked' : ''}`}
              aria-current={y === selectedYear ? 'page' : undefined}
              title={isLocked ? `${y} is locked` : undefined}
              onClick={() => selectYear(y)}
            >
              {y}
              {/* So a locked year is visible without having to open it. */}
              {isLocked && <span className="lock-dot" aria-label="locked" />}
            </button>
          );
        })}
        <button className="year-tab add" onClick={() => setShowNewYear(true)} title="Add a year">
          +
        </button>

        <span className="spacer" />

        {year && (
          <button
            className={locked ? 'locked' : ''}
            aria-pressed={locked}
            title={
              locked
                ? `${year.year} is locked — unlock it to make changes`
                : `Lock ${year.year} so its figures cannot be changed`
            }
            onClick={() => setYearLocked(String(year.year), !locked)}
          >
            {locked ? '🔒 Locked' : 'Lock year'}
          </button>
        )}
        <button onClick={() => setShowCategories(true)}>Categories…</button>
        <button
          className={editing ? 'primary' : ''}
          aria-pressed={editing}
          disabled={locked}
          title={locked ? 'Unlock the year to edit its categories' : undefined}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Done editing' : 'Edit categories'}
        </button>
      </nav>

      {!years.length ? (
        <div className="gate">
          <h2>No years yet</h2>
          <p>
            This budget is empty. Run <code>npm run import</code> to bring in your spreadsheet, or
            add a year with the <strong>+</strong> button above.
          </p>
        </div>
      ) : (
        year && (
          <>
            <div className="year-head">
              <input
                className="job-title"
                value={year.jobTitle ?? ''}
                placeholder="Job title or note for this year"
                readOnly={locked}
                onChange={(e) => setJobTitle(e.target.value)}
              />
              <SummaryBox year={year} />
            </div>

            {editing && !locked ? (
              <CategoryEditor doc={doc} year={year} />
            ) : (
              <>
                <YearCharts year={year} />
                <YearGrid doc={doc} year={year} locked={locked} />
              </>
            )}

            <p className="grid-hint">
              {locked ? (
                <>
                  <strong>{year.year} is locked.</strong> Its figures, categories and title cannot
                  be changed, and it cannot be deleted, until you unlock it. Other years are
                  unaffected.
                </>
              ) : editing ? (
                <>
                  Changes here affect <strong>{year.year} only</strong> — other years keep what they
                  have, and years you create later inherit whatever this one looks like. Renaming is
                  the exception: it applies everywhere, because it is the same category.
                  <button className="link-btn danger" onClick={confirmDeleteYear}>
                    Delete {year.year}
                  </button>
                </>
              ) : (
                <>
                  Arrow keys move between cells. Cells accept arithmetic like{' '}
                  <code>1152.93*2</code>. <kbd>Shift</kbd>+<kbd>Enter</kbd> copies a value across
                  the rest of the year.
                </>
              )}
            </p>
          </>
        )
      )}

      {showCategories && <CategoriesPanel onClose={() => setShowCategories(false)} />}
      {showNewYear && <NewYearDialog onClose={() => setShowNewYear(false)} />}
    </div>
  );
}
