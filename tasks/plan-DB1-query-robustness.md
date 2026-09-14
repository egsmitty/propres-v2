# Executable Plan DB1 — Query robustness: corrupt rows, backup ordering, stable sort

**Workstream:** D (Startup/DB resilience) — items MAIN-B2, MAIN-B13, MAIN-B16,
SONG-16 from `tasks/fable-pass-2-audit.md` (local, untracked).
**Category:** production fix (query/runner logic) + tests. No IPC channel is
touched, no stored row is ever rewritten by this plan (see "Backup/rollback"
below), no UI file is touched.

## Why (Measured)

1. **MAIN-B2 (P1).** `presenter-pro/electron/db/queries/presentations.js:2`:
   ```js
   function getPresentations(db) {
     return db.prepare('SELECT * FROM presentations ORDER BY updated_at DESC').all().map(parse);
   }
   ```
   `.map(parse)` calls the shared `parse` helper at
   `presenter-pro/electron/db/queries/presentations.js:114-127`, which does
   `sections: JSON.parse(row.sections || '[]')` with no try/catch
   (`presentations.js:121`). One row with invalid JSON in its `sections`
   column throws inside `.map`, so `getPresentations` throws and the Home
   screen's list comes back empty instead of showing the other rows.
   `getPresentation(id)` (`presentations.js:5-8`) calls the same `parse`
   helper, so a single corrupt row also breaks opening the presentation by id
   with a raw exception instead of a graceful `corrupt` flag.

2. **MAIN-B13 (P3).** `presenter-pro/electron/db/migrationRunner.ts:141-142`:
   ```ts
   pruneBackups(options.backups, keep);
   db.exec(`VACUUM INTO ${sqlString(backupPath)}`);
   ```
   Old backups are deleted *before* the new backup is written. If the
   `VACUUM INTO` write fails (disk full, permissions), the older backups
   that were pruned to make room are already gone and cannot be recovered —
   the user is left with fewer backups than before the failed run, at exactly
   the moment a migration is about to touch their database.

3. **MAIN-B16 (P3).** Two `ORDER BY` clauses sort only by a second-resolution
   `unixepoch()` column, so rows written in the same second have unstable
   relative order (can flip between calls):
   - `presenter-pro/electron/db/queries/presentations.js:2` —
     `ORDER BY updated_at DESC`.
   - `presenter-pro/electron/db/queries/media.js:2` — `ORDER BY created_at DESC`
     (`getMedia`).
   Checked media folders too:
   `presenter-pro/electron/db/queries/media.js:6` — `getMediaFolders` already
   orders `lower(name) ASC, created_at ASC`; two folders with the same name
   created in the same second would still tie, so it gets the same `id`
   tie-breaker for full determinism.

4. **SONG-16 (P2).** `presenter-pro/electron/db/queries/songs.js:2`:
   ```js
   function getSongs(db) {
     return db.prepare('SELECT * FROM songs ORDER BY title ASC').all().map(parse);
   }
   ```
   Plain `ORDER BY title ASC` is SQLite's default byte-order collation, which
   is case-sensitive (`'Z' < 'a'` in ASCII), so `"amazing love"` sorts after
   `"Zion"` in the song library. The existing real-DB test even documents
   this as intended behaviour today
   (`presenter-pro/electron/db/__tests__/realSqlite.queries.test.ts:83-94`,
   comment `// SQLite ASC is byte order`) — that comment/assertion is the
   thing this plan intentionally changes.

## Decisions

- **MAIN-B2 fix location:** fix inside the single shared `parse` helper in
  `presentations.js`, not by wrapping each call site separately. Both
  `getPresentations` (`.map(parse)`) and `getPresentation` (`row ? parse(row)
  : null`) call this one function, so fixing it once covers both, per the
  audit's instruction to check whether `getPresentation` shares the helper.
- **Corrupt-row shape:** on a `JSON.parse` failure, `parse` returns
  `{ ...row, sections: [], corrupt: true, defaultBackgroundId, aspectRatio,
  customAspectWidth, customAspectHeight }` and calls
  `console.error('[presentations] row <id> has corrupt sections JSON:', error)`.
  A successfully-parsed row's shape is **unchanged** — no `corrupt` key is
  added to healthy rows (order/count/exactness: existing tests that
  `toEqual`/`toMatchObject` healthy rows must keep passing unmodified).
- **MAIN-B13 fix:** swap the two lines so `VACUUM INTO` runs first, `
  pruneBackups` after. `pruneBackups`'s real `BackupStore.list()`
  (`presenter-pro/electron/db/migrations.js:14-19`, `fs.readdirSync`) reads
  the directory live, so once the backup is written *before* pruning, the
  just-written file is already present in `list()`. `pruneBackups`'s
  internal "how many to retain" arithmetic
  (`presenter-pro/electron/db/migrationRunner.ts:78-86`) currently reserves
  one slot (`keep - 1`) on the assumption it runs *before* the new file
  exists. Simply reordering the two lines without touching that arithmetic
  would under-retain by one backup in production (the new file would occupy
  one of the `keep - 1` slots, leaving only `keep - 1` total instead of
  `keep`) — traced by hand against the real `fs`-backed store, not just
  against the existing test's fake (see pitfall note below). The fix changes
  `pruneBackups` to retain `keep` total from whatever `list()` returns *at
  call time*, with no reserved slot, which is only correct when called after
  the write. This is a **narrow, deliberate widening of what `pruneBackups`
  assumes about its caller** — restated in the code comment — not a
  weakened assertion in a test.
- **MAIN-B16 / SONG-16 tie-breaker column:** every affected table's `id` is
  `INTEGER PRIMARY KEY AUTOINCREMENT` (confirmed:
  `presenter-pro/electron/db/migrationList.ts:53-89`), so `id DESC`/`id ASC`
  is a valid, monotonic, always-available tie-breaker with no schema change.
- **SONG-16 collation:** `ORDER BY title COLLATE NOCASE ASC, id ASC`. Kept
  ascending id as the tie-breaker (creation order) rather than DESC, matching
  the audit's own phrasing ("keep a deterministic tie-breaker, e.g. `, id
  ASC`").

## Backup/rollback rule (D8) — does not apply here

Per `tasks/fable-pass-2-audit.md` D8 and
`.cursor/rules/writing-executable-plans.mdc`: **this plan rewrites no stored
rows.** It changes query text (`ORDER BY`, `COLLATE`), one in-process
`try/catch`, and the order of two statements in the migration runner. No
migration is added, no `UPDATE`/`INSERT` touching existing data is added, and
no existing row's stored bytes are changed by any code path this plan adds.
The D8 backup/rollback rule therefore has nothing to attach to; this section
records that explicitly rather than leaving it silently unaddressed.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

Per-comparison order/count/exactness, stated up front:

- MAIN-B2: `getPresentations` row **count** must be exactly 3 (2 good + 1
  corrupt) — not "at least 2". Exactly one row has `corrupt: true` — checked
  by identity (`.id`), not by counting truthy values loosely. Healthy rows'
  shape is asserted with `toMatchObject` (existing pattern in this test
  file); the corrupt row's `sections` is asserted `toEqual([])` (exact, not
  `toHaveLength(0)`).
- MAIN-B13: the failure-path test asserts `fake.backups.removed` `toEqual([])`
  (exact empty array, not "no *new* removals" or a truthy/falsy check), and
  the thrown error is asserted by both `toBeInstanceOf(Error)` and exact
  `.message`, matching the existing style in `migrationRunner.test.ts:185-205`.
- MAIN-B16: order is asserted with `toEqual([id-of-newer, id-of-older])` — a
  full, order-sensitive array, never a `Set`/`.sort()`/`toContain` compare.
- SONG-16: order is asserted with `toEqual([...])` on the full title list,
  same as the existing (soon-to-be-updated) test at
  `realSqlite.queries.test.ts:83-94`.

## Bounded blast radius

| File | Action |
| --- | --- |
| `presenter-pro/electron/db/queries/presentations.js` | edit — `parse` try/catch, `ORDER BY ... , id DESC` |
| `presenter-pro/electron/db/queries/media.js` | edit — `ORDER BY ... , id DESC` (`getMedia`), `..., id ASC` (`getMediaFolders`) |
| `presenter-pro/electron/db/queries/songs.js` | edit — `ORDER BY title COLLATE NOCASE ASC, id ASC` |
| `presenter-pro/electron/db/migrationRunner.ts` | edit — reorder backup/prune, `pruneBackups` retain arithmetic + comment |
| `presenter-pro/electron/db/__tests__/realSqlite.queries.test.ts` | edit — new/updated cases (see todos) |
| `presenter-pro/electron/db/__tests__/migrationRunner.test.ts` | edit — fake models a live filesystem list; new failure-path test |
| `tasks/fable-pass-plan.md` | append one status-table row |
| `tasks/fable-notes.md` | append `## DB1 — ...` section at the end |

**Do NOT touch:** `electron/main/index.js`, `src/pages/Editor.jsx`,
`src/components/presenter/**`, `src/utils/appCommands.js`,
`src/utils/presenterFlow.js`, `src/utils/presentationCommands.js`,
`src/components/layout/**`, `src/components/shared/**` (out of bounds — a
pending PR stack edits them), and no other query file (`journal.js`, etc.)
that the audit did not name.

### Sanctioned escape hatch — none.

Every one of the 4 items is fixable within the bounded blast radius above. If
any item turns out to already be fixed or wrong on `main` (re-checked against
the file at the start of Todo 1), it is skipped and reported as such in the
findings — not silently dropped.

## Pitfall notes

- `pruneBackups`'s existing unit test
  (`migrationRunner.test.ts:220-235`, "prunes old backups so at most 3 remain
  after the new one is written") uses a fake `BackupStore` whose `list()`
  returns a **fixed** array regardless of what `db.exec` does — it does not
  model the just-written backup file appearing in the directory. Naively
  reordering only the two `runMigrations` lines, without also updating this
  fake, would leave the test green while shipping the off-by-one under-retain
  bug described above in Decisions (the real, `fs`-backed store in
  `migrations.js:14-19` *does* reflect the new file; the fake does not). Todo
  1 updates the fake so `db.exec` matching `VACUUM INTO '<path>'` appends
  `<path>` to the backups list and `remove` splices it out — mirroring what
  `fs.readdirSync`/`fs.unlinkSync` actually do — so the existing assertion
  (`removed` = the two oldest of the four seeded files) is a genuine
  regression check, not an artifact of an unrealistic fake. Worked by hand
  before writing code: with the new fake, `keep = 3` default, 4 seeded
  backups + 1 newly-written (newest) = 5 total; retaining the newest 3
  (new + 2 seeded) and pruning the oldest 2 reproduces the exact same
  `removed` array the test already asserts — so that existing test's
  *assertion* does not change, only the fake's fidelity does.
- `db.exec` in the fake currently just pushes a log line
  (`migrationRunner.test.ts:41-43`); the failure-path test needs it to
  `throw` specifically for the `VACUUM INTO` statement and pass every other
  `exec` through unchanged — implemented via an options flag on `createFake`,
  not a second fake constructor, to keep the file's existing shape.
- SONG-16's fix touches the one existing test that currently documents the
  bug as intended (`realSqlite.queries.test.ts:83-94`, `'B song', 'C song',
  'a song'` with the comment `// SQLite ASC is byte order`). This is the
  Testing Standards "Behavior-change test edits" case: this exact test must
  be edited *because* the tested behavior is intentionally changing, and the
  edited test must fail under the old (unpatched) `ORDER BY title ASC` and
  pass under the new `COLLATE NOCASE`. This is the one test edit in the
  plan; every other change is a new test.
- Real-DB tests must not load `better-sqlite3` in a way that leaks a DB
  handle across tests — follow the existing `beforeEach`/`afterEach`
  `openMigratedMemoryDb()` / `db.close()` pattern at
  `realSqlite.queries.test.ts:15-21`, do not add a new helper.
- To seed a corrupt `sections` value for MAIN-B2, insert with raw SQL
  (`db.prepare('INSERT INTO presentations (title, sections) VALUES (?, ?)')`),
  never through `createPresentation`, since that always calls
  `JSON.stringify` and can never produce invalid JSON.
- `console.error` is called on the corrupt-row path; spy on it
  (`vi.spyOn(console, 'error').mockImplementation(() => {})`) and restore in
  the same test (or `afterEach`) so it doesn't pollute other tests' output or
  count as a real failure under any `no-console-error` style CI check.

## Todos

- [x] 1. **MAIN-B2 — red then green.**
      - Red: in `realSqlite.queries.test.ts`, inside `describe('presentations', ...)`,
        add a case that creates 2 valid presentations via the existing `create`
        helper, inserts a 3rd row with raw SQL whose `sections` column is the
        literal string `'not valid json{'`, then asserts
        `presentations.getPresentations(db)` has length 3, that the corrupt
        row (matched by the id returned from the raw insert) has
        `corrupt: true` and `sections` `toEqual([])`, and that the two valid
        rows do **not** have a `corrupt` key
        (`expect(row).not.toHaveProperty('corrupt')`). Also assert
        `console.error` was called once, spied per the pitfall note. Run
        `npx vitest run electron/db/__tests__/realSqlite.queries.test.ts` from
        `presenter-pro/` and confirm this case fails against the current
        `parse` (unhandled throw propagates out of `.map`, and the whole
        `it` fails with a thrown `SyntaxError`, not a clean assertion
        failure — record the exact red output in the PR body).
      - Also add a case for `getPresentation(db, id)` on the same corrupt row:
        asserts it does **not** throw and returns `{ corrupt: true, sections:
        [] , ... }` rather than `null` or a raw exception.
      - Green: edit `parse` in
        `presenter-pro/electron/db/queries/presentations.js` to wrap the
        `JSON.parse` in try/catch per the Decisions section above. Re-run the
        same command; confirm both new cases pass and every pre-existing case
        in the file still passes unchanged.
      - Verify: `npx vitest run electron/db/__tests__/realSqlite.queries.test.ts`
        (from `presenter-pro/`).

- [x] 2. **MAIN-B13 — red then green.**
      - First, update `createFake` in `migrationRunner.test.ts` per the
        pitfall note: `db.exec` recognizes `VACUUM INTO '<path>'`, appends
        `<path>` to a mutable `backupFiles` array (seeded from
        `existingBackups`) that `backups.list()`/`backups.remove()` now read
        from and splice, and accepts an `options.failBackup` flag that makes
        that one statement `throw new Error('disk full')` instead of
        succeeding (every other `exec` call is unaffected). Run
        `npx vitest run electron/db/__tests__/migrationRunner.test.ts` and
        confirm every pre-existing case in the file still passes unchanged
        with this fake upgrade alone (it must — the upgrade only makes the
        fake track state the old code never inspected).
      - Red: add a new case, "does not prune existing backups when the
        backup write fails, and the error still propagates" — `createFake`
        with `failBackup: true` and 2 seeded `existingBackups`; run a
        pending migration; capture the thrown error
        (capture-then-assert, per `writing-tests.mdc`); assert
        `thrown` `toBeInstanceOf(Error)` with `.message` `toBe('disk full')`;
        assert `fake.backups.removed` `toEqual([])` (exact empty — the two
        seeded backups must still exist). Confirm this fails against current
        `main` order (prune-then-backup: the prune runs unconditionally
        before the failing write, so `removed` is non-empty) — record the
        red output.
      - Green: in `presenter-pro/electron/db/migrationRunner.ts`, swap the
        two lines (`db.exec(VACUUM INTO ...)` before `pruneBackups(...)`) and
        change `pruneBackups`'s retain arithmetic from `Math.max(0, keep -
        1)` to `Math.max(0, keep)` (no reserved slot — the just-written file
        is already in `list()` by the time this runs), updating the function
        doc comment to state the new precondition. Update the big
        `runMigrations` doc comment's numbered step 4 to describe
        write-then-prune. Re-run the full file; confirm the new case passes
        and the pre-existing "prunes old backups so at most 3 remain" case
        (`migrationRunner.test.ts:220-235`) passes **unchanged** (its
        asserted `removed` array does not need editing — worked by hand in
        the Pitfall notes above; if it does not pass unchanged, that is a
        sign the arithmetic is wrong, not a sign to edit the assertion).
      - Verify: `npx vitest run electron/db/__tests__/migrationRunner.test.ts`
        (from `presenter-pro/`).

- [x] 3. **MAIN-B16 — red then green, presentations and media.**
      - Red (presentations): in `realSqlite.queries.test.ts`, extend or add
        next to the existing `'getPresentations lists most recently updated
        first'` case: create two presentations, set **identical**
        `updated_at` on both via raw SQL, and assert
        `presentations.getPresentations(db).map(p => p.id)` `toEqual([higherId,
        lowerId])` (order matters, exact 2-element array). Confirm this is
        flaky/fails against current `main` (SQLite gives no guaranteed order
        for ties) — if it happens to pass by accident on one run, note that
        in findings as expected (SQLite ties are implementation-defined, not
        guaranteed-wrong), but the assertion is still the correct one to add
        since nothing today guarantees it.
      - Red (media): in `realSqlite.queries.test.ts`, inside
        `describe('media and folders', ...)`, add a case: create two media
        items, set identical `created_at` via raw SQL, assert
        `media.getMedia(db).map(m => m.id)` `toEqual([higherId, lowerId])`.
      - Green: add `, id DESC` to the `ORDER BY updated_at DESC` in
        `getPresentations` (`presentations.js:2`) and to the
        `ORDER BY created_at DESC` in `getMedia` (`media.js:2`); add `, id
        ASC` to the end of `getMediaFolders`'s `ORDER BY lower(name) ASC,
        created_at ASC` (`media.js:6`) for the same determinism, with a
        one-line comment noting no test forces this one (two folders sharing
        both name and second are unlikely but the tie-breaker is free).
      - Verify: `npx vitest run electron/db/__tests__/realSqlite.queries.test.ts`
        (from `presenter-pro/`).

- [x] 4. **SONG-16 — red then green, and the one intentional test edit.**
      - Red: edit the existing case
        `'getSongs orders by title and deleteSong removes exactly that row'`
        (`realSqlite.queries.test.ts:83-94`) — change the expected order from
        `['B song', 'C song', 'a song']` (byte order) to `['a song', 'B
        song', 'C song']` (case-insensitive), update the trailing comment
        from `// SQLite ASC is byte order` to state the new, intended
        behaviour, and add a same-title-different-case tie-break case (two
        songs both titled `'Same'`, differing only by id) asserting
        `getSongs(db).map(s => s.id)` `toEqual([firstId, secondId])`
        (creation order via `id ASC`). Run
        `npx vitest run electron/db/__tests__/realSqlite.queries.test.ts`
        and confirm the edited case now fails against current `main` (byte
        order still produces `['B song', 'C song', 'a song']`) — record the
        red output. This is the one deliberate "modify an existing test"
        edit in this plan (Testing Standards item 2): it fails under old
        code, will pass under new code, and is called out here and again in
        the final summary.
      - Green: change `getSongs`'s `ORDER BY title ASC`
        (`presenter-pro/electron/db/queries/songs.js:2`) to `ORDER BY title
        COLLATE NOCASE ASC, id ASC`.
      - Verify: `npx vitest run electron/db/__tests__/realSqlite.queries.test.ts`
        (from `presenter-pro/`).

- [x] 5. **Gate, records, PR.**
      - `cd presenter-pro && npm run gate` — must be fully green; report
        `type-check`, `lint`, and vitest `passed/total (skipped)`. If
        coverage fails, STOP and report — thresholds are never lowered by
        this plan.
      - `cd presenter-pro && npm run format:check`.
      - Append exactly one row to the status table at the end of
        `tasks/fable-pass-plan.md` for DB1.
      - Append `## DB1 — <plain title> (2026-09-13)` at the **end** of
        `tasks/fable-notes.md`, preceded by a `---` line with blank lines
        around it, summarizing all four fixes, the one intentional test
        edit, and the pruneBackups retain-arithmetic subtlety (it is exactly
        the kind of trap future sessions should not rediscover the hard way).
      - Commit (see task instructions for the exact recipe / staged paths /
        hook sequence), push, open the PR with `## Summary` / `## Proof`
        (red+green output for all 4 items) / `## Findings` / `## Records`.

## Compliance Manifest

### `writing-executable-plans.mdc` (always applies)

- **Assertion weakening** — designed against: Anti-weakening clause is
  present verbatim above; each comparison's order/count/exactness is stated
  in that section, and Todos 1–4 each state the exact `toEqual`/`toMatchObject`
  shape expected, never a loosened form. — Todo 1–4, "Anti-weakening clause"
  section.
- **List sampling** — N/A — this plan has exactly 4 audit items, each given
  its own numbered todo (1–4); nothing is enumerated only in prose. No
  iterated/counted collection is being under-implemented here (it's 4 fixed,
  named items, not an open set).
- **Quantifier erosion** — N/A — no "every X" claim in this plan describes an
  open-ended set; MAIN-B2's fix is described as applying to *both* named call
  sites (`getPresentations`, `getPresentation`) via the single shared `parse`
  function, which is itself the mechanism that makes "both" true rather than
  "the first one checked" — Decisions section, "MAIN-B2 fix location".
- **Sanctioned escape hatches** — N/A, none needed — "Sanctioned escape
  hatch" section states why (all 4 items fit the bounded blast radius; a
  skip-if-already-fixed path is explicit and must be reported, not silent).
- **Bounded blast radius** — Todo list header / "Bounded blast radius" table
  above; out-of-bounds files named explicitly.
- **File-specific pitfall notes** — "Pitfall notes" section (5 notes, each
  naming a concrete gotcha with the exact line/test it affects).
- **Exact paths, no improvisation** — "Bounded blast radius" table lists
  every file with its full path; no new test directory is created (all edits
  land in the two existing files under `electron/db/__tests__/`).
- **Per-todo verification** — each of Todos 1–4 ends with a `Verify:` line
  naming the exact `npx vitest run <path>` command; Todo 5 runs the repo-wide
  gate.
- **Snapshot policy inline** — N/A — no snapshot test is added or touched by
  this plan.
- **Preconditions for conditional UI** — N/A — this plan touches no UI/React
  component; every change is in `electron/db/`.
- **Structural floor under every snapshot** — N/A — no snapshot in this plan.
- **IPC contract pinning** — N/A — no `ipcMain`/`ipcRenderer` channel is
  touched; these are internal query/runner functions called directly by main
  and already covered by `shared/ipcContract.ts` elsewhere, unaffected here.
- **Manual verification steps** — N/A — this plan's changes are not
  user-facing UI (sort order and a startup backup step); no click-path exists
  to verify beyond the automated tests. The desktop-app addendum applies to
  user-facing changes, and none of these 4 items render anything new in a
  window.
- **Required findings report** — Todo 5: findings (already-fixed/skip
  decisions if any, the one intentional test edit, the `pruneBackups`
  arithmetic trap) go in the PR's `## Findings` section and in
  `tasks/fable-notes.md`.

### `testing-standards.mdc` (always applies — 10 items)

1. **TDD ordering** — Todos 1–4 each write the red case(s) before the
   production edit, in that order, and each ends with a `Verify:` command.
2. **Behavior-change test edits** — the one edited existing test
   (`realSqlite.queries.test.ts:83-94`, SONG-16) is named explicitly in
   Todo 4 and in the Pitfall notes; it must fail under old code and pass
   under new, and is called out again in the required findings report
   (Todo 5).
3. **No weakened assertions** — "Anti-weakening clause" section states
   order/count/exactness per comparison; every planned assertion is
   `toEqual`/`toMatchObject`/`toBeInstanceOf`+exact `.message`, never
   `.sort()`, set-compare, or `toContain` substituted for exact equality.
4. **Coverage floor** — Todos 1–4 each add at least one new test case per
   fixed behavior (MAIN-B2: 2 cases; MAIN-B13: 1 case + 1 fake-fidelity
   check; MAIN-B16: 2 cases; SONG-16: 1 edited + 1 new tie-break case).
5. **Lint floor** — N/A — no `.only`/`.skip` is introduced; every new test
   has a real `expect`; no `expect` is placed inside `if`/`catch` (Todo 2's
   capture-then-assert follows the `writing-tests.mdc` pattern explicitly).
6. **Snapshot discipline** — N/A — no snapshot in this plan.
7. **Completion gate** — Todo 5 runs `npm run gate` and reports
   `type-check`/`lint`/vitest `passed/total (skipped)`.
8. **Vitest / jsdom mechanics** — N/A for jsdom/Zustand/ipc.js specifics (no
   DOM, no store, no renderer IPC touched); the applicable mechanic —
   never load `better-sqlite3` outside the real-DB helper pattern — is
   followed by reusing `openMigratedMemoryDb()`/`db.close()` exactly as the
   existing file does (Pitfall notes).
9. **Test placement** — all edits land in the two existing files under
   `presenter-pro/electron/db/__tests__/` (`realSqlite.queries.test.ts`,
   `migrationRunner.test.ts`), matching the "Electron main / IPC contract" /
   real-DB row in the Test placement table; no new test directory created.
10. **Characterization before refactor** — N/A — this plan does not extract
    or restructure any of the six large files named in
    `testing-standards.mdc`; it edits small, already-tested query/runner
    functions in place.

## Findings (2026-09-13)

- All 4 items applied as scoped; none were already fixed or wrong on `main`.
- The one intentional test edit: `realSqlite.queries.test.ts`'s
  `'getSongs orders by title...'` case (SONG-16), which asserted the old
  byte-order output with a `// SQLite ASC is byte order` comment — now
  asserts case-insensitive order, fails under old code, passes under new.
- The `pruneBackups` retain-arithmetic trap (Decisions/Pitfall notes) was
  real: a naive line-swap without changing `keep - 1` to `keep` would have
  silently under-retained backups by one in production while the existing
  unit test stayed green, because that test's original fake didn't model
  the real `fs`-backed `BackupStore.list()` seeing the just-written file.
  Fixed both together; the pre-existing "prunes old backups" assertion
  needed no change once the arithmetic was right.
- No suspected regression found. 8 new test cases across the two touched
  files plus the one edited case; `npm run gate` green
  (type-check ✓, lint ✓, vitest 571/571 passed, 0 skipped); coverage
  30.33/27.89/27.77/31.23 vs. thresholds 26.8/24.7/24.4/27.7 (untouched,
  not lowered).
