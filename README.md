# Budget

A personal finance app for annual budgeting, investment tracking, and salary history. Uses
local data only, stored in JSON format.

A budget can optionally be protected with a passphrase, either when it is created or later
from the budget menu. The file is then encrypted (AES-256-GCM, with the key derived from the
passphrase by PBKDF2-SHA256 at 600,000 iterations), so it can live in a synced folder and be
opened on any computer with the same passphrase. The passphrase is never stored and cannot be
recovered. "Export unencrypted copy" in the same menu writes a readable copy elsewhere.

## What it does

- **Budget** — the twelve-month grid, one year at a time. Categories are grouped into
  income, assets, debt, and cost of living, with per-line and per-group totals, share of
  group, and a derived left-over figure. Years can be locked once you consider them final.
- **Overview** — every year side by side, plus cross-year charts for income, where the money
  went, and the whole month-by-month history.
- **Raises** — compensation history, the size of each raise, and RSU vesting.
- **Investments** — end-of-month balances per account, with contributions read straight from
  the budget so the two can never disagree, plus monthly and year-to-date return.
- **Tools** — small calculators (emergency fund, RRSP room) that persist their inputs.

## Running it

Requires Node 20+. The browser build needs Chrome or Edge: the File System Access API is not
available in Firefox or Safari.

```bash
npm install
npm run dev
```

Then pick or create a budget file. Other scripts:

```bash
npm test          # unit tests
npm run lint
npm run build     # production build into dist/
```

### Desktop app

A [Tauri](https://tauri.app) wrapper builds the same frontend into a standalone executable
with no install step and no browser required. It needs the Rust toolchain and, on Windows,
the MSVC build tools.

```bash
npm run desktop:dev     # dev server in a native window
npm run desktop:build   # produces an .exe plus MSI and NSIS installers
```

## Built with

React, TypeScript, Vite, [zustand](https://github.com/pmndrs/zustand),
[ECharts](https://echarts.apache.org), and [Tauri](https://tauri.app).

Chart colours are validated rather than chosen by eye — checked for lightness band, chroma,
adjacent-pair colour-blind separation, and contrast against the app's actual surfaces in both
light and dark themes.

## Licence

MIT — see [LICENSE](LICENSE).
