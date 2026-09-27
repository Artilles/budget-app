import { type FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';
import { useBudget } from './store/useBudget';
import { MAX_BUDGET_NAME } from './model/schema';
import { NewBudgetWizard } from './components/NewBudgetWizard';
import { ProtectDialog } from './components/ProtectDialog';
import { YearView } from './views/YearView';
import { OverviewView } from './views/OverviewView';
import { RaisesView } from './views/RaisesView';
import { InvestmentsView } from './views/InvestmentsView';
import { ToolsView } from './views/ToolsView';
import { useChartTheme, usePublishGroupColors } from './charts/palette';

/**
 * Phase 1 shell: connection gate plus a document summary.
 * The year grid, charts, and category management land in later phases; this
 * exists so the storage layer can be exercised for real against a file on disk.
 */
export default function App() {
  const status = useBudget((s) => s.status);
  const error = useBudget((s) => s.error);
  const init = useBudget((s) => s.init);

  // Keeps the grid's group tints in step with the chart palette, in both themes.
  usePublishGroupColors(useChartTheme());

  useEffect(() => {
    void init();
  }, [init]);

  // Flush a debounced save if the window is closing or being hidden. Without
  // this, an edit made in the last moment before closing is lost — the timer
  // simply never fires.
  useEffect(() => {
    const flush = () => {
      const { pendingSave, saveNow } = useBudget.getState();
      if (pendingSave) void saveNow();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // Held here rather than in either caller: the gate and the file menu both
  // open the same wizard, and it outlives the menu that launched it.
  const [creating, setCreating] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Budget</h1>
        {status === 'ready' && <ViewTabs />}
        <div className="spacer" />
        {status === 'ready' && <FileMenu onNewBudget={() => setCreating(true)} />}
        <SaveState />
      </header>
      <main className="app-main">
        <Body status={status} error={error} onNewBudget={() => setCreating(true)} />
      </main>
      {creating && <NewBudgetWizard onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * The connected file, and the only route to a different one.
 *
 * Switching used to be reachable only from the error screens, which meant a
 * working session had no way out of the file it happened to open.
 */
function FileMenu({ onNewBudget }: { onNewBudget: () => void }) {
  const fileName = useBudget((s) => s.fileName);
  const budgetName = useBudget((s) => s.doc?.name ?? '');
  const setBudgetName = useBudget((s) => s.setBudgetName);
  const openExisting = useBudget((s) => s.openExisting);
  const encrypted = useBudget((s) => s.encrypted);
  const exportUnencrypted = useBudget((s) => s.exportUnencrypted);

  const [open, setOpen] = useState(false);
  // Lives here, not inside the panel, so it survives the menu closing.
  const [protecting, setProtecting] = useState(false);
  // The menu stays open through an export so its outcome can be reported in
  // place; there is nowhere else in the header to say it.
  const [exportNote, setExportNote] = useState<{ text: string; failed?: boolean } | null>(null);
  // Renaming is a deliberate act rather than something you fall into by opening
  // the menu, so the name is read-only until the pencil is clicked.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Closing abandons a half-typed name, so it cannot reappear later looking
  // like it was saved. Declared above the effect that calls it.
  const close = () => {
    setOpen(false);
    setEditing(false);
    setExportNote(null);
  };

  const runExport = async () => {
    setExportNote(null);
    try {
      const name = await exportUnencrypted();
      if (name) setExportNote({ text: `Saved a readable copy as ${name}.` });
    } catch (err) {
      setExportNote({ text: err instanceof Error ? err.message : String(err), failed: true });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape abandons the rename first, and only closes the menu when there
      // is no edit in progress.
      if (e.key === 'Escape') {
        if (editing) setEditing(false);
        else close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, editing]);

  const run = (action: () => Promise<void>) => {
    close();
    void action();
  };

  const startEditing = () => {
    setDraft(budgetName);
    setEditing(true);
  };

  const commitName = (value: string) => {
    setEditing(false);
    setBudgetName(value);
  };

  // An unnamed budget falls back to its file name, so the chip is never blank.
  const label = budgetName || fileName || 'No file';

  return (
    <div className="file-menu" ref={ref}>
      <button
        className="file-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title={budgetName ? `${budgetName} — ${fileName ?? 'no file'}` : 'Name this budget, or open another'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {label}
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="file-menu-panel" role="menu">
          <div className="file-menu-name">
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={MAX_BUDGET_NAME}
                placeholder={fileName ?? 'Name this budget'}
                aria-label="Budget name"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commitName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitName(e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                  // Also handled here so cancelling an edit does not close the
                  // menu behind it.
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <>
                <strong>{budgetName || fileName || 'Unnamed budget'}</strong>
                <button
                  className="icon-btn"
                  title="Rename this budget"
                  aria-label="Rename this budget"
                  onClick={startEditing}
                >
                  ✎
                </button>
              </>
            )}
          </div>

          <p className="file-menu-stored" title={fileName ?? undefined}>
            Stored in {fileName ?? '—'}
          </p>
          <div className="file-menu-protection">
            {encrypted ? (
              <>
                <p className="protected-flag">
                  <LockIcon />
                  Passphrase protected
                </p>
                <button
                  role="menuitem"
                  title="Saves a copy with no passphrase. Anyone who can open that file can read it."
                  onClick={() => void runExport()}
                >
                  Export unencrypted copy…
                </button>
              </>
            ) : (
              <button
                role="menuitem"
                onClick={() => {
                  close();
                  setProtecting(true);
                }}
              >
                Add passphrase protection…
              </button>
            )}
            {exportNote && (
              <p className={exportNote.failed ? 'file-menu-note failed' : 'file-menu-note'} role="status">
                {exportNote.text}
              </p>
            )}
          </div>
          <button role="menuitem" onClick={() => run(openExisting)}>
            Open a different budget…
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close();
              onNewBudget();
            }}
          >
            Create a new budget…
          </button>
          <p className="file-menu-note">
            Renaming the budget does not rename the file. Unsaved changes are written to the
            current file before switching.
          </p>
        </div>
      )}
      {protecting && <ProtectDialog onClose={() => setProtecting(false)} />}
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor" />
      <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function UnlockGate() {
  const fileName = useBudget((s) => s.fileName);
  const unlock = useBudget((s) => s.unlock);
  const openExisting = useBudget((s) => s.openExisting);
  const forget = useBudget((s) => s.forget);

  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setWrong(false);
    const opened = await unlock(passphrase);
    // On success this component unmounts; only a wrong passphrase lands here.
    if (!opened) {
      setBusy(false);
      setWrong(true);
    }
  };

  return (
    <form className="gate" onSubmit={(e) => void submit(e)}>
      <h2 className="gate-title">
        <LockIcon />
        This budget is protected
      </h2>
      <p>
        Enter the passphrase for <code>{fileName}</code> to open it. The passphrase is never
        stored, so the app asks each time it opens the budget.
      </p>
      <label className="wizard-field">
        <span>Passphrase</span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={passphrase}
          aria-invalid={wrong || undefined}
          disabled={busy}
          onChange={(e) => {
            setPassphrase(e.target.value);
            setWrong(false);
          }}
        />
      </label>
      {wrong && (
        <p className="wizard-error" role="alert">
          That passphrase did not unlock this budget.
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={!passphrase || busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button type="button" onClick={() => void openExisting()} disabled={busy}>
          Open a different budget
        </button>
        <button type="button" onClick={() => void forget()} disabled={busy}>
          Start over
        </button>
      </div>
    </form>
  );
}

function SaveState() {
  const saving = useBudget((s) => s.saving);
  const lastSavedAt = useBudget((s) => s.lastSavedAt);
  const status = useBudget((s) => s.status);
  const error = useBudget((s) => s.error);
  const saveNow = useBudget((s) => s.saveNow);

  if (status !== 'ready') return <span className="save-state" />;

  // A failed autosave leaves the document loaded and editable, so without this
  // the user would keep typing into changes that are not reaching disk.
  if (error) {
    return (
      <button className="save-state failed" onClick={() => void saveNow()} title={error}>
        Not saved — retry
      </button>
    );
  }

  if (saving) return <span className="save-state">Saving…</span>;
  if (lastSavedAt) return <span className="save-state">Saved</span>;
  return <span className="save-state" />;
}

function Body({
  status,
  error,
  onNewBudget,
}: {
  status: string;
  error: string | null;
  onNewBudget: () => void;
}) {
  const openExisting = useBudget((s) => s.openExisting);
  const reconnect = useBudget((s) => s.reconnect);
  const forget = useBudget((s) => s.forget);
  const fileName = useBudget((s) => s.fileName);

  switch (status) {
    case 'starting':
    case 'loading':
      return <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</p>;

    case 'unsupported':
      return (
        <div className="gate error">
          <h2>Browser not supported</h2>
          <p>{error}</p>
        </div>
      );

    case 'needs-permission':
      return (
        <div className="gate">
          <h2>Reconnect to your budget</h2>
          <p>
            The app remembers <code>{fileName}</code> but needs your permission again to read and
            write it. In a browser this happens after a restart; in the desktop app, only once for
            a budget opened before access was remembered.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => void reconnect()}>
              Reconnect
            </button>
            <button onClick={() => void forget()}>Use a different file</button>
          </div>
        </div>
      );

    case 'locked':
      return <UnlockGate />;

    case 'error':
      return (
        <div className="gate error">
          <h2>Could not open the budget file</h2>
          <p>Your file has not been modified.</p>
          <div className="error-detail">{error}</div>
          <div className="actions">
            <button onClick={() => void openExisting()}>Choose another file</button>
            <button onClick={() => void forget()}>Start over</button>
          </div>
        </div>
      );

    case 'no-file':
      return (
        <div className="gate">
          <h2>Choose where your budget lives</h2>
          <p>
            Your data is stored as a single JSON file that you own — put it in OneDrive so it is
            backed up and versioned. The browser only remembers where the file is, never what is
            in it.
          </p>
          <div className="actions">
            <button className="primary" onClick={onNewBudget}>
              Create a new budget
            </button>
            <button onClick={() => void openExisting()}>Open an existing one</button>
          </div>
        </div>
      );

    case 'ready':
      return <ReadyView />;

    default:
      return null;
  }
}

function ViewTabs() {
  const view = useBudget((s) => s.view);
  const setView = useBudget((s) => s.setView);

  return (
    <nav className="view-tabs" aria-label="Section">
      {(
        [
          ['overview', 'Overview'],
          ['year', 'Budget'],
          ['raises', 'Raises'],
          ['investments', 'Investments'],
          ['tools', 'Tools'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          className={view === v ? 'view-tab active' : 'view-tab'}
          aria-current={view === v ? 'page' : undefined}
          onClick={() => setView(v)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function ReadyView() {
  const view = useBudget((s) => s.view);
  if (view === 'overview') return <OverviewView />;
  if (view === 'raises') return <RaisesView />;
  if (view === 'investments') return <InvestmentsView />;
  if (view === 'tools') return <ToolsView />;
  return <YearView />;
}

