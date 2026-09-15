# Executable Plan ED1R — repair the slides the `&amp;` bug already damaged

**Audit item:** ED-1 · P0 · the **[F] storage half** — "'One storage format'
changes how slide text is stored and touches every version snapshot — by this
file's own rule that is [F] for the plan, with D8's backup/rollback rule."
Plan ED2 (#135) stopped the compounding; this plan repairs what it left
behind. D8 (Wave 2): "Every item that rewrites rows or snapshots … depends on
the existing `VACUUM INTO` pre-migration backup and states its rollback."

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`8e34fca`. One PR.

---

## Measured (read on 2026-09-14, `main` @ `8e34fca`)

- **The damage.** Before #135, every edit of a slide containing `&` (or `<`,
  `>`) re-escaped the editor's already-escaped `innerHTML`: `&` → `&amp;` →
  `&amp;amp;` → `&amp;amp;amp;`, one level per seed/save cycle. #135's decode is
  **one pass on purpose** (`slideMarkup.js:17-31`: "`&amp;amp;` becomes
  `&amp;` — never `&`"), so a row damaged to N ≥ 2 levels still renders with
  N − 1 visible `amp;`s — the ED2 notes record it: "slides already damaged by
  the `&amp;` bug stop growing but keep one extra `&amp;`".
- **Where bodies live.** `presentations.sections` is a JSON string
  (`electron/db/queries/presentations.js:41,80`, parsed at `:129` with a
  corrupt-row guard). Inside it, text is stored twice (ED-38): `slide.body`
  and each `slide.textBoxes[i].body`, kept in step by `syncLegacyTextFields`
  (`textBoxes.js:186-207`). Every `presentation_versions.snapshot` is the same
  JSON shape (`migrationList.ts:181-186`; written by `writeVersion`,
  `queries/versions.js:24`). So a repair must touch **both fields of every
  slide** in **both tables**.
- **Which bodies are affected.** Only **tagless** bodies took the escaping path
  (`slideBodyToHtml`, the `!HTML_TAG_RE.test(value)` branch). A body with real
  markup (`<div>`, `<b>`, `<br>`) came from the editor's `innerHTML` where
  entities are single-level; it is left alone by #135 and by this plan. A
  tagless body with exactly **one** level (`Praise &amp; Worship`) is the
  editor's legitimate encoding and renders correctly — not damage.
- **The one ambiguity.** A user who literally typed the five characters
  `&amp;` into a lyric would have it stored as `&amp;amp;` — indistinguishable
  from one level of damage. Collapsing it renders `&` where they typed `&amp;`.
  Accepted (Decision 3): the bug hit every ampersand in every worship lyric
  ("Praise & Worship", "Father, Son & Holy Ghost"); a literal `&amp;` in a
  lyric is not a real case.
- **The migration machinery.** `runMigrations` (`migrationRunner.ts:149-183`)
  takes a consistent backup with `VACUUM INTO` **before** any migration runs,
  named by `BACKUP_FILE_PATTERN = /^presenterpro\.backup-v(\d+)-(\d{8}T\d{6}Z)\.db$/`
  (`:61`) — the `v` is the schema version **before** the run, so this plan's
  backup will be `presenterpro.backup-v5-<UTC>.db` — then prunes to the newest
  3 (`:107,183`; MAIN-B13 keeps the pruned ones when the backup write fails).
  Each migration runs inside its own transaction and is recorded only after
  its `up` (`migrationRunner.test.ts:188,213`). `MIGRATIONS` is 1–5
  (`migrationList.ts:194-200`); migration `up`s take a `MigrationDb`.
- **Tests that pin the list and must change deliberately:**
  `electron/db/__tests__/migrations.test.ts:48` "is exactly versions 1, 2, 3,
  4, 5"; `e2e/migrations.spec.ts:123-134` (fresh install records exactly 1–5)
  and `:154-166` (legacy upgrade records 1–5). Each gains version 6 — a named
  behaviour-change edit. `realSqlite.migrations.test.ts` runs the real list
  against a legacy in-memory database (`helpers/realDb.ts`,
  `openLegacyMemoryDb`) with a real backup directory — the place to prove the
  repair on real SQLite.
- **Rollup inputs.** Every `electron/db` module is a hand-listed input in
  `electron.vite.config.js:79-93`. A new `electron/db/repairEntities.ts`
  imported by `migrationList.ts` is bundled as an ES import, but the repo's
  rule (handoff §7) is to list it and pin the listing with a source-text test.

## Decisions

1. **Migration 6, `repair-compounded-entities`.** For every row of
   `presentations` and every row of `presentation_versions`: parse the JSON;
   for every slide, repair `slide.body` and every `slide.textBoxes[i].body`;
   write the row back **only if something changed**. A row whose JSON does not
   parse is skipped and counted (never fails the migration — the corrupt-row
   guard in `presentations.js:129` already tolerates it).
2. **The repair is one pure function,** `repairCompoundedEntities(body: string): string`
   in `electron/db/repairEntities.ts`, and the exhaustive rule is:
   - if the body contains an HTML tag (`/<\/?[a-z][\s\S]*>/i`, the same test
     `slideMarkup.js` uses) → unchanged;
   - else replace every run matching `/&amp;(?:amp;)+/gi` — **two or more**
     `amp;` levels — with a single `&amp;`;
   - and likewise for the other escaped characters the same bug compounded:
     `/&amp;(?:amp;)*(lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi` → `&$1;` (e.g.
     `&amp;lt;` → `&lt;`).
     Nothing else changes: whitespace, `&nbsp;`, single-level entities, raw
     `&`, and bodies with markup are byte-identical after the call. The
     function is idempotent (repair ∘ repair = repair) — pinned.
3. **The ambiguity is accepted and stated,** in the migration's comment, in
   the notes entry and in the PR body: a literal typed `&amp;` collapses to
   `&`. No heuristic tries to tell them apart — a heuristic that guesses wrong
   on a real lyric is worse than a rule that can be stated in one sentence.
4. **D8 — backup and rollback.** The migration relies on the runner's
   `VACUUM INTO` backup taken before it runs, `presenterpro.backup-v5-<UTC>.db`
   in the same folder as `presenterpro.db` (`BACKUP_FILE_PATTERN`,
   `migrationRunner.ts:61` — verified against the file). **Rollback:** quit
   the app, replace `presenterpro.db` (and delete any `-wal`/`-shm` beside it)
   with that backup, and either run the previous build or run this build
   again — migration 6 is idempotent and would simply re-apply. The notes
   entry states this in plain words for Ethan.
5. **Scope.** This plan does not change how text is stored (ED-38's
   textBoxes-only migration is its own D8 plan), does not touch the renderer,
   the editor or `slideMarkup.js`, and does not decode entities in any table
   other than the two named.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Every comparison is exact: repaired strings compared with `toBe`; repaired
rows compared as whole parsed objects with `toEqual`; migration lists
compared as whole arrays.

## Blast radius

**May change:** `electron/db/repairEntities.ts` (new),
`electron/db/__tests__/repairEntities.test.ts` (new), `electron/db/migrationList.ts`
(migration 6 appended; nothing above it), `electron/db/__tests__/migrations.test.ts`
(the list assertion becomes 1–6; a migration-6 describe added),
`electron/db/__tests__/realSqlite.migrations.test.ts` (a repair case added;
existing cases unchanged), `e2e/migrations.spec.ts:123-134,154-166` (version
6 added to both expected lists — named), `electron.vite.config.js` (one input
line) and the source-text test that pins the inputs, this plan, the charter
row, the notes entry.

**May not change:** `slideMarkup.js`, `textBoxes.js`, any renderer or editor
file, `queries/presentations.js`, `queries/versions.js`, `migrationRunner.ts`,
migrations 1–5, any other E2E spec.

## Todos

- [ ] 1. **Repair characterization (red).** `electron/db/__tests__/repairEntities.test.ts`
      against a stub `repairCompoundedEntities = (s) => s`. This table is
      exhaustive — all 12 rows, each `toBe` exact:
  | input                                                                           | output                                                             |
  | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | `Praise &amp;amp; Worship`                                                      | `Praise &amp; Worship`                                             |
  | `A &amp;amp;amp; B &amp;amp;amp;amp; C`                                         | `A &amp; B &amp; C`                                                |
  | `Praise &amp; Worship` (one level)                                              | unchanged                                                          |
  | `Rock & Roll` (raw)                                                             | unchanged                                                          |
  | `&amp;amp;lt;b&amp;amp;gt;`                                                     | `&lt;b&gt;`                                                        |
  | `&amp;lt;` (one level, escaped lt)                                              | `&lt;`                                                             |
  | `Tom &amp;amp; Jerry<br />Again` (has a tag)                                    | unchanged                                                          |
  | `<div>Praise &amp;amp; Worship</div>` (has a tag)                               | unchanged                                                          |
  | `Fish &amp;amp; chips&nbsp;now`                                                 | `Fish &amp; chips&nbsp;now`                                        |
  | `` (empty)                                                                      | ``                                                                 |
  | `&amp;AMP;amp; X` (mixed case)                                                  | `&amp; X`                                                          |
  | repair(repair(x)) for every input above                                         | `repair(x)` (idempotence, iterated over the table, count asserted) |
  | Plus `repairSections(sections)` (the JSON-level helper): a two-slide fixture    |
  | where slide 1 has a damaged `body` and a damaged `textBoxes[0].body` and        |
  | slide 2 is clean → whole-object `toEqual` with only slide 1's two fields        |
  | changed, and a `changed: true/false` flag that is `false` for the clean         |
  | fixture. Verify: `npx vitest run electron/db/__tests__/repairEntities.test.ts`. |
- [ ] 2. Write `repairEntities.ts` (Decision 2). Green on Todo 1.
- [ ] 3. **Migration list pin (red, then named change).** In `migrations.test.ts`
      the "exactly versions 1, 2, 3, 4, 5" case becomes "1, 2, 3, 4, 5, 6" with
      `name: 'repair-compounded-entities'` — the one deliberate list change; add
      a migration-6 describe with a fake `MigrationDb` asserting: it reads both
      tables, issues an `UPDATE presentations SET sections = ? WHERE id = ?` only
      for the damaged row, an `UPDATE presentation_versions SET snapshot = ? WHERE id = ?`
      only for the damaged snapshot, zero writes for clean rows, and skips (does
      not throw on) a row whose JSON is corrupt. Then migration 6 in
      `migrationList.ts`. Verify: `npx vitest run electron/db/__tests__/migrations.test.ts`.
- [ ] 4. **Real SQLite (red first).** In `realSqlite.migrations.test.ts` add a
      case: before `run()`, insert a presentation whose `sections` JSON has a
      `&amp;amp;` body and a version row with the same damaged snapshot, plus one
      clean presentation; after `run()`, `schema_migrations` lists 1–6, the
      damaged row's parsed `sections` equals the repaired fixture (whole object),
      the version's parsed snapshot likewise, the clean row is byte-identical, and
      exactly one backup named `presenterpro.backup-v5-…` exists (the legacy
      fixture starts at version 0 — check `openLegacyMemoryDb` and use the version
      it reports). The existing cases pass unchanged.
- [ ] 5. `electron.vite.config.js` gains `'db/repairEntities'`; the source-text
      test that pins the inputs (find it: `grep -rn "electron.vite.config" electron/main/__tests__`)
      gains the entry in its expected list.
- [ ] 6. `e2e/migrations.spec.ts`: both expected lists gain
      `{ version: 6, name: 'repair-compounded-entities' }` (named behaviour-change
      edit; nothing else in the spec changes). Verified by CI's `E2E (macOS)`.
- [ ] 7. `npm run gate` (report type-check, lint, passed/total, skipped);
      `npm run format:check`. No baseline is affected.
- [ ] 8. Findings report in the PR body: the accepted ambiguity, the count of
      rows the migration would touch in the seeded profile (zero — the seed is
      public-domain text without ampersands; state it), the rollback sentence.
      **Manual check owed** (not run — no app launches while Ethan is at the
      machine): on a library with a slide that shows `&amp;` today, launch once —
      the slide reads `&`, and a `presenterpro.backup-v5-…db` sits beside the
      database.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assertion weakening designed against          | Clause verbatim; `toBe` on strings, whole-object `toEqual` on rows and lists                                                                                                                                                         |
| List sampling designed against                | Todo 1 "all 12 rows", idempotence iterated over the table with its count asserted; Todo 3 counts writes per table                                                                                                                    |
| Quantifier erosion designed against           | "Every row of both tables" is asserted by Todo 3's fake db (every row read, writes counted) and Todo 4's real db                                                                                                                     |
| Sanctioned escape hatch                       | None — corrupt-JSON rows are skipped by rule, and the skip is counted and asserted (Todo 3), not silently tolerated                                                                                                                  |
| Bounded blast radius                          | Blast radius section with a may-not-change list                                                                                                                                                                                      |
| File-specific pitfall notes                   | Measured: text is stored twice per slide (body and textBoxes); only tagless bodies were damaged; one-level entities are legitimate; the backup name carries the pre-run version (v5); the legacy fixture's starting version (Todo 4) |
| Exact paths                                   | Blast radius; no new test directories                                                                                                                                                                                                |
| Per-todo verification                         | Todos 1, 3, 4 name their vitest command; Todo 6 CI; gate at Todo 7                                                                                                                                                                   |
| Snapshot policy inline                        | N/A — no screenshot baselines are touched                                                                                                                                                                                            |
| Preconditions for conditional UI              | N/A — no UI                                                                                                                                                                                                                          |
| Structural floor under every snapshot         | N/A — no snapshots                                                                                                                                                                                                                   |
| IPC contract pinning                          | N/A — no channel touched                                                                                                                                                                                                             |
| Manual verification steps                     | Todo 8 (owed, not run)                                                                                                                                                                                                               |
| Required findings report                      | Todo 8                                                                                                                                                                                                                               |
| Data rewrites state their backup and rollback | Decision 4: `VACUUM INTO` backup `presenterpro.backup-v5-<UTC>.db` per `BACKUP_FILE_PATTERN` (`migrationRunner.ts:61`, verified), rollback stated; idempotence pinned                                                                |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                                      |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todos 1→2, 3 (red list + red describe)→migration, 4 (red)→green                                                                                                  |
| 2   | Behavior-change test edits       | The migration-list assertions in `migrations.test.ts` and `e2e/migrations.spec.ts` gain version 6 — named in the commit and the PR                               |
| 3   | No weakened assertions           | Clause verbatim; exact strings, whole objects, whole lists                                                                                                       |
| 4   | Coverage floor                   | Todo 1's 12 rows cover every branch of the repair; Todo 3 covers every branch of the migration (damaged, clean, corrupt)                                         |
| 5   | Lint floor                       | No `.only`/`.skip`; `eslint --max-warnings 0` in the gate                                                                                                        |
| 6   | Snapshot discipline              | N/A — no snapshots                                                                                                                                               |
| 7   | Completion gate                  | Todo 7                                                                                                                                                           |
| 8   | Vitest / jsdom mechanics         | Node environment; `better-sqlite3` only in `realSqlite.*` (the A4 convention); the migration unit test uses the fake `MigrationDb` the other migration tests use |
| 9   | Test placement                   | `electron/db/__tests__/`, `e2e/`                                                                                                                                 |
| 10  | Characterization before refactor | N/A — nothing is restructured; migrations 1–5 and their tests are untouched                                                                                      |

---

## Status at pause (2026-09-14) — NOT REVIEWED, nothing coded

The mandatory fresh-agent review was launched and died immediately (session
usage limit). **Run it before any code.** Known weak points to settle first:

1. **Rollback (Decision 4) is wrong as written.** After migration 6 runs,
   `schema_migrations` records version 6, so "run this build again — it
   re-applies" never happens. Rollback is only: quit, restore
   `presenterpro.backup-v5-<UTC>.db` over `presenterpro.db`, delete `-wal`/`-shm`.
2. Check whether any other stored text was compounded — `songs.song_groups`,
   song lyrics, the recovery journal table — before scoping to two tables.
3. Check what version `openLegacyMemoryDb` starts at (Todo 4's backup name).
4. Find the source-text test that pins `electron.vite.config.js` inputs (Todo 5).
5. Decide whether to fold this into ED-38 (textBoxes-only storage, also a D8
   row rewrite) so users' rows and snapshots are rewritten once, not twice.
