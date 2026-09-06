# Executable Plan A3b — Built-in Hymns: Refresh Only If Untouched

**Workstream:** A (Data safety) · **Depends on:** A3 (merged, #33)
**Decision (Ethan, 2026-09-06):** refresh a built-in hymn only if the user never
edited it; user-edited built-ins are left alone forever.

## The problem, precisely

After A3 the seeder touches only keyed rows, but it still rewrites their content
on every launch (`updateSong(existing.id, payload)`). A user who reorders verses
or fixes a line in a built-in hymn loses that edit on relaunch.

Two facts make the obvious fixes wrong:

- The seeder's payload regenerates group/slide ids (`uuid()`) every call, so a
  hash of the payload differs every launch. The fingerprint must cover **text
  only** — title, artist, group type + label, slide bodies — never ids or styles.
- `updateSong` currently writes `built_in_key = ?` from the caller's payload
  with `?? null`. The song editor's save does not pass `builtInKey`, so **saving
  an edited built-in hymn clears its key**, and the seeder then re-creates a
  duplicate on the next launch. (Verified by reading `SongEditorModal.jsx`
  before this plan was written.) Both columns must be preserved when the caller
  does not supply them.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                               | Action                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `presenter-pro/src/utils/builtInHymnFingerprint.ts`                | create (pure)                                                                    |
| `presenter-pro/src/utils/__tests__/builtInHymnFingerprint.test.ts` | create                                                                           |
| `presenter-pro/src/utils/builtInSongSeed.js`                       | modify — decision matrix                                                         |
| `presenter-pro/src/utils/__tests__/builtInSongSeed.test.ts`        | modify — case 2 becomes the 5-case matrix (behaviour-change edit)                |
| `presenter-pro/electron/db/migrationList.ts`                       | modify — append migration 4 only                                                 |
| `presenter-pro/electron/db/__tests__/migrations.test.ts`           | modify — `[1,2,3]` → `[1,2,3,4]` + migration 4 cases                             |
| `presenter-pro/electron/db/queries/songs.js`                       | modify — `built_in_revision` column; COALESCE on key + revision in update; parse |
| `presenter-pro/electron/db/__tests__/songQueries.test.ts`          | create                                                                           |
| `presenter-pro/e2e/hymns.spec.ts`                                  | create                                                                           |
| `presenter-pro/e2e/migrations.spec.ts`                             | modify — version lists → 4 entries (behaviour-change edits)                      |
| `presenter-pro/vitest.config.mjs`                                  | thresholds only                                                                  |
| `tasks/phase7-remediation.md`                                      | record                                                                           |

**Do NOT modify:** `builtInHymns.js`, `shared/hymns.json`, `SongEditorModal.jsx`,
migrations 1–3, any other existing test.

## Design

### Fingerprint — `builtInHymnFingerprint.ts`

`hymnTextFingerprint(record)` → hex string. Canonical text =
`title ⏎ artist ⏎ (type|label|body…)` over `songGroups` (JSON string or array),
bodies trimmed, ids/styles ignored. Hash: FNV-1a 32-bit (deterministic, no
dependency; not security). Same text ⇒ same fingerprint; any body/label/type/
title change ⇒ different.

### Decision matrix (seeder, per hymn) — **all 6 rows, exhaustive**

| Row state                                     | Row text vs stored revision | Source text vs stored | Action                                        |
| --------------------------------------------- | --------------------------- | --------------------- | --------------------------------------------- |
| no keyed row                                  | —                           | —                     | create, stamp `builtInRevision = fp(payload)` |
| keyed, revision NULL, row text == source text | —                           | —                     | refresh + stamp (one-time adoption)           |
| keyed, revision NULL, row text ≠ source text  | —                           | —                     | leave (edited or legacy variant — unknowable) |
| keyed, revision set, row text ≠ revision      | edited                      | any                   | **leave, forever**                            |
| keyed, revision set, row text == revision     | untouched                   | changed               | refresh + restamp                             |
| keyed, revision set, row text == revision     | untouched                   | same                  | nothing                                       |

### Storage — migration 4 `built-in-revision`

`addColumnIfMissing(songs, built_in_revision, TEXT)` — inspection-guarded.

### Queries — `songs.js`

- `createSong`/`updateSong` accept `builtInRevision` / `built_in_revision`.
- `updateSong` uses `COALESCE(?, built_in_key)` and `COALESCE(?, built_in_revision)`
  so a caller that omits them (the song editor) preserves them. Behaviour change,
  stated; it fixes the de-keying bug above.
- `parse` exposes `builtInRevision`.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Tests first (fingerprint 5 cases; seeder matrix 6 rows; migrations `[1,2,3,4]` + column-by-inspection ×2; songQueries COALESCE ×2 + create column; E2E: fresh launch stamps all 4 hymns, editing one via sqlite and relaunching keeps the edit and creates no duplicate). _Verify:_ FAIL first; paste.
- [x] 2. Implement. 3. Update `migrations.spec.ts` lists (behaviour-change). 4. Gate + E2E ×2 + thresholds + record.

## Compliance Manifest — `writing-executable-plans.mdc`

| Item                                            | Disposition                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Assertion weakening                             | clause verbatim; exact call lists                                                                               |
| List sampling                                   | counted: 6-row matrix, 5 + 6 + 4 + 3 unit cases, 1 E2E                                                          |
| Quantifier erosion                              | "all 4 hymns stamped", "exactly one Amazing Grace"                                                              |
| Escape hatch                                    | none                                                                                                            |
| Blast radius                                    | 12-file table; do-not-touch                                                                                     |
| Pitfalls                                        | ids regenerate per call (hash text only); editor save omits key/revision (COALESCE); seeder runs ~1s after load |
| Exact paths / per-todo verification             | yes                                                                                                             |
| Snapshots / UI preconditions / structural floor | `N/A`                                                                                                           |
| IPC pinning                                     | `N/A — no channel change`                                                                                       |
| Manual verification                             | E2E is the path                                                                                                 |
| Findings report                                 | gate/E2E, TDD proof, blast-radius, behaviour-change edits, discoveries                                          |

### `testing-standards.mdc`

| #   | Disposition                                                                        |
| --- | ---------------------------------------------------------------------------------- |
| 1   | tests before code, failure pasted                                                  |
| 2   | seeder case 2 and migrations lists — stated                                        |
| 3   | verbatim                                                                           |
| 4   | one test per matrix row and per function                                           |
| 5   | lint floor                                                                         |
| 6   | `N/A`                                                                              |
| 7   | gate                                                                               |
| 8   | ipc mocked; fake db                                                                |
| 9   | placement table                                                                    |
| 10  | prior keyed-refresh behaviour was pinned by A3's case 2; its replacement is stated |

## Findings (2026-09-06)

- TDD proof: 7 failing + 2 unloadable files before implementation (fingerprint module absent).
- Gate: 22 files / 197 tests green; E2E 16/16 twice; `verify:db` on the real
  library DB: migrations 1–4 recorded, `built_in_revision` added, counts identical.
- Discovery 1 (fixed here): the song editor's save omitted `builtInKey`… no —
  it passes `song.builtInKey`, but `updateSong` wrote `?? null` for any caller
  that omits it, and nothing preserved `built_in_revision`. Both are now
  `COALESCE(?, column)`. Behaviour change, pinned by `songQueries.test.ts`.
- Discovery 2 (not fixed, recorded in fable-notes): a fresh profile contains
  two "Amazing Grace" songs — the main process's sample seed
  (`electron/main/index.js:525`, unkeyed) and the built-in hymn. My first E2E
  assertion ("exactly one row titled Amazing Grace") failed on that premise;
  it now asserts total row count unchanged + exactly one row by key, stronger.
