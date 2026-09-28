import { useEffect, useRef, useState } from 'react';
import { setThemePreference, THEME_OPTIONS, useThemePreference } from '../settings/theme';

/**
 * The app name, doubling as the home for settings that belong to the app rather
 * than to the budget open in it. The budget's own settings — its name, its
 * passphrase, which file it is — stay in the file menu on the right.
 *
 * Available in every state, including the gates before a file is connected:
 * choosing a readable theme should not require having a budget open first.
 */
export function AppMenu() {
  const preference = useThemePreference();
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

  return (
    <div className="app-menu" ref={ref}>
      <h1>
        <button
          className="app-chip"
          aria-haspopup="menu"
          aria-expanded={open}
          title="App settings"
          onClick={() => setOpen(!open)}
        >
          Budget
          <span className="chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </h1>

      {open && (
        <div className="app-menu-panel" role="menu">
          <p className="app-menu-label" id="appearance-label">
            Appearance
          </p>
          {/* Stays open after a choice, so the effect can be seen and reconsidered. */}
          <div className="theme-choice" role="group" aria-labelledby="appearance-label">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={preference === value}
                className={preference === value ? 'active' : undefined}
                onClick={() => setThemePreference(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="app-menu-note">
            System follows this computer's light or dark setting. The choice is saved on this
            machine, not in the budget file.
          </p>
        </div>
      )}
    </div>
  );
}
