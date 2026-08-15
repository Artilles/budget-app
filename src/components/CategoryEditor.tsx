import { useState } from 'react';
import { GROUPS, GROUP_LABELS, type BudgetDoc, type Group, type Line, type Year } from '../model/schema';
import { groupTotal, lineTotal, linesIn } from '../model/derive';
import { formatMoney } from '../format';
import { useBudget } from '../store/useBudget';

/**
 * Structure editing, separated from the amounts grid.
 *
 * The twelve month columns and a row of controls cannot both fit on screen, and
 * the amounts are not what you are changing here anyway — so this drops the
 * months entirely and shows each line's annual total for context instead.
 */
export function CategoryEditor({ doc, year }: { doc: BudgetDoc; year: Year }) {
  return (
    <div className="category-editor">
      {GROUPS.map((group) => (
        <GroupBlock key={group} group={group} doc={doc} year={year} />
      ))}
    </div>
  );
}

function GroupBlock({ group, doc, year }: { group: Group; doc: BudgetDoc; year: Year }) {
  const lines = linesIn(year, group);
  const total = groupTotal(year, group);

  return (
    <section
      className="editor-group"
      style={{ '--group-color': `var(--group-${group})` } as React.CSSProperties}
    >
      <header className="editor-group-head">
        <h3>{GROUP_LABELS[group]}</h3>
        <span className="editor-group-total">{formatMoney(total)}</span>
      </header>

      <ul className="editor-lines">
        {lines.map((line, i) => (
          <EditorRow
            key={line.categoryId}
            line={line}
            doc={doc}
            year={year}
            isFirst={i === 0}
            isLast={i === lines.length - 1}
          />
        ))}
      </ul>

      <AddCategoryRow group={group} />
    </section>
  );
}

function EditorRow({
  line,
  doc,
  year,
  isFirst,
  isLast,
}: {
  line: Line;
  doc: BudgetDoc;
  year: Year;
  isFirst: boolean;
  isLast: boolean;
}) {
  const removeCategory = useBudget((s) => s.removeCategory);
  const renameCategory = useBudget((s) => s.renameCategory);
  const moveLine = useBudget((s) => s.moveLine);
  const setLineGroup = useBudget((s) => s.setLineGroup);
  const setLineFlag = useBudget((s) => s.setLineFlag);

  const name = doc.categories[line.categoryId]?.name ?? line.categoryId;
  const total = lineTotal(line);

  const confirmRemove = () => {
    const detail =
      total === 0
        ? ''
        : `\n\nIt holds ${formatMoney(total)} across ${year.year}. That data will be lost.`;
    const ok = window.confirm(
      `Remove "${name}" from ${year.year}?${detail}\n\n` +
        `Other years keep it, and it stays available to add back.`,
    );
    if (ok) removeCategory(line.categoryId);
  };

  return (
    <li className="editor-line">
      <span className="line-reorder">
        <button
          className="icon-btn"
          disabled={isFirst}
          title="Move up"
          onClick={() => moveLine(line.categoryId, -1)}
        >
          ↑
        </button>
        <button
          className="icon-btn"
          disabled={isLast}
          title="Move down"
          onClick={() => moveLine(line.categoryId, 1)}
        >
          ↓
        </button>
      </span>

      <input
        className="line-rename"
        defaultValue={name}
        title="Renaming applies to every year — it is the same category."
        onBlur={(e) => renameCategory(line.categoryId, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            renameCategory(line.categoryId, e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
      />

      <span className="editor-line-total">{formatMoney(total)}</span>

      <select
        className="line-group"
        value={line.group}
        title={`Which group this sits in, in ${year.year} only`}
        onChange={(e) => setLineGroup(line.categoryId, e.target.value as Group)}
      >
        {GROUPS.map((g) => (
          <option key={g} value={g}>
            {GROUP_LABELS[g]}
          </option>
        ))}
      </select>

      <FlagToggle
        active={Boolean(line.informational)}
        label="not counted"
        title="Exclude from this group's total — use when the amount is already included in another line."
        onToggle={(v) => setLineFlag(line.categoryId, 'informational', v)}
      />
      <FlagToggle
        active={Boolean(line.preIncome)}
        label="pre-income"
        title="Deducted before take-home pay: counts in this group's total, but is not subtracted again from left-over."
        onToggle={(v) => setLineFlag(line.categoryId, 'preIncome', v)}
      />

      <button className="icon-btn danger" title="Remove from this year" onClick={confirmRemove}>
        ×
      </button>
    </li>
  );
}

function FlagToggle({
  active,
  label,
  title,
  onToggle,
}: {
  active: boolean;
  label: string;
  title: string;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      className={`flag toggle${active ? ' active' : ''}`}
      title={title}
      aria-pressed={active}
      onClick={() => onToggle(!active)}
    >
      {label}
    </button>
  );
}

function AddCategoryRow({ group }: { group: Group }) {
  const addCategory = useBudget((s) => s.addCategory);
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    addCategory(name, group);
    setName('');
  };

  return (
    <div className="editor-add">
      <input
        className="add-category"
        placeholder={`Add to ${GROUP_LABELS[group]}…`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <button className="icon-btn" disabled={!name.trim()} onClick={submit} title="Add category">
        +
      </button>
    </div>
  );
}
