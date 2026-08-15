import { formatMoney, formatPercent } from '../format';
import { useToolState } from './useToolState';
import { ToolField, ToolResult } from './ToolField';

export const CONTRIBUTION_ROOM_ID = 'contribution-room';

interface AccountRoom {
  key: string;
  label: string;
  allowedDefault: number;
  contributedDefault: number;
}

/**
 * CRA limits are published per person per year and cannot be derived from
 * anything in this document, so they are typed in. The defaults are the 2025
 * figures carried over from the workbook's Misc Tools sheet.
 */
const ACCOUNTS: AccountRoom[] = [
  { key: 'tfsa', label: 'TFSA', allowedDefault: 46_300, contributedDefault: 41_000 },
  { key: 'rrsp', label: 'RRSP', allowedDefault: 88_433, contributedDefault: 33_400 },
];

export function ContributionRoom() {
  const { number, set } = useToolState(CONTRIBUTION_ROOM_ID);

  return (
    <div className="tool">
      {ACCOUNTS.map((account) => {
        const allowed = number(`${account.key}Allowed`, account.allowedDefault);
        const contributed = number(`${account.key}Contributed`, account.contributedDefault);
        const remaining = allowed - contributed;
        const used = allowed === 0 ? null : contributed / allowed;

        return (
          <section key={account.key} className="tool-section">
            <h3 className="tool-section-title">{account.label}</h3>
            <div className="tool-inputs">
              <ToolField
                label="Room available"
                value={allowed}
                onCommit={(v) => set({ [`${account.key}Allowed`]: v })}
              />
              <ToolField
                label="Contributed so far"
                value={contributed}
                onCommit={(v) => set({ [`${account.key}Contributed`]: v })}
              />
            </div>
            <div className="tool-results">
              <ToolResult
                label={remaining >= 0 ? 'Room left' : 'Over-contributed'}
                value={formatMoney(Math.abs(remaining))}
                tone={remaining >= 0 ? 'good' : 'bad'}
                detail={
                  remaining < 0
                    ? 'Over-contributions are penalised monthly — worth checking against your CRA notice.'
                    : undefined
                }
                emphasis
              />
              <ToolResult label="Room used" value={used === null ? '—' : formatPercent(used)} />
            </div>
          </section>
        );
      })}

      <p className="tool-note">
        These limits are personal to you and change every year — the app cannot work them out, so
        they are entered by hand. Check them against your latest CRA notice of assessment.
      </p>
    </div>
  );
}
