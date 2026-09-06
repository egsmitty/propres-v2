# Executable Plan A4 — Real-SQLite unit tests for the database layer

**Workstream:** A (Data safety — its "rules" line: coverage in the paths everything touches)
**Depends on:** U1 (better-sqlite3 13 is N-API: one binary loads under Node 22 and Electron 44, so unit tests may instantiate it).
**Category:** tests only. No production file changes.

## Why

Until U1 the database layer could only be unit-tested through injected fakes
that pin SQL _text_. Those tests are kept — they catch a changed statement —
but they cannot prove a statement _does_ what its text says. Four things are
currently proven only by the E2E suite or by nothing:

1. `updateSong` really preserves `built_in_key` / `built_in_revision` when a
   caller omits them (A3b's `COALESCE`) — pinned as SQL text only.
2. `writeJournal`'s `ON CONFLICT … DO UPDATE` really upserts.
3. `deleteMediaFolder`'s transaction really removes the folder's media rows.
4. The migration runner + list, end to end on the **legacy schema**, produce
   the current schema, record 1–4, write a backup that is the untouched
   original, and are a no-op on the second run — today only the E2E proves
   this (40 s) and the runner unit test uses a fake db.

## Design

- `electron/db/__tests__/helpers/realDb.ts`: `openMigratedMemoryDb()` — a
  `:memory:` better-sqlite3 database with every migration's `up` applied in
  order, `foreign_keys = ON`. `openLegacyMemoryDb()` — the same legacy DDL the
  E2E uses (copied verbatim, with the `initialized` setting), for the runner test.
- `electron/db/__tests__/realSqlite.queries.test.ts`: one `describe` per
  query module — songs (5), presentations (5), media (5), journal (3).
- `electron/db/__tests__/realSqlite.migrations.test.ts`: the runner on the
  legacy schema with a real filesystem `BackupStore` in a temp dir (4 cases:
  applies 1–4 and adds every column the legacy schema lacks; the backup file
  is a valid SQLite database containing the legacy rows and **no**
  `schema_migrations`; the legacy built-in-tagged hymn is claimed by key and
  the user's is not; a second run applies nothing and writes no backup).
- `@types/better-sqlite3` added as a devDependency.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                  | Action                        |
| ----------------------------------------------------- | ----------------------------- |
| `electron/db/__tests__/helpers/realDb.ts`             | create                        |
| `electron/db/__tests__/realSqlite.queries.test.ts`    | create                        |
| `electron/db/__tests__/realSqlite.migrations.test.ts` | create                        |
| `package.json`, `package-lock.json`                   | `@types/better-sqlite3` (dev) |
| `vitest.config.mjs`                                   | thresholds only               |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md`    | record                        |

**Do NOT modify:** any production file. If a test finds a bug, that is a
finding for a separate fix PR — record it, do not fix it here.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Helper + 22 cases written; all green on first run **or** each red one is a recorded finding.
- [x] 2. Gate; coverage measured; thresholds raised.
- [x] 3. Record; PR.

## Findings (2026-09-06)

- All 22 cases green on the first run: the query modules and the runner do
  what their SQL text says. No production bug surfaced.
- Coverage 7.38/5.85/6.73/7.76 → **8.25/7.00/7.66/8.72**; thresholds raised
  to 8.0/6.8/7.4/8.5. The runner and every query module are now executed
  for real in the unit suite, in milliseconds.
- The legacy fixture is shared verbatim with the E2E, so the unit proof and
  the app-level proof are about the same database.
