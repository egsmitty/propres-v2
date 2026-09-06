# PresenterPro

PresenterPro is a local-first Electron desktop app for worship presentations. It combines a PowerPoint-style editor with worship-media features: a song library with built-in public-domain hymns, a presentation filmstrip, Presenter View, and a separate full-screen output window.

Everything is stored locally in a SQLite database inside Electron's user-data folder. There is no sync, account, or cloud component.

## Project layout

| Path                                  | What it is                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `presenter-pro/`                      | The Electron + React application (main process, preload, renderer, tests)            |
| `presenter-pro/electron/`             | Main process (`main/`), preload, and the database layer (`db/`, migrations, queries) |
| `presenter-pro/src/`                  | React renderer (Zustand store, components, utilities)                                |
| `presenter-pro/e2e/`                  | Playwright end-to-end specs that drive the built app                                 |
| `.github/workflows/`                  | CI: PR checks, E2E, tag-triggered release builds                                     |
| `.cursor/rules/`                      | Testing and executable-plan standards that every change follows                      |
| `AGENTS.md`, `AI_OPERATING_MANUAL.md` | How work is planned, executed, and reviewed in this repo                             |
| `tasks/`                              | Executable plans, remediation logs, and the running engineering notes                |
| `test-media/`                         | Sample images and video used by the app and the E2E suite                            |

## Requirements

- Node.js at the version in `.nvmrc` (run `nvm use` in the repo root). npm 10 or newer.
- macOS 12 (Monterey) or later, or Windows 10 or later. No compiler toolchain is needed: `better-sqlite3` ships prebuilt N-API binaries that serve both Node and Electron.
- The `sqlite3` command-line tool on your PATH for the E2E suite and the database verification tool (macOS ships it).

## Run locally

```bash
cd presenter-pro
npm ci
npm start
```

`npm start` runs `electron-vite dev`: the renderer hot-reloads, and the main process restarts on change.

## Quality gate

Every change must pass the gate before it can merge. It is what CI runs, so run it locally first:

```bash
cd presenter-pro
npm run gate          # type-check, lint (warning ceiling enforced), unit tests
npm run format:check  # prettier
```

Useful pieces on their own:

| Command                             | Purpose                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run test:unit`                 | Vitest unit tests (`**/__tests__/*.test.ts`), with coverage thresholds that only ratchet upward |
| `npm run test:watch`                | Vitest in watch mode                                                                            |
| `npm run test:coverage`             | Coverage report under `coverage/`                                                               |
| `npm run lint` / `npm run lint:fix` | ESLint. Pre-existing warnings are frozen in `eslint-suppressions.json` and may only shrink      |
| `npm run type-check`                | `tsc --noEmit` over the whole project (JS is type-checked too)                                  |

Pre-commit hooks run Prettier and ESLint on staged files, and commit messages must follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, ...). Hooks are installed automatically by `npm ci` via the `prepare` script.

## End-to-end tests

The E2E suite builds the app and launches the real Electron binary with Playwright, each spec in its own temporary user-data directory so your real library is never touched:

```bash
cd presenter-pro
npm run test:e2e            # builds, then runs every spec
npx playwright test e2e/quit.spec.ts   # one spec, after a build
```

Specs cover launch, quitting, the unsaved-changes prompt, versioned database migrations (fresh and legacy databases, backups, pruning), crash recovery, and the built-in hymn seeder.

## The database

- **Migrations are versioned and recorded** in a `schema_migrations` table. On launch the app applies only the pending ones, each in its own transaction, after writing a consistent backup (`presenterpro.backup-v<N>-<timestamp>.db`, newest three kept) next to the database. A launch with nothing pending performs zero writes.
- **Crash recovery**: unsaved presentation edits are journaled a couple of seconds after each change. After a crash the next launch offers Recover / Discard / Later.
- **Built-in hymns** are identified by `built_in_key`, never by title. The seeder never deletes anything, and it refreshes a hymn only while the row still matches the text the seeder wrote, so your edits to a built-in hymn are permanent.
- **Check a real database before upgrading** (works on a copy, never the original):

```bash
cd presenter-pro
npm run verify:db "$HOME/Library/Application Support/PresenterPro/presenterpro.db"
```

It reports the migrations that would apply, the backup that would be written, and proves row counts are identical afterwards.

## Working on the code

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`.
2. Tests first. Non-trivial work starts from an executable plan in `tasks/` (see `.cursor/rules/writing-executable-plans.mdc`); the rules in `.cursor/rules/testing-standards.mdc` are enforced, not advisory.
3. Open a pull request. `main` is protected for everyone, including admins: the **PR Gate** check (gate + macOS and Windows builds) must pass and the branch must be up to date. Nothing lands on `main` directly.
4. Every PR description ends with a short findings report: what was verified, what changed behaviour, and anything discovered but not fixed.

Ongoing engineering decisions and the reasoning behind them live in `tasks/fable-notes.md`; the current plan and status table are in `tasks/fable-pass-plan.md`.

## Build and package

```bash
cd presenter-pro
npm run build       # electron-vite build -> presenter-pro/out/
npm run dist:dir    # unpacked app for quick local testing
npm run dist:mac    # macOS dmg + zip
npm run dist:win    # Windows nsis + zip (x64); dist:win:arm64 for ARM
```

Packaged output is written to `presenter-pro/dist/`. Pushing a `v*` tag runs the release workflow, which builds both platforms in CI.

## Notes

- The first launch seeds a starter presentation, sample songs, and the built-in hymns.
- Shared Mac builds are unsigned, so macOS may ask the recipient to right-click the app and choose **Open** the first time.
- Dependabot opens grouped update PRs weekly. Electron majors are deliberately not grouped: each one is its own planned migration.
