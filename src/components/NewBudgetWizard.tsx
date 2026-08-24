import { useState } from 'react';
import { ACCOUNT_TYPES, MAX_BUDGET_NAME } from '../model/schema';
import { useBudget } from '../store/useBudget';

type Draft = { name: string; type: string };

const STEPS = ['Name', 'Accounts', 'Save'] as const;

/**
 * Setting up a new budget, in three steps.
 *
 * Everything is collected before anything is written: the save-location picker
 * is the last step, so dismissing it leaves the wizard open with the answers
 * intact rather than discarding them. Nothing exists on disk until the final
 * button, and there is no half-created file to clean up if the user backs out.
 */
export function NewBudgetWizard({ onClose }: { onClose: () => void }) {
  const createFromWizard = useBudget((s) => s.createFromWizard);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [accounts, setAccounts] = useState<Draft[]>([{ name: '', type: '' }]);
  const [busy, setBusy] = useState(false);

  const named = name.trim();
  const filled = accounts.filter((a) => a.name.trim());

  const setAccount = (index: number, patch: Partial<Draft>) =>
    setAccounts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRow = () => setAccounts((rows) => [...rows, { name: '', type: '' }]);

  const removeRow = (index: number) =>
    setAccounts((rows) => (rows.length === 1 ? [{ name: '', type: '' }] : rows.filter((_, i) => i !== index)));

  const finish = async () => {
    setBusy(true);
    // Stays open on a dismissed picker: the answers are still wanted, and
    // closing would throw away two steps of input over a mis-click.
    const created = await createFromWizard({
      name: named,
      accounts: filled.map((a) => ({ name: a.name, type: a.type })),
    });
    setBusy(false);
    if (created) onClose();
  };

  return (
    <div className="panel-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="panel narrow wizard"
        role="dialog"
        aria-modal="true"
        aria-label="New budget"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <h2>New budget</h2>
          <span className="spacer" />
          <ol className="wizard-steps" aria-label="Progress">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={i === step ? 'current' : i < step ? 'done' : ''}
                aria-current={i === step ? 'step' : undefined}
              >
                {label}
              </li>
            ))}
          </ol>
        </header>

        <div className="wizard-body">
          {step === 0 && (
            <>
              <label className="wizard-field">
                <span>What should this budget be called?</span>
                <input
                  autoFocus
                  value={name}
                  maxLength={MAX_BUDGET_NAME}
                  placeholder="Household budget"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && named) setStep(1);
                  }}
                />
              </label>
              <p className="wizard-note">
                Only a label — you choose the file name separately, and renaming the budget later
                never renames the file.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <p className="wizard-question">
                Any investment accounts you want to track?
              </p>
              <ul className="wizard-accounts">
                {accounts.map((row, i) => (
                  <li key={i}>
                    <input
                      autoFocus={i === 0}
                      className="line-rename"
                      value={row.name}
                      placeholder="Account name"
                      onChange={(e) => setAccount(i, { name: e.target.value })}
                    />
                    <input
                      className="line-type"
                      list="account-types"
                      value={row.type}
                      placeholder="Type"
                      onChange={(e) => setAccount(i, { type: e.target.value })}
                    />
                    <button
                      className="icon-btn danger"
                      title="Remove this row"
                      aria-label="Remove this row"
                      onClick={() => removeRow(i)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <datalist id="account-types">
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <button className="wizard-add" onClick={addRow}>
                + Add another
              </button>
              <p className="wizard-note">
                Skip this if you would rather not — accounts can be added on the Investments page
                at any time.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <p className="wizard-question">Ready to create it.</p>
              <dl className="wizard-summary">
                <dt>Name</dt>
                <dd>{named || <em>unnamed</em>}</dd>
                <dt>Accounts</dt>
                <dd>
                  {filled.length
                    ? filled.map((a) => a.name.trim()).join(', ')
                    : <em>none</em>}
                </dd>
              </dl>
              <p className="wizard-note">
                Choosing a location creates the file. Put it somewhere backed up — a synced folder
                gives you version history. No amounts are filled in; every figure will be one you
                enter.
              </p>
            </>
          )}
        </div>

        <footer className="wizard-foot">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="primary" disabled={step === 0 && !named} onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void finish()}>
              {busy ? 'Creating…' : 'Choose location & create'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
