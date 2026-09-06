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
| `presenter-pro/electron/db/migrationRunner.ts` | create |
| `presenter-pro/electron/db/migrations.js` | modify |
| `presenter-pro/electron/db/__tests__/migrationPlanner.test.ts` | create |
| `presenter-pro/electron/db/__tests__/migrationRunner.test.ts` | create |
| `presenter-pro/electron/main/__tests__/lifecycleListeners.test.ts` | modify (guard test) |
| `presenter-pro/electron.vite.config.js` | modify (two rollup inputs) |
| `presenter-pro/vitest.config.mjs` | modify (raise thresholds only) |
| `tasks/phase7-remediation.md` | modify (record outcome) |

**Do NOT modify:** anything under `src/`, `electron/preload/`,
`electron/db/queries/`, `electron/main/index.js`, any other existing test, or
`eslint-suppressions.json`.

Do not create new test directories beyond the one named above.

---

## Design

Same shape as `electron/main/closeController.ts`, which is the established
pattern in this repo: **pure decision code plus a thin shell, with the shell's
dependencies injected so it can be tested with a fake.**

`better-sqlite3` is built for Electron's ABI (121; Node 20 needs 115), so
`new Database()` **throws under Vitest** locally. In CI the gate installs with
`--ignore-scripts`, which leaves the Node prebuilt in place, so the same test
would pass there. Tests therefore must not instantiate `better-sqlite3` in
either environment. Everything is tested through a minimal interface and a fake
that records calls; real SQLite is proven by the E2E launch test (plan P2) and
the manual steps below.

*(Proofread correction — see `fable-notes.md` A1-1/A1-2/A1-3: the original
"baseline and skip" design could strand a database that was missing columns,
file-copying a WAL database is unsafe, and the runner itself had no tests.
All three are fixed by the design below.)*

### Files

| Module | Role | Tested by |
|---|---|---|
| `electron/db/migrationPlanner.ts` | pure: version math, well-formedness | unit |
| `electron/db/migrationRunner.ts` | shell logic against an injected `MigrationDb` interface | unit, with a fake |
| `electron/db/migrations.js` | the migration list + `runMigrations(db)` wiring | guard test + E2E + manual |

### `migrationPlanner.ts` — pure

```ts
export interface Migration {
  version: number;                 // unique, ascending, starts at 1
  name: string;                    // short kebab-case description
  up: (db: MigrationDb) => void;   // idempotent BY INSPECTION (see below)
}

/** Highest recorded version. 0 when none. Input order must not matter. */
export function currentVersion(appliedVersions: number[]): number;

/** Migrations to apply, ascending; never includes an applied version. */
export function selectPendingMigrations(applied: number[], all: Migration[]): Migration[];

/** Throws on duplicate or non-ascending versions, or a version < 1. */
export function assertMigrationsWellFormed(all: Migration[]): void;
```

### `migrationRunner.ts` — injected interface

```ts
/** The subset of better-sqlite3 the runner needs. A fake implements this in tests. */
export interface MigrationDb {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
  transaction<T>(fn: () => T): () => T;
  backup(destinationPath: string): Promise<unknown>;
}

export interface RunOptions {
  backupDir: string;            // where backups are written
  now?: () => Date;             // injected for testable timestamps
  keepBackups?: number;         // default 3
}

export async function runMigrations(db: MigrationDb, migrations: Migration[], opts: RunOptions): Promise<{ applied: number[] }>;
```

Behaviour, in order — **all 6, exhaustive**:
1. `assertMigrationsWellFormed(migrations)`.
2. Ensure `schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
   applied_at INTEGER NOT NULL)`.
3. Read applied versions; compute pending.
4. If pending is empty, return `{ applied: [] }` — **no backup is taken**.
5. Otherwise `await db.backup(<backupDir>/presenterpro.backup-v<current>-<ISO>.db)`
   **before any migration runs**, then prune to the newest `keepBackups`.
6. For each pending migration, inside **one transaction per migration**: call
   `up(db)`, then insert its `schema_migrations` row. A throw aborts that
   transaction, records nothing for it, and propagates. Later migrations do
   not run.

**No bare `catch (_) {}` anywhere.** Errors propagate to `app.whenReady` and
surface; a failed migration must never look like success.

### `migrations.js` — the list

Migration 1, `baseline-schema`, reproduces today's schema **verbatim**, but each
statement is guarded **by inspection, not by exception**:

- `CREATE TABLE IF NOT EXISTS …` for the six tables (already idempotent).
- Each `ALTER TABLE t ADD COLUMN c …` runs only if
  `PRAGMA table_info(t)` does not already list `c`.
- Each `CREATE INDEX IF NOT EXISTS …` (already idempotent).

Because migration 1 is safe to run on any database, **there is no baseline
special case.** A legacy database with no `schema_migrations` table simply runs
migration 1 (which finds every column present and does nothing destructive) and
records it. A fresh database runs the same code and creates everything. One
path, no guessing.

### Sanctioned escape hatch

Exactly one, initially empty. Lives in `migrations.js`:

```js
/**
 * Statements inside an `up` permitted to fail without aborting the migration.
 * Every entry REQUIRES a comment naming the exact error tolerated and why, and
 * must be reported in the final summary. Do not add entries to make something
 * pass — STOP and report instead.
 */
const TOLERATED_STATEMENT_FAILURES = [];
```

---

## Todos

Work these in order. Each names the command that proves it done.

- [x] **1. Write the failing tests first (TDD — complete before todo 2).**
      Two files.

      `electron/db/__tests__/migrationPlanner.test.ts` — **all 9, exhaustive:**
      1. `currentVersion([])` is `0`
      2. `currentVersion([1,2,3])` is `3`
      3. `currentVersion([3,1,2])` is `3`
      4. `selectPendingMigrations` returns ascending by version
      5. it never returns an applied version
      6. it returns `[]` when everything is applied
      7. it handles a gap (applied `[1,3]` → pending includes exactly `2`)
      8. `assertMigrationsWellFormed` throws on duplicate versions
      9. it throws on non-ascending versions

      `electron/db/__tests__/migrationRunner.test.ts` using a **fake
      `MigrationDb`** that records every `exec`/`prepare`/`transaction`/`backup`
      call — **all 8, exhaustive:**
      1. creates `schema_migrations` when absent
      2. applies nothing and takes **no backup** when all versions are applied
      3. takes exactly one backup **before** the first `up` runs (assert call
         order on the fake's log, `toEqual` on the full sequence)
      4. applies pending migrations in ascending order
      5. records each version **after** its `up`, inside the same transaction
      6. a throwing `up` leaves that version unrecorded and propagates the error
      7. later migrations do not run after a failure
      8. prunes backups to the newest 3 (fake filesystem list injected)

      *Verify:* `npx vitest run electron/db/` — must FAIL (modules absent).
      Paste the failure output into your summary as proof of TDD ordering.

      For every comparison, **order, count, and exactness matter**: `toEqual`
      on whole arrays; never `toContain`; never `.sort()` on both sides.

- [x] **2. Implement `migrationPlanner.ts` and `migrationRunner.ts`** to satisfy
      todo 1. No `require('electron')`, no `better-sqlite3`, no `fs` in the
      planner. The runner receives `backupDir` and a `listBackups`/`removeBackup`
      pair via `RunOptions` so pruning is testable — do not read the filesystem
      directly inside the runner.
      *Verify:* same command — 17/17 pass.

- [x] **3. Rewrite `migrations.js`**: migration 1 as described (inspection-
      guarded), `TOLERATED_STATEMENT_FAILURES = []`, and
      `runMigrations(db)` wiring the real `fs` helpers and
      `path.dirname(db.name)` as `backupDir`. Remove all ten `try/catch`.
      *Verify:* `npx eslint electron/db/migrations.js` — zero `no-empty`.

- [x] **4. Add BOTH rollup inputs** in `electron.vite.config.js`
      (`db/migrationPlanner`, `db/migrationRunner`), mirroring
      `main/closeController`. The main process is CommonJS; a relative
      `require` is left external and needs its own entry — **without this the
      packaged app crashes on launch and the build still reports SUCCESS.**
      *Verify:* `npm run build && ls out/db/` shows both `.js` files.

- [x] **5. Guard test.** Extend `lifecycleListeners.test.ts`'s "build wiring"
      block with a test asserting both entries exist in the vite config, and
      that `migrations.js` contains no `catch (_)`.
      *Verify:* `npx vitest run electron/main/__tests__/lifecycleListeners.test.ts`.

- [x] **6. Record the outcome** in `tasks/phase7-remediation.md`: migration
      finding fixed; state the new `no-empty` count (was 11).

- [x] **7. Raise coverage thresholds** in `vitest.config.mjs` to just below the
      new measured floor (`npm run test:coverage`). Never lower one.

- [x] **8. Run the completion gate and report.**
      *Verify:* `npm run gate` — report `type-check`, `lint`, vitest
      `passed/total`, skipped noted.

---

## Manual verification (required — this touches user data)

Perform all four and report each:

1. **Fresh install.** Move `~/Library/Application Support/PresenterPro/presenterpro.db`
   aside. `npm run dev`. App starts; `schema_migrations` has one row (v1).
2. **Existing database.** Restore the real DB. `npm run dev`. All presentations,
   songs, media intact; `schema_migrations` has one row (v1); a backup file was
   written (because v1 was pending on that DB).
3. **Second launch is a no-op.** Quit, relaunch. No new backup, still one row.
4. **Pruning.** Temporarily set `keepBackups` to 1 in a scratch run *or*
   place 4 dummy `presenterpro.backup-*.db` files and relaunch after forcing a
   pending migration in a throwaway copy — confirm only the newest 3 remain.
   If this cannot be exercised safely, say so in the report rather than
   claiming it.

Inspect with:
```bash
sqlite3 ~/Library/Application\ Support/PresenterPro/presenterpro.db \
  "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"
```

---

## Required findings report

1. Gate results (`passed/total`, skipped noted)
2. The todo-1 failure output, proving tests were written first
3. Every `TOLERATED_STATEMENT_FAILURES` entry added, with justification — must
   be empty unless reported
4. Any file changed outside the blast radius, even if justified
5. The result of each of the four manual steps
6. Any suspected pre-existing regression discovered but NOT fixed

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause verbatim above; todo 1 states order/count/exactness for every comparison |
| List sampling designed against | Todo 1 enumerates **9 + 8 = 17** cases as counted, exhaustive checklists; runner behaviour is a counted list of 6 |
| Quantifier erosion designed against | Whole-array `toEqual` on the fake's call log; `assertMigrationsWellFormed` iterates the whole list |
| Sanctioned escape hatch | `TOLERATED_STATEMENT_FAILURES`, initially empty, entries require justification + report |
| Bounded blast radius | Nine-file table above, with an explicit do-not-touch list |
| File-specific pitfall notes | Electron-ABI native-module trap (and why CI differs); the CommonJS rollup-entry trap (todo 4, two entries); WAL-unsafe file copy replaced by `db.backup()` |
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
| 4 | Coverage floor | 17 cases across the planner's 3 functions and the runner's 6 behaviours |
| 5 | Lint floor | No `.only`/`.skip`/assertion-free/conditional-expect; todo 3 verifies `no-empty` is clean |
| 6 | Snapshot discipline | `N/A — no snapshots` |
| 7 | Completion gate | Todo 8 runs `npm run gate` and reports passed/total |
| 8 | Vitest/jsdom mechanics | Node environment; `better-sqlite3` never instantiated — runner tested via injected fake; no store or DOM involved |
| 9 | Test placement | `electron/db/__tests__/` per the placement table |
| 10 | Characterization before refactor | Migration 1 reproduces today's schema **verbatim** and is inspection-guarded; manual step 2 proves an existing DB is untouched |
