import type { KeyboardEvent } from 'react';
import { type PassphraseDraft, passphraseProblem } from '../storage/encryption';

/** Choosing a new passphrase, with the unrecoverable-if-lost warning. */
export function PassphraseFields({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: PassphraseDraft;
  onChange: (next: PassphraseDraft) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const problem = passphraseProblem(value);
  // Only complain about a mismatch once there is something to compare, so the
  // form does not open already scolding.
  const shown = value.confirm && problem ? problem : null;
  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !problem) onSubmit?.();
  };

  return (
    <>
      <label className="wizard-field">
        <span>Passphrase</span>
        <input
          type="password"
          autoFocus={autoFocus}
          autoComplete="new-password"
          value={value.passphrase}
          onChange={(e) => onChange({ ...value, passphrase: e.target.value })}
          onKeyDown={submitOnEnter}
        />
      </label>
      <label className="wizard-field">
        <span>Enter it again</span>
        <input
          type="password"
          autoComplete="new-password"
          value={value.confirm}
          aria-invalid={shown ? true : undefined}
          onChange={(e) => onChange({ ...value, confirm: e.target.value })}
          onKeyDown={submitOnEnter}
        />
      </label>
      {shown && (
        <p className="wizard-error" role="alert">
          {shown}
        </p>
      )}
      <p className="wizard-note warn">
        There is no way to recover a forgotten passphrase — without it the budget cannot be
        opened, by you or anyone else. Keep it somewhere safe, such as a password manager.
      </p>
    </>
  );
}
