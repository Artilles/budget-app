import { useEffect, useRef, useState } from 'react';
import './App.css';
import { useBudget } from './store/useBudget';
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Budget</h1>
        {status === 'ready' && <ViewTabs />}
        <div className="spacer" />
        {status === 'ready' && <FileMenu />}
        <SaveState />
      </header>
      <main className="app-main">
        <Body status={status} error={error} />
      </main>
    </div>
  );
}

/**
 * The connected file, and the only route to a different one.
 *
 * Switching used to be reachable only from the error screens, which meant a
 * working session had no way out of the file it happened to open.
 */
function FileMenu() {
  const fileName = useBudget((s) => s.fileName);
  const openExisting = useBudget((s) => s.openExisting);
  const createNew = useBudget((s) => s.createNew);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (action: () => Promise<void>) => {
    setOpen(false);
    void action();
  };

  return (
    <div className="file-menu" ref={ref}>
      <button
        className="file-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change which budget file is open"
        onClick={() => setOpen((v) => !v)}
      >
        {fileName ?? 'No file'}
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="file-menu-panel" role="menu">
          <div className="file-menu-current">
            <span>Currently open</span>
            <strong>{fileName ?? '—'}</strong>
          </div>
          <button role="menuitem" onClick={() => run(openExisting)}>
            Open a different budget…
          </button>
          <button role="menuitem" onClick={() => run(createNew)}>
            Create a new budget…
          </button>
          <p className="file-menu-note">
            Unsaved changes are written to the current file before switching.
          </p>
        </div>
      )}
    </div>
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

function Body({ status, error }: { status: string; error: string | null }) {
  const openExisting = useBudget((s) => s.openExisting);
  const createNew = useBudget((s) => s.createNew);
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
            The browser remembers <code>{fileName}</code> but needs your permission again to read
            and write it. This happens after a restart.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => void reconnect()}>
              Reconnect
            </button>
            <button onClick={() => void forget()}>Use a different file</button>
          </div>
        </div>
      );

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
            <button className="primary" onClick={() => void createNew()}>
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

