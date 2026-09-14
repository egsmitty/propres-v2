# Executable Plan MB1 — a library that won't open says so instead of leaving no window

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 2 plan **D5**,
item **MAIN-B1** (P0, [O]): a database open or migration failure leaves the app
running with no window. Only the audit's "first pass (~15 lines)" —
`dialog.showErrorBox` with the path, then `app.exit(1)`. Its "Reveal folder" /
"Restore from backup" buttons are recorded there as a later pass.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`d57c46c`.

---

## Measured

| Code | What happened |
|---|---|
| `electron/main/index.js` `app.whenReady().then(() => { … getDb(); runMigrations(db); syncMediaCanonicalPaths(db); seed(db); registerIpcHandlers(); buildNativeMenu(); createMainWindow(); })` | No `.catch`. A throw anywhere before `createMainWindow()` rejects the promise with nothing listening: an unhandled rejection in the log, no window, `window-all-closed` never fires, and the process sits in the dock. |
| `electron/db/index.js` `getDb()` | `new Database(path)` and the pragmas are bare — a corrupt, locked or unreadable file throws. |
| `electron/db/migrations.js` / `migrationRunner.ts` | A failing migration rolls its transaction back and **propagates** (by design, pinned by `lifecycleListeners.test.ts`'s "swallows no errors"). The throw is correct; nothing above it was listening. |
| `dialog` | Already required from `electron` in `index.js`. |
| Tests | `index.js` cannot be imported in a unit test (electron, better-sqlite3, a database at import time); `lifecycleListeners.test.ts` pins its wiring by reading the source text. |

## Decisions

1. **The words are a pure module**, `electron/main/startupFailure.ts`:
   `describeStartupFailure(error, { userDataPath })` → `{ title, message }`, with
   the fixed title `PresenterPro Could Not Start`. A generic failure says the
   library could not be opened, names the folder, and ends with
   `Details: <error message>` (`Unknown error` when nothing useful was thrown).
2. **A library written by a newer build gets plain words and no detail** — "created
   by a newer version… install the latest version". Recognised by
   `error.name === 'NewerSchemaVersionError'`, not by class: that error is added by
   #132 (MAIN-B12) in the db layer, and matching the name lets this land before or
   after it with no import between them.
3. **The folder, not the file.** `app.getPath('userData')` is the folder a person
   can find; the database filename changes with #132 (MAIN-B14's `-dev` file), so
   naming the folder stays true either way.
4. **Wiring in `index.js`:** `app.whenReady().then(…).catch(handleStartupFailure)`.
   The handler logs, resolves the folder defensively (a throw there is logged, not
   re-raised), shows `dialog.showErrorBox`, and calls `app.exit(1)` in a `finally`
   so the process exits even if the dialog throws.
5. **Build wiring:** `'main/startupFailure'` Rollup input — CommonJS main leaves the
   `require` external, and without the entry the packaged app crashes on launch
   with exactly the no-window failure this plan exists to remove.
6. **Not in this plan:** Reveal folder / Restore from backup buttons; a failure
   *after* the window exists (none of the steps after `createMainWindow()` can
   throw today); the renderer-side unsaved-work handling on quit.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: full messages compared exactly (`toBe` on the joined lines); the
wiring test asserts dialog-before-exit by source position.

## Blast radius

May create: `electron/main/startupFailure.ts`,
`electron/main/__tests__/startupFailure.test.ts`,
`electron/main/__tests__/startupFailureWiring.test.ts`, this plan. May change:
`electron/main/index.js` (one require, `handleStartupFailure`, one `.catch`),
`electron.vite.config.js` (one Rollup input), the charter row, the notes entry.
**May not** change any existing test.

## Todos

- [x] 1. **Red** — 9 new cases, 9 fail on the old code: `startupFailure.test.ts`
  (5; module missing) · `startupFailureWiring.test.ts` (4 of 4 fail on
  assertions: no `.catch`, no require, no handler, no Rollup input).
- [x] 2. Implement Decisions 1–5.
- [x] 3. The new files plus `lifecycleListeners.test.ts` green, unchanged → 25 / 25.
  Note: Prettier broke `app.whenReady().then(…).catch(…)` across lines, so the
  first wiring pattern (`app\.whenReady\(\)\s*\.then\(`) stopped matching. It
  became one pattern that tolerates line breaks **and** requires the `.catch` to
  hang off the same `whenReady` chain — the same claim, tied tighter; not a
  loosening.
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 643/643 passed`; `format:check` ✓.
- [ ] 5. Manual verification (owed to Ethan; a packaged or dev build):
  (a) quit PresenterPro; replace the library file in the userData folder with a
  text file (keep the real one somewhere safe); launch → "PresenterPro Could Not
  Start" names the folder, OK closes it, nothing is left running in the dock;
  put the real file back → launches normally. (b) Once #132 is in: a library
  with a future schema version shows the "newer version" wording.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact full-message comparisons |
| List sampling designed against | Each message branch (generic, newer build, non-Error, nothing thrown ×3) has its own case |
| Quantifier erosion designed against | "any startup failure" = everything inside the single `whenReady` callback, all covered by one `.catch` (Measured) |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 5 (CommonJS main needs a Rollup input); Decision 4 (`finally` exit); Measured (index.js is tested by source text) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots; no captured screen changes |
| Preconditions for conditional UI | The dialog appears only when startup throws before the window exists |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — nothing is written; the failing library is left untouched |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test edited |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Every branch of `describeStartupFailure` and `describeError` |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | Node environment; source-text reads for `index.js` and the Vite config, as in `lifecycleListeners.test.ts` |
| 9 | Test placement | `electron/main/__tests__/` |
| 10 | Characterization before refactor | N/A — a bug fix; `lifecycleListeners.test.ts` passes unchanged |
