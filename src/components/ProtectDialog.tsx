import { useState } from 'react';
import { useBudget } from '../store/useBudget';
import { EMPTY_PASSPHRASE, passphraseProblem } from '../storage/encryption';
import { PassphraseFields } from './PassphraseFields';

/** Turns on passphrase protection for the budget that is already open. */
export function ProtectDialog({ onClose }: { onClose: () => void }) {
  const enableProtection = useBudget((s) => s.enableProtection);
  const fileName = useBudget((s) => s.fileName);

  const [draft, setDraft] = useState(EMPTY_PASSPHRASE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = passphraseProblem(draft) !== null;

  const submit = async () => {
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enableProtection(draft.passphrase);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="panel-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="panel narrow wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Add passphrase protection"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
        }}
      >
        <header className="panel-head">
          <h2>Add passphrase protection</h2>
        </header>
        <div className="wizard-body">
          <p className="wizard-note">
            <code>{fileName}</code> will be encrypted in place. From then on the app asks for the
            passphrase each time it opens this budget, on any computer.
          </p>
          <PassphraseFields value={draft} onChange={setDraft} onSubmit={() => void submit()} autoFocus />
          {error && (
            <p className="wizard-error" role="alert">
              Protection was not turned on: {error}
            </p>
          )}
        </div>
        <footer className="wizard-foot">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          <button className="primary" disabled={blocked || busy} onClick={() => void submit()}>
            {busy ? 'Encrypting…' : 'Protect budget'}
          </button>
        </footer>
      </div>
    </div>
  );
}
