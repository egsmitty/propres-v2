# Executable Plan A1 — Versioned Database Migrations

**Workstream:** A (Data safety) · **Stage:** A1, the prerequisite for A2
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

Written per `.cursor/rules/writing-executable-plans.mdc`. Ends with a complete
Compliance Manifest.

---

## Why this is first

Workstream A2 (autosave + crash-recovery journal) needs a new table. Adding one
under the current scheme means appending another `try {} catch (_) {}` to a file
that already has ten of them. A2 therefore cannot ship safely until migrations
are versioned. **Do A1 before A2.**

## The problem, precisely

`presenter-pro/electron/db/migrations.js` runs `CREATE TABLE IF NOT EXISTS` for
six tables, then applies ten schema changes shaped like:

```js
try {
  db.exec('ALTER TABLE songs ADD COLUMN song_order TEXT');
} catch (_) {}
```

Three defects, all load-bearing:

1. **Every error is swallowed identically.** "Column already exists" (expected)
   is indistinguishable from "database is locked", "disk full", or "file
   corrupt". A genuinely failed migration reports success.
2. **No version is recorded.** Nothing can know what state a database is in, so
   migrations cannot be reordered, removed, or reasoned about.
3. **Schema-only.** Data transforms are impossible. This is why
   `default_background_id` was never backfilled on existing rows — the symptom
   already recorded in `CLAUDE.md` "Known Issues".

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

**You may create or modify only these files:**

| File | Action |
|---|---|
| `presenter-pro/electron/db/migrationPlanner.ts` | create |
| `presenter-pro/electron/db/migrations.js` | modify |
| `presenter-pro/electron/db/__tests__/migrationPlanner.test.ts` | create |
| `presenter-pro/electron.vite.config.js` | modify (add rollup input) |
| `tasks/phase7-remediation.md` | modify (record outcome) |

**Do NOT modify:** anything under `src/`, `electron/main/`, `electron/preload/`,
`electron/db/queries/`, any existing test, `eslint-suppressions.json`, or the
coverage thresholds in `vitest.config.mjs` — except as todo 7 directs.

Do not create new test directories beyond the one named above.

---

## Design

Same shape as `electron/main/closeController.ts`, which is the established
pattern in this repo: **a pure decision module plus a thin imperative shell.**

`better-sqlite3` is a native module rebuilt for Electron's ABI and **must not be
imported in a unit test** (see `.cursor/rules/testing-standards.mdc`
"Mechanics"). So all logic that can be tested lives in the pure planner; the
shell that actually touches SQLite is kept as small as possible and verified
manually.

### `migrationPlanner.ts` — pure, fully tested

```ts
export interface Migration {
  version: number;      // unique, ascending, starts at 1
  name: string;         // short kebab-case description
  sql: string[];        // statements applied in order, in one transaction
}

/** Highest version already recorded as applied. 0 when none. */
export function currentVersion(appliedVersions: number[]): number;

/**
 * Migrations to apply, ascending. Never returns an already-applied version.
 */
export function selectPendingMigrations(
  appliedVersions: number[],
  migrations: Migration[]
): Migration[];

/**
 * A pre-existing database created before versioning existed. Detected by the
 * presence of legacy tables with no schema_migrations table. Returns the
 * version to baseline it at, or null when this is a fresh database.
 */
export function detectBaselineVersion(
  existingTableNames: string[],
  migrations: Migration[]
): number | null;

/** Fails fast on a malformed migration list — duplicate or non-ascending versions. */
export function assertMigrationsWellFormed(migrations: Migration[]): void;
```

### The baseline problem — read this before writing code

An **existing** user database already has all ten historical schema changes
applied, but no `schema_migrations` table. If the runner naively applies
migration 1 to it, `CREATE TABLE` is harmless but any future data migration
would re-run and could corrupt data.

Rule: if `schema_migrations` is absent **and** legacy tables exist (`songs`,
`presentations`, …), the database is baselined — record every migration up to
and including the one representing today's schema as already applied, without
executing it. If `schema_migrations` is absent and there are no legacy tables,
it is a fresh install: apply everything from version 1.

### `migrations.js` — thin shell

1. Ensure `schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
   applied_at INTEGER NOT NULL DEFAULT (unixepoch()))`.
2. Read applied versions.
3. If empty, call `detectBaselineVersion`; when non-null, insert baseline rows
   and return without executing SQL.
4. `selectPendingMigrations` → for each, **inside a single transaction**: run its
   statements, then insert its `schema_migrations` row.
5. Before applying **any** pending migration, copy the database file to
   `presenterpro.backup-v<currentVersion>-<ISO timestamp>.db` in the same
   directory. Keep the newest 3 backups; delete older ones.
6. Errors propagate. **No bare `catch (_) {}` anywhere in this file.**

Migration 1 is named `baseline-schema` and contains the current schema exactly
as it exists today — the six `CREATE TABLE IF NOT EXISTS` statements plus the
ten `ALTER TABLE` / `CREATE INDEX` statements, in their current order, with the
`try/catch` wrappers removed.

### Sanctioned escape hatch

Exactly one, and it starts empty:

```ts
/**
 * Statements permitted to fail without aborting their migration. Every entry
 * REQUIRES a comment naming the exact error it tolerates and why.
 * Adding an entry must be reported in the final summary.
 */
export const TOLERATED_STATEMENT_FAILURES: ReadonlyArray<{
  version: number;
  statement: string;
  reason: string;
}> = [];
```

Do not add entries to make something pass. If you believe one is needed, STOP
and report it.

---

## Todos

Work these in order. Each names the command that proves it done.

- [ ] **1. Write the failing tests first (TDD — this todo must be completed
      before todo 2).** Create
      `presenter-pro/electron/db/__tests__/migrationPlanner.test.ts` covering
      **all 12 of the following — this list is exhaustive:**
      1. `currentVersion([])` is `0`
      2. `currentVersion([1, 2, 3])` is `3`
      3. `currentVersion([3, 1, 2])` is `3` (order of input must not matter)
      4. `selectPendingMigrations` returns migrations ascending by version
      5. it never returns an already-applied version
      6. it returns `[]` when everything is applied
      7. it handles a gap (applied `[1, 3]`, pending must include `2`)
      8. `detectBaselineVersion` returns `null` for a fresh DB (no legacy tables)
      9. it returns the newest migration version when legacy tables exist
      10. `assertMigrationsWellFormed` throws on duplicate versions
      11. it throws on non-ascending versions
      12. `TOLERATED_STATEMENT_FAILURES` is empty
      *Verify: `npx vitest run electron/db/__tests__/migrationPlanner.test.ts`
      — must FAIL (module does not exist yet). Paste the failure output into
      your summary as proof of TDD ordering.*

      For every comparison above, **order and count and exactness all matter**:
      use `toEqual` on the full array, never `toContain`, never `.sort()` on
      both sides. Where a test iterates a list, assert its `length` too, so
      under-implementation fails rather than passing quietly.

- [ ] **2. Implement `presenter-pro/electron/db/migrationPlanner.ts`** to satisfy
      todo 1. Pure module: no `require('electron')`, no `better-sqlite3`, no
      filesystem access.
      *Verify: same command — must now PASS, 12/12.*

- [ ] **3. Rewrite `presenter-pro/electron/db/migrations.js`** as the thin shell
      described above, with migration 1 (`baseline-schema`) carrying today's
      schema verbatim and no `try/catch` wrappers.
      *Verify: `npx eslint electron/db/migrations.js` reports zero `no-empty`.*

- [ ] **4. Add the rollup input** for the new module in
      `presenter-pro/electron.vite.config.js`, mirroring the existing
      `main/closeController` entry. The main process is CommonJS, so a relative
      `require` is left external and needs its own entry — **without this the
      packaged app crashes on launch with "Cannot find module", and the build
      still reports SUCCESS.**
      *Verify: `npm run build && ls out/db/` shows `migrationPlanner.js`.*

- [ ] **5. Add the backup-before-migrate step** (newest 3 retained).
      *Verify: covered by the manual steps in todo 8 — no unit test may import
      `better-sqlite3`.*

- [ ] **6. Record the outcome** in `tasks/phase7-remediation.md`: mark the
      migration finding fixed, and note that the ten swallowed `catch (_) {}`
      blocks in this file are now gone (they are part of the `no-empty` count of
      11 — state the new count).

- [ ] **7. Raise the coverage thresholds** in `presenter-pro/vitest.config.mjs`
      to the new measured floor. Run `npm run test:coverage`, read the actual
      numbers, and set thresholds just below them. Never lower a threshold.

- [ ] **8. Run the completion gate and report.**
      *Verify: `npm run gate` — report `type-check`, `lint`, and vitest
      `passed/total`, noting skipped counts.*

---

## Manual verification (required — this touches user data)

A green gate is necessary but **not sufficient**; this changes how an existing
database is opened. Perform all four and report the result of each:

1. **Fresh install.** Move `~/Library/Application Support/PresenterPro/presenterpro.db`
   aside. `npm run dev`. App starts, creates a new DB, `schema_migrations`
   contains every migration.
2. **Existing database (the important one).** Restore the real DB. `npm run dev`.
   App starts, all existing presentations, songs, and media are intact, and
   `schema_migrations` shows baseline rows — **no migration SQL was executed**.
3. **Backup created.** Confirm a `presenterpro.backup-*.db` appears only when a
   migration actually runs, and that only the newest 3 are kept.
4. **Second launch is a no-op.** Quit and relaunch. No new backup, no re-applied
   migrations.

Inspect with:
```bash
sqlite3 ~/Library/Application\ Support/PresenterPro/presenterpro.db \
  "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"
```

---

## Required findings report

End your summary with:

1. Per-package gate results (`passed/total`, skipped noted)
2. The todo-1 failure output, proving tests were written first
3. Every `TOLERATED_STATEMENT_FAILURES` entry added, with justification — the
   list must be empty unless you report otherwise
4. Any file changed outside the blast radius, even if justified
5. The result of each of the four manual steps
6. Any suspected pre-existing regression discovered but NOT fixed

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause verbatim above; todo 1 states order/count/exactness for every comparison |
| List sampling designed against | Todo 1 enumerates **all 12** cases as a counted, exhaustive checklist |
| Quantifier erosion designed against | Tests assert array `length` alongside contents; `assertMigrationsWellFormed` iterates the whole list |
| Sanctioned escape hatch | `TOLERATED_STATEMENT_FAILURES`, initially empty, entries require justification + report |
| Bounded blast radius | Five-file table above, with an explicit do-not-touch list |
| File-specific pitfall notes | Native-module ban; the CommonJS rollup-entry trap (todo 4); the baseline problem called out before implementation |
| Exact paths, no improvisation | Every file given in full; "do not create new test directories" |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | `N/A — no snapshots in this plan` |
| Preconditions for conditional UI | `N/A — no UI in this plan` |
| Structural floor under snapshots | `N/A — no snapshots` |
| IPC contract pinning | `N/A — no IPC channel touched` |
| Manual verification steps | Four steps, all required, results reported |
| Required findings report | Six-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (tests, must fail) strictly precedes todo 2; failure output required as proof |
| 2 | Behavior-change test edits | `N/A — no existing test is modified` |
| 3 | No weakened assertions | Anti-weakening clause verbatim; `toEqual` mandated, `toContain` and `.sort()` forbidden |
| 4 | Coverage floor | 12 cases across 4 exported functions |
| 5 | Lint floor | No `.only`/`.skip`/assertion-free/conditional-expect; todo 3 verifies `no-empty` is clean |
| 6 | Snapshot discipline | `N/A — no snapshots` |
| 7 | Completion gate | Todo 8 runs `npm run gate` and reports passed/total |
| 8 | Vitest/jsdom mechanics | Node environment; `better-sqlite3` explicitly banned from unit tests; no store or DOM involved |
| 9 | Test placement | `electron/db/__tests__/` per the placement table |
| 10 | Characterization before refactor | Migration 1 reproduces today's schema **verbatim**; manual step 2 proves an existing DB is untouched |
