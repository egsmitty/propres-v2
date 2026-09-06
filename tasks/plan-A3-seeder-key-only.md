# Executable Plan A3 — Built-in Hymn Seeder: Key Only, Never Delete

**Workstream:** A (Data safety) · **Depends on:** A1 (migrations), A2 (nothing functional; sequencing only)
**Decision (Ethan, 2026-09-06):** match by `built_in_key` only, never delete; title
matching becomes a one-time versioned data migration.
**Fixes:** `phase7-remediation.md` #14.

## The problem, precisely

`src/utils/builtInSongSeed.js` runs on every launch (`App.jsx:62`). For each
of the four built-in hymns it collects *candidates*: rows with the matching
`built_in_key`, **or** rows with the same title tagged `hymn` or `built-in`.
The first candidate is overwritten with the built-in payload and **every other
candidate is deleted** as a duplicate. A user who imports their own arrangement
of "Amazing Grace" and tags it `hymn` has it overwritten on next launch; two
such songs and one is deleted. This is a data-loss path that runs unattended.

Title matching existed to adopt rows created by builds that predate
`built_in_key`. That is a one-time concern and belongs in a data migration.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File | Action |
|---|---|
| `presenter-pro/src/utils/builtInSongSeed.js` | modify — key-only matching; remove deletion |
| `presenter-pro/src/utils/__tests__/builtInSongSeed.test.ts` | create |
| `presenter-pro/electron/db/migrations.js` | modify — append migration 3 only |
| `presenter-pro/electron/db/__tests__/migrations.test.ts` | create |
| `presenter-pro/e2e/migrations.spec.ts` | modify — version lists `[1,2]` → `[1,2,3]` (behaviour-change edits) + one new legacy-hymns spec |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |
| `tasks/phase7-remediation.md` | modify — record outcome |

**Do NOT modify:** `builtInHymns.js`, `shared/hymns.json`, `songSections.js`,
any query module, `App.jsx`, migrations 1 or 2, any other existing test.

## Design

### Seeder (`builtInSongSeed.js`)

For each built-in hymn: find the row whose `builtInKey === hymn.id`. If found,
refresh it (existing behaviour, `ccli` preserved). If not found, create it.
**No title matching. No tag matching. No deletion, ever.** `deleteSong` is no
longer imported.

### Migration 3 — `claim-legacy-built-in-hymns`

For each hymn in a **frozen list embedded in the migration** (a data migration
must not change meaning if `hymns.json` changes later):

```sql
UPDATE songs SET built_in_key = ?
WHERE built_in_key IS NULL
  AND id = (
    SELECT MIN(id) FROM songs
    WHERE built_in_key IS NULL AND title = ? AND tags LIKE '%"built-in"%'
  )
  AND NOT EXISTS (SELECT 1 FROM songs WHERE built_in_key = ?)
```

Claims only rows the old seeder itself wrote (tagged `"built-in"` — the
seeder's own tag), only one per hymn (the oldest), and only when no keyed row
already exists. A user song tagged merely `hymn` is never claimed. Nothing is
deleted or rewritten; only `built_in_key` is set.

Frozen list (verified against `shared/hymns.json` 2026-09-06 — all 4):
`amazing-grace` / Amazing Grace · `all-creatures-of-our-god-and-king` / All
Creatures of Our God and King · `how-great-thou-art` / How Great Thou Art ·
`great-is-thy-faithfulness` / Great Is Thy Faithfulness.

### Sanctioned escape hatch

None. If a case seems to need one, STOP and report.

## Todos

- [x] **1. Failing tests first.**
      `src/utils/__tests__/builtInSongSeed.test.ts` (mock `@/utils/ipc` and
      `@/utils/builtInHymns`) — **all 6, exhaustive:**
      1. empty library → one `createSong` per hymn with `builtInKey`; `deleteSong` never
      2. keyed row present → `updateSong(id, {...payload, ccli})`; no create for that hymn
      3. unkeyed same-title song tagged `hymn` → untouched (no update/delete); keyed row created
      4. unkeyed same-title song tagged `built-in` → untouched by the seeder (migration 3 owns it); keyed row created
      5. two rows share a key → first updated, **none deleted**
      6. concurrent calls share one run (`getSongs` once)
      `electron/db/__tests__/migrations.test.ts` — **all 4, exhaustive:**
      1. `MIGRATIONS` versions are exactly `[1, 2, 3]` and well-formed
      2. migration 3 is named `claim-legacy-built-in-hymns`
      3. its `up` issues exactly four UPDATEs with params `[key, title, key]` in hymn order (`toEqual` on the whole list)
      4. its SQL never contains `DELETE`, always contains `NOT EXISTS` and `'%"built-in"%'`
      E2E (`e2e/migrations.spec.ts`), new spec: legacy DB seeded with an unkeyed
      `"built-in"`-tagged "Amazing Grace" **and** a user's "Amazing Grace" tagged
      only `hymn` → after launch + seeding settle: exactly two "Amazing Grace"
      rows, the older one keyed `amazing-grace`, the user's still `NULL`, no row
      deleted, no third created.
      *Verify:* unit suites FAIL (behaviour not present / migration absent);
      paste output.
- [x] **2. Implement** the seeder change and migration 3.
- [x] **3. Update** existing `migrations.spec.ts` expectations `[1,2]` → `[1,2,3]`
      (behaviour-change edits — state in summary).
- [x] **4. Run** unit + `npm run test:e2e` twice + gate; raise thresholds; record #14 fixed.

## Required findings report
1. Gate + E2E results (two runs) · 2. TDD failure output · 3. files outside the
blast radius · 4. behaviour-change edits stated · 5. anything discovered, not fixed.

## Compliance Manifest

### `writing-executable-plans.mdc`
| Item | Disposition |
|---|---|
| Assertion weakening | clause verbatim; whole-list `toEqual` on params and rows |
| List sampling | counted exhaustive lists: 6 + 4 unit cases, 1 E2E, 4 hymns |
| Quantifier erosion | "exactly four UPDATEs", "exactly two rows" — counts asserted |
| Escape hatch | none, explicitly |
| Blast radius | 7-file table, do-not-touch list |
| Pitfalls | frozen hymn list; the seeder runs ~1s after load so E2E waits; migration order |
| Exact paths | all named |
| Per-todo verification | yes |
| Snapshots / conditional UI / structural floor | `N/A — none` |
| IPC pinning | `N/A — no channel changed` (drift guard still runs) |
| Manual verification | E2E is the click-path; nothing UI-visible changes |
| Findings report | 5 items |

### `testing-standards.mdc`
| # | Disposition |
|---|---|
| 1 TDD | todo 1 before todo 2, failure output required |
| 2 Behaviour-change edits | todo 3, stated |
| 3 No weakened assertions | clause verbatim |
| 4 Coverage | 10 unit + 1 E2E |
| 5 Lint floor | no `.only/.skip`, no conditional expect |
| 6 Snapshots | `N/A` |
| 7 Gate | todo 4 |
| 8 Mechanics | `@/utils/ipc` mocked, never `electron`; fake db for migration |
| 9 Placement | `src/utils/__tests__`, `electron/db/__tests__`, `e2e/` |
| 10 Characterization | existing seeder behaviour for keyed rows pinned by case 2 before the rewrite |
