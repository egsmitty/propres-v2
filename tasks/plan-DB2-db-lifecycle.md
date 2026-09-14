# Executable Plan DB2 — Database lifecycle: seed, quit, schema guard, dev DB, import scan

**Source:** audit items **MAIN-B10, MAIN-B11, MAIN-B12, MAIN-B14, MAIN-B15**.

> **Superseded in part (2026-09-14, at merge with `main` @ `87b277e`).** MAIN-B10
> was closed by S1 (#125), whose rewritten `seed()` in `index.js` already runs
> in one `db.transaction` and seeds only public-domain content. Decision 1,
> Decision 6, Todos 5–6 and the `db/seed` part of Todo 10 are **withdrawn**:
> `electron/db/seed.js`, `seed.test.ts` and the `db/seed` Rollup input were
> removed at merge, because the extracted file still carried the copyrighted
> sample songs S1 removed. The text below is kept as written for the record;
> see "Merge with S1" at the end.

Written per `.cursor/rules/writing-executable-plans.mdc`. No prior plan touches
these five; `plan-A1-versioned-migrations.md`, `plan-A4-real-sqlite-tests.md`
and `plan-C1-lifecycle-robustness.md` establish the patterns reused here
(fake-`MigrationDb` unit tests, real-SQLite behavioural tests, and
text-pinning tests of `electron/main/index.js`, which cannot be imported in
Vitest because it calls `electron` APIs at module scope).

## Measured (2026-09-14, `main` @ `359d37f`)

**MAIN-B10.** `seed(db)` in `electron/main/index.js` (508–636) does an
uninterrupted sequence of `songQueries.createSong` × 3,
`presentationQueries.createPresentation` × 1, then a raw
`INSERT INTO settings ... 'initialized'` — no `db.transaction(...)` anywhere in
the function. A crash between any two of those five writes (disk full, `kill
-9`, power loss) leaves orphaned song/presentation rows with `initialized`
never set, so the next launch reseeds on top of them — confirmed present.

**MAIN-B11.** `electron/main/index.js` registers exactly five `app.on(...)`
listeners (`second-instance`, `child-process-gone`, `before-quit`,
`window-all-closed`, `activate` — confirmed by `grep -n "app.on("`); there is
no `will-quit` listener and `electron/db/index.js` exports only `getDb`, no
close/checkpoint. WAL + SHM files are left on disk at every quit — confirmed
present.

**MAIN-B12.** `runMigrations` in `electron/db/migrationRunner.ts` computes
`appliedVersions` and immediately calls `selectPendingMigrations`; nothing
compares the database's recorded version against the highest version in the
`migrations` list. A `schema_migrations` row above version 5 (the current
`MIGRATIONS.length`) makes `pending` empty, so the function returns
`{ applied: [], backupPath: null }` and the caller proceeds as if nothing were
wrong — confirmed present, reproduced with a fake `MigrationDb` reporting
`appliedVersions: [1,2,3,4,5,6]`.

**MAIN-B14.** `electron/db/index.js`'s `getDb()` always resolves
`path.join(app.getPath('userData'), 'presenterpro.db')` — no branch on
`app.isPackaged`. `npm run dev` and the packaged app read/write the same file
— confirmed present.

**MAIN-B15.** `electron/main/index.js`'s `media:import` handler (1146–1179)
calls, inside the per-file `flatMap`, `mediaQueries.getMedia(db)` — which runs
`SELECT * FROM media ORDER BY created_at DESC` and returns every row — then
`.find(item => item.canonical_path === canonicalPath)` in JS. `media:pick`
(1180–1216) does the same once. An index the lookup could use,
`idx_media_canonical_path`, already exists (`migrationList.ts` line 106,
migration 1) — confirmed present; only the query needs to change, no new
migration.

## Decisions

1. **MAIN-B10.** Extract `seed(db)` (and its only helper, `generateId`) out of
   `index.js` into a new file, `electron/db/seed.js` (CommonJS, no `electron`
   import — same reason `queries/*.js` live there: it becomes unit-testable
   without loading Electron). The literal `songs` array stays built inside the
   function exactly as today (unchanged per-call `generateId()` semantics);
   only the five writes below it move inside one
   `db.transaction(() => { ... })()`, matching the existing idiom in
   `queries/presentations.js`'s `deletePresentation`.
2. **MAIN-B11.** Add `getDbPath` (pure) and `closeDb` (guarded, error-swallowing)
   to `electron/db/index.js`. `closeDb` runs `db.pragma('wal_checkpoint(TRUNCATE)')`
   then `db.close()` inside try/catch, logs and returns on error, and is a
   no-op on a second call (module-level `closed` flag) or if `db` was never
   opened. Wire `app.on('will-quit', () => closeDb())` in `index.js`.
3. **MAIN-B12.** Add `NewerSchemaVersionError` (named `Error` subclass) to
   `migrationRunner.ts`. Immediately after `appliedVersions` is computed —
   before the `pending.length === 0` early return, before any backup or
   migration — compute `dbVersion = currentVersion(appliedVersions)` and
   `highestKnownVersion = currentVersion(migrations.map(m => m.version))`;
   throw when `dbVersion > highestKnownVersion`. The message contains the
   literal phrase "created by a newer version of PresenterPro" so a future
   MAIN-B1 dialog can string-match it if it chooses not to depend on the
   class. No UI, no catch anywhere — this plan only makes the runner refuse.
4. **MAIN-B14.** `getDb()` resolves the filename through a new pure function
   `resolveDbFileName(isPackaged)` → `'presenterpro.db'` when packaged,
   `'presenterpro-dev.db'` when not — combined with the userData directory by
   `getDbPath(userDataDir, isPackaged)`. Both exported and pure (no `electron`
   touched), so testable by direct `require` even though the same file also
   does `const { app } = require('electron')` at the top (that line is inert
   under plain Node — `require('electron')` outside the Electron binary
   resolves to a path string, so destructuring `app` yields `undefined`, and
   nothing at module scope calls it).
5. **MAIN-B15.** Add `findMediaByCanonicalPath(db, canonicalPath)` to
   `electron/db/queries/media.js`:
   `db.prepare('SELECT * FROM media WHERE canonical_path = ?').get(canonicalPath)`
   (uses `idx_media_canonical_path`; `.get`, not `.all` + `.find`, since
   `canonical_path` lookups are 0-or-1). Replace both `mediaQueries.getMedia(db).find(...)`
   call sites in `index.js` (`media:import`, `media:pick`) with it.
6. New file `electron/db/seed.js` needs its own Rollup input
   (`db/seed`) in `electron.vite.config.js` — the main process is CommonJS and
   a `require('./seed')` with no entry crashes the packaged app on launch, the
   same failure mode `nativeMenu.ts`/`closeController.ts` document.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record
it as a suspected regression._

Comparisons: fake-`MigrationDb` call logs (`migrationRunner.test.ts` style) are
**exact, ordered** arrays — order is the point (proves "before any backup").
Real-SQLite tests (`realSqlite.queries.test.ts`, `realSqlite.migrations.test.ts`
style) assert exact row counts/values, never `toContain` where one row is
meant. Text-pinning tests of `index.js` assert **exact substrings/regexes**,
never a loosened "contains something like".

## Blast radius

May change: `electron/db/seed.js` (new), `electron/db/index.js`,
`electron/db/migrationRunner.ts`, `electron/db/queries/media.js`,
`electron/main/index.js` (imports at top; delete `generateId`/`seed`
definitions 502–636; replace the two `mediaQueries.getMedia(db).find(...)`
call sites; add one `app.on('will-quit', ...)` listener near the existing
lifecycle listeners), `electron.vite.config.js` (one new Rollup input), the
new test files below, this plan, the `fable-pass-plan.md` status row, the
`fable-notes.md` entry. **May not** change: the output/stage window code in
`index.js` (other PRs are changing it), `migrationRunner.test.ts`'s existing
cases, `migrationList.ts`, any existing query-module test.

## Todos

- [x] 1. **Red:** `electron/db/__tests__/migrationRunner.test.ts` — two new
      cases: (a) a fake reporting `appliedVersions: [1,2,3,4,5,6]` against
      `migrations = [1..5]` throws `NewerSchemaVersionError` whose message
      contains "created by a newer version of PresenterPro", **and the fake's
      log is exactly `[]`** (proves it happened before backup/migration); (b)
      `dbVersion === highestKnownVersion` (`[1,2]` vs `[1,2]`) does **not**
      throw. → run, confirm both fail on current code (case a: no such export;
      case b already passes today as a sanity check, so it's asserted but not
      counted as a red case).
- [x] 2. Implement Decision 3 in `migrationRunner.ts`. Verify:
      `npx vitest run electron/db/__tests__/migrationRunner.test.ts` → all
      pass, including the 8 pre-existing cases unchanged.
- [x] 3. **Red:** `electron/db/__tests__/realSqlite.migrations.test.ts` — one
      new case in a new `describe`: seed a real in-memory DB already migrated
      to v5, hand-insert a `schema_migrations` row for version 6, then call
      `runMigrations` again and assert it throws `NewerSchemaVersionError`. →
      run, confirm it fails (module has no such export yet).
- [x] 4. Verify todo 3's case now passes (same implementation as todo 2 — no
      separate code change). `npx vitest run electron/db/__tests__/realSqlite.migrations.test.ts`.
- [x] 5. **Red:** new `electron/db/__tests__/seed.test.ts` (real SQLite, per
      `helpers/realDb.ts`'s `openMigratedMemoryDb`) — import
      `{ seed } from '../seed'` (module does not exist yet, so this fails to
      resolve): (a) seeds 3 songs + 1 presentation + `initialized='true'` on an
      empty db; (b) is a no-op when `initialized` is already `'true'`; (c) an
      `INSERT INTO songs` that throws on its 2nd call leaves **zero** rows in
      `songs`, `presentations`, and `settings` — proving the whole seed is one
      transaction, not partial. Patches `db.prepare` on the real instance
      (CommonJS `require`-based module mocking proved unreliable for
      `seed.js`/`queries/songs.js` in this codebase — no existing test in
      `electron/` uses `vi.mock` on a local module, and a spike confirmed it
      does not intercept these `require()` call sites), which also exercises
      real better-sqlite3 rollback rather than a mocked one. → run, confirm
      all 3 fail (no `../seed` module).
- [x] 6. Implement Decision 1: create `electron/db/seed.js` (moved verbatim
      body + `db.transaction` wrapper per Decision 1), delete the extracted
      block (502–636) from `index.js`, add
      `const { seed } = require('../db/seed');` near the other `db/queries/*`
      requires. Add the `db/seed` Rollup input (Decision 6). Verify: todo 5's
      3 cases pass.
- [x] 7. **Red:** new `electron/db/__tests__/index.test.ts` — direct
      `require('../index')` (safe: no top-level `electron` calls in this
      file, only inside `getDb`/`closeDb`), covering the exports that don't
      exist yet: (a) `resolveDbFileName(true) === 'presenterpro.db'`; (b)
      `resolveDbFileName(false) === 'presenterpro-dev.db'`; (c)
      `getDbPath('/x/userData', true)` and `getDbPath('/x/userData', false)`
      join to the two names above (`path.join`, so assert with `path.join`
      too — not a hand-typed separator, for Windows correctness); (d)
      `closeDb` is exported and is a function. → run, confirm all 4 fail
      (exports don't exist).
- [x] 8. **Red (same file, `describe('closeDb')`):** with a fake db object
      `{ pragma: vi.fn(), close: vi.fn() }` injected via a **new** exported
      `__setDbForTesting` seam (module-private `db` variable has no other way
      in) — (a) first call runs `pragma('wal_checkpoint(TRUNCATE)')` then
      `close()`, in that order; (b) a second call does nothing more (call
      counts unchanged); (c) when `pragma` throws, `closeDb` does not throw
      and still calls `close()` is NOT required (checkpoint failed — closing
      an inconsistent handle is not obviously safe) but the function must
      swallow the error and return normally — assert `console.error` was
      called once and the function returned `undefined` without throwing. →
      run, confirm all 3 fail (no such exports).
- [x] 9. Implement Decisions 2 and 4 in `electron/db/index.js`
      (`resolveDbFileName`, `getDbPath`, `closeDb`, the test-only
      `__setDbForTesting` seam, and switching `getDb()` to use
      `getDbPath(app.getPath('userData'), app.isPackaged)`). Verify: todos 7–8
      pass.
- [x] 10. **Red:** `electron/main/__tests__/lifecycleListeners.test.ts` — add
      (do not edit existing rows) one case to `REQUIRED_APP_LISTENERS`:
      `{ event: 'will-quit', why: 'checkpoints WAL and closes the DB handle so a quit never leaves -wal/-shm files behind (MAIN-B11)' }`;
      and one new `it` asserting `MAIN_SOURCE` contains `closeDb()` inside a
      `will-quit` handler
      (`/app\.on\('will-quit',[\s\S]{0,120}closeDb\(\)/`). Also add one new
      `it` in the `build wiring` describe: `electron.vite.config.js` contains
      `"'db/seed'"`. → run, confirm the three new assertions fail (listener
      absent, seed entry absent).
- [x] 11. Implement Decision 2's wiring: `const { getDb, closeDb } = require('../db/index');`
      and `app.on('will-quit', () => { closeDb(); });` placed with the other
      `app.on(...)` registrations in `index.js`. Verify: todo 10 passes, and
      the file's 9 pre-existing cases in this file still pass unchanged.
- [x] 12. **Red:** `electron/db/__tests__/realSqlite.queries.test.ts` — one
      new case in the existing `describe('media and folders')` block (an
      addition, not a modification of any existing case): create two media
      rows with different `canonical_path`s,
      `findMediaByCanonicalPath(db, thatPath)` returns the matching row, and
      `findMediaByCanonicalPath(db, 'does-not-exist')` returns `undefined`
      (matches `better-sqlite3`'s `.get()` contract — never coerced to
      `null`). → run, confirm it fails (export does not exist).
- [x] 13. Implement Decision 5 in `electron/db/queries/media.js`. Verify: todo
      12 passes, and the 6 pre-existing cases in that `describe` block pass
      unchanged.
- [x] 14. **Red:** `electron/main/__tests__/lifecycleListeners.test.ts` — one
      more new `it`: within the `media:import` and `media:pick` handler
      bodies, `MAIN_SOURCE` no longer contains
      `mediaQueries.getMedia(db)` immediately followed by `.find(` (regex
      anchored to each handler's text slice — extract the handler body
      between its `ipc.handle('media:import'` / `'media:pick'` marker and the
      next `ipc.handle(` — and assert `findMediaByCanonicalPath(` appears in
      each instead). → run, confirm it fails on current code.
- [x] 15. Implement Decision 5's index.js call-site change (both handlers):
      `mediaQueries.findMediaByCanonicalPath(db, canonicalPath)` replacing the
      `getMedia(db).find(...)` pair. Verify: todo 14 passes.
- [x] 16. `npm run gate` and `npm run format:check`, both from `presenter-pro/`.
      Every pre-existing test file touched by this plan (`migrationRunner.test.ts`,
      `realSqlite.migrations.test.ts`, `realSqlite.queries.test.ts`,
      `lifecycleListeners.test.ts`) passes with its original case count plus
      only the new cases added above — no existing case's assertion changed.
- [ ] 17. Manual verification — **not done by this session** (standing rule:
      no local app launch while Ethan is at the machine): (a) `npm run dev`
      twice in a row shows an empty library the first time and the same
      empty-then-seeded library the second (proves the `-dev` suffix and
      `initialized` guard both work); (b) quitting the app and checking the
      profile's `userData` directory shows no `presenterpro.db-wal` /
      `presenterpro.db-shm` files after quit; (c) importing the same file
      twice through Media Library does not create a duplicate row. Listed in
      the PR for Ethan.
- [ ] 18. Findings report in the PR body, including the MAIN-B14 dev-library
      note required by the task brief (dev DB starts empty the day this
      lands; existing dev data stays at the old shared path and can be copied
      over once).

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exactness stated under Decisions/Comparisons |
| List sampling designed against | N/A — no prose enumeration of a large N; each of the 5 items gets its own numbered decision and todos |
| Quantifier erosion designed against | N/A — no "every X" claim in this plan's scope; the one existing exhaustive list touched (`REQUIRED_APP_LISTENERS`) gains a row, verified by `it.each` over the whole table as already written |
| Sanctioned escape hatch | N/A — no allowlist needed |
| Bounded blast radius | Blast radius section; output/stage window code named out of scope |
| File-specific pitfall notes | Decision 4 (`require('electron')` is inert outside Electron, so `db/index.js` is directly importable); Decision 6 (missing Rollup input crashes packaged app) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1–16 each name their command |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — no UI in this plan |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no `ipcMain`/`ipcRenderer` channel added, changed, or renamed; `media:import`/`media:pick` keep their existing request/response shape, only the internal lookup changes |
| Manual verification steps | Todo 17 |
| Required findings report | Todo 18, including the MAIN-B14 dev-library note the task brief requires |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todos 1/3/5/7/8/10/12/14 red before their matching implementation todo |
| 2 | Behavior-change test edits | N/A — no existing test's assertions are modified; every addition is a new `it`/`describe` or a new file |
| 3 | No weakened assertions | Clause verbatim; exact arrays/regex/values throughout |
| 4 | Coverage floor | At least one case per new function: `NewerSchemaVersionError` (2 cases + 1 real-SQLite), `seed` (3 cases), `resolveDbFileName`/`getDbPath` (4 cases), `closeDb` (3 cases), `findMediaByCanonicalPath` (2 cases), plus 3 index.js wiring cases |
| 5 | Lint floor | No `.only`/`.skip`; every new `it` asserts; no `expect` inside `if`/`catch` (todo 5c and todo 8c capture-then-assert per the mechanics doc) |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 16 |
| 8 | Vitest / jsdom mechanics | No DOM involved (no jsdom header needed); no Zustand store touched; no `electron` import in any new test — `db/index.js`, `db/seed.js`, `db/migrationRunner.ts`, `db/queries/media.js` are all electron-free; `better-sqlite3` used only in the `realSqlite.*` files per the established A4 exception (real behavioural proof), fakes used everywhere else |
| 9 | Test placement | `electron/db/__tests__/migrationRunner.test.ts` (existing), `electron/db/__tests__/realSqlite.migrations.test.ts` (existing), `electron/db/__tests__/realSqlite.queries.test.ts` (existing), `electron/db/__tests__/seed.test.ts` (new), `electron/db/__tests__/index.test.ts` (new), `electron/main/__tests__/lifecycleListeners.test.ts` (existing) — all match the Test placement table (`Electron main / IPC contract` → `electron/main/__tests__/`; db modules have no dedicated row, so they follow the established sibling pattern in `electron/db/__tests__/`) |
| 10 | Characterization before refactor | N/A — `seed`'s extraction is a same-behavior move (todo 5's cases a/b pin exact seeded output before AND after, todo 5c is new coverage for behavior the old code never had, not a changed assertion on old behavior) |

## Review

All five items were still present on `main` at measurement time and all five
are fixed. One deviation from the plan, both recorded inline where they
happened:

- **Todo 5 (MAIN-B10 rollback test).** `vi.mock`/`vi.spyOn` on the CJS
  `queries/songs` module did not intercept `seed.js`'s `require()` call —
  confirmed by a spike (the mocked implementation was simply never invoked,
  `thrown` stayed `undefined`). No test anywhere in `electron/` uses
  `vi.mock` on a local module, which in hindsight was the tell. Switched to
  patching `db.prepare` on the real `better-sqlite3` instance instead: the
  second `INSERT INTO songs` throws, and the assertions are unchanged from
  the plan (zero rows in `songs`/`presentations`/`settings` after rollback).
  This is arguably a stronger proof than the planned approach — it exercises
  real `better-sqlite3` rollback semantics end to end rather than a mocked
  transaction wrapper.
- Everything else matched the plan as written: `NewerSchemaVersionError` in
  `migrationRunner.ts`, `seed.js` extracted with its five writes in one
  `db.transaction(...)`, `getDbPath`/`resolveDbFileName`/`closeDb` in
  `electron/db/index.js`, `will-quit` wired to `closeDb()`, and
  `findMediaByCanonicalPath` replacing the two `getMedia(db).find(...)`
  scans.

**Red-first counts:** 20 new cases across `migrationRunner.test.ts` (+2),
`realSqlite.migrations.test.ts` (+1), `seed.test.ts` (+3, new file),
`index.test.ts` (+8, new file — `resolveDbFileName`/`getDbPath`/`closeDb`),
`realSqlite.queries.test.ts` (+1), `lifecycleListeners.test.ts` (+5: the
`will-quit` listener row, the `closeDb()` wiring assertion, the `db/seed`
rollup-entry check, and the `media:import`/`media:pick` canonical-path
wiring checks). **18 of 20 failed on the code as measured on `main`**; the
other 2 passed immediately on first run as deliberate non-regression sanity
checks rather than red cases — `dbVersion === highestKnownVersion` does not
throw (migrationRunner.test.ts), and the `db/seed` rollup entry (added in
todo 6, before the wiring-check test in todo 10 existed) — both noted inline
in their todos. All pre-existing cases in every touched file passed
unchanged both before and after.

**Gate:** `type-check ✓ · lint ✓ · vitest 612/612 passed (0 skipped)`.
`npm run format:check` passes (two new test files needed one
`prettier --write` pass before the final gate run — recorded, not hidden).

**Findings:**
- **MAIN-B14 dev-library note for Ethan:** the day this PR lands, `npm run
  dev` starts reading/writing `presenterpro-dev.db` instead of
  `presenterpro.db` in the same `userData` directory — so the first `npm run
  dev` after this merges shows an empty library (seeded fresh), and whatever
  you were using for local dev before now sits untouched at the old shared
  path. If you want that data back under dev, copy
  `<userData>/presenterpro.db` (and its `-wal`/`-shm` siblings, if present)
  to `<userData>/presenterpro-dev.db` once. The packaged app's data file and
  path are unchanged.
- No suspected regressions found. No allowlist/exemption entries were added
  (none were needed). No snapshots exist in this plan's scope.
- `idx_media_canonical_path` already existed (migration 1) — MAIN-B15 needed
  only the query change, no new migration, confirming the audit note.
- MAIN-B12 deliberately adds no catch anywhere and no UI — `runMigrations`'s
  caller in `index.js` is untouched, so a newer-schema database now crashes
  app startup loudly (as every other migration failure already does) instead
  of silently proceeding. The startup dialog is MAIN-B1's job, not this
  plan's.

## Merge with S1 (2026-09-14)

Merging `main` @ `87b277e` (S1, #125) conflicted in `electron/main/index.js`:
this branch had deleted `seed()`; S1 had rewritten it. Resolution:

- **Kept main's `seed()`** (S1's public-domain `firstRunSeed.ts` content,
  already in one `db.transaction`, which closes MAIN-B10).
- **Removed** `electron/db/seed.js`, `electron/db/__tests__/seed.test.ts`, the
  `db/seed` Rollup input, `require('../db/seed')`, and the "emits db/seed"
  case this plan added to `lifecycleListeners.test.ts`. Keeping `seed.js`
  would have re-shipped the copyrighted sample songs in a new file with no
  conflict to warn anyone — the reason #132 was held as a draft.
- **Kept** MAIN-B11, B12, B14, B15 exactly as implemented.

**Counts after the merge:** 16 new cases (20 minus `seed.test.ts`'s 3 and the
`db/seed` check), **15 red** on `main` as measured; the equal-version case
stays a sanity check. No other test changed.
