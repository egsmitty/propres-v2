# Executable Plan S1 — the first-run sample ships only public-domain lyrics

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked) — items **SONG-28**
(legal, P1), **SONG-4**, **MAIN-B10**.

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, `main` @ `fecfd2b`)

`electron/main/index.js` `seed(db)` runs once on first launch, gated by
`settings.initialized` (`index.js:507-509`), and inserts three songs plus a
sample presentation:

- `index.js:513-515` — "Amazing Grace" filed under `ccli: '4755360'`, which is
  the CCLI number for *"Amazing Grace (My Chains Are Gone)"*, not the public-
  domain hymn. `index.js:540` — its "Chorus" slide body is `"My chains are
  gone\nI've been set free\nMy God my Savior has ransomed me"` — Tomlin/Giglio
  2006, copyrighted.
- `index.js:548-550` — "How Great Is Our God", Chris Tomlin, `ccli:
  '4348399'`. `index.js:557,566,575` — verse/chorus/bridge bodies are the
  copyrighted lyrics verbatim ("The splendor of the King…", "How great is our
  God…", "…Worthy of all praise").
- `index.js:583-585` — "Build My Life", Housefires, `ccli: '7070345'`.
  `index.js:592,601` — verse/chorus bodies are the copyrighted lyrics verbatim
  ("Worthy of every song…", "Holy there is no one like you…").
- `index.js:614-632` — the sample presentation "Sunday Morning Service" is
  built by copying each inserted song's own slides into a section, so all
  three copyrighted songs land in the sample presentation too.
- `index.js:634` — `settings.initialized` is written in a separate,
  unguarded `.run()` after every insert above, with no transaction
  (**MAIN-B10**): a crash between the first `createSong` and this line leaves
  partial rows with no `initialized` flag, so the next launch runs `seed()`
  again and duplicates them.

`shared/hymns.json:1-41` is the existing source of truth for public-domain
hymns. Its `amazing-grace` entry (`author: "John Newton"`, `publicDomain:
true`, no CCLI field) carries five verses; verses 1-3
(`shared/hymns.json:12-27`) are Newton's original text, textually distinct
from `index.js`'s seeded chorus (that "My chains are gone" stanza does not
appear anywhere in `hymns.json`).

`src/utils/builtInSongSeed.js:1-16` (module doc) — the renderer seeds these
same public-domain hymns into the song library on every launch, matched
**only** by `built_in_key`, never by title or tag. It never deletes anything.

`electron/db/migrationList.ts:127-153` — migration 3 adopts a legacy unkeyed
row into a built-in hymn's identity only if `tags LIKE '%"built-in"%'`. The
seed's songs are tagged `'["hymn","classic"]'`
(`index.js:516`) / `'["contemporary","worship"]'` (`index.js:551,586`) — none
contains `"built-in"` — so migration 3 never touches them. Confirms
**SONG-4**: a fresh install's "Amazing Grace" from `seed()` and the renderer's
keyed "Amazing Grace" are two independent, permanently-unmatched rows.

`e2e/hymns.spec.ts:48-50` — a comment explicitly documents and relies on
`seed()`'s unkeyed "Amazing Grace" existing (title collision, never touched by
migration 3); the test itself asserts by row **count** and by `built_in_key`,
never by title, so it is not logically coupled to that row's existence.

`electron.vite.config.js:50-53` — the main-process Rollup input map already
carries a same-pattern entry, `'main/closeController':
resolve(__dirname, 'electron/main/closeController.ts')`, required from
`index.js` via `require('./closeController')` (`index.js:12`) because the main
process is CommonJS and resolves relative `require`s against the built output
directory at runtime.

## Decisions

1. **`seed()` creates no songs of its own.** The renderer's
   `ensureBuiltInSongsSeeded()` (`src/utils/builtInSongSeed.js`) already
   supplies the public-domain hymn library from `shared/hymns.json`; a second,
   independent song-seeding path in `seed()` is exactly what produced SONG-4.
   Removing it fixes SONG-4 as a side effect — Todo 2 verifies this with a
   grep, not just an assertion.
2. **The sample presentation keeps its title** ("Sunday Morning Service", so
   every `e2e/*.spec.ts` locator that matches on that title keeps working) but
   its one section's slide text is copied **verbatim** from
   `shared/hymns.json`'s `amazing-grace` verses 1–3 (Newton, public domain, no
   CCLI). The section is no longer built from an inserted song row — nothing
   in the app requires a presentation section to reference an actual `songs`
   row (`index.js:614-627` never stored one either; it only ever copied slide
   data by value).
3. **Seed data moves to a new electron-free module**,
   `electron/main/firstRunSeed.ts`, exporting a plain constant
   `FIRST_RUN_PRESENTATION`. `index.js` requires it
   (`const { FIRST_RUN_PRESENTATION } = require('./firstRunSeed');`) the same
   way it already requires `./closeController`. This is what makes the data
   unit-testable without loading `better-sqlite3` or `electron`.
4. **`seed()`'s body is wrapped in `db.transaction(() => { ... })()`**
   (MAIN-B10): the presentation insert and the `settings.initialized` write
   become one atomic unit, so a crash mid-seed can never leave partial rows
   with no `initialized` flag.
5. **`e2e/hymns.spec.ts`'s comment is updated, not its assertions.** Lines
   48–50 describe main's seed as producing an unkeyed "Amazing Grace" row;
   after Decision 1 it produces none. The test's own logic (row count +
   `built_in_key`, never title) is unaffected and is left alone — only the
   stale comment is corrected, so it does not mislead the next reader about
   why the row-count/key approach was chosen.
6. **No other `e2e/*.spec.ts` file changes.** Every other reference found by
   grep matches on the presentation **title** only (`/Sunday Morning
   Service/`), which Decision 2 preserves exactly.

**Anti-weakening clause (verbatim):** *If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression.*

Comparisons: the banned-phrase sweep is **case-insensitive substring**
matching by design (it must catch a re-wording, not just the exact seed
string) — this is a deliberate widening for safety, not an assertion
weakening, and is paired with the exact structural-floor counts below, which
ARE exact (`toBeGreaterThanOrEqual`, stated as a floor, not a range, because
the point is "at least one real section/slide exists", not a specific count).
The CCLI sweep is exact: no object in the seed data may have a `ccli` (or
`CCLI`) key with a truthy value, checked by full key enumeration, not a
sample.

## Blast radius

May create: `presenter-pro/electron/main/firstRunSeed.ts`,
`presenter-pro/electron/main/__tests__/firstRunSeed.test.ts`, this plan, the
`fable-pass-plan.md` status row, the `fable-notes.md` entry.

May change: `presenter-pro/electron/main/index.js` (only the `seed(db)`
function body, replacing the inline song/presentation literals with a
`require('./firstRunSeed')` + transaction wrapper — no other function in this
file), `presenter-pro/electron.vite.config.js` (only: add one Rollup input
line for `main/firstRunSeed`, next to `main/closeController`),
`presenter-pro/e2e/hymns.spec.ts` (only the stale comment at lines 48–50).

**May not** change: any other file under `presenter-pro/e2e/`, any file in the
OUT-OF-BOUNDS list in this PR's brief (`src/pages/Editor.jsx`,
`src/components/presenter/**`, `OutputSettingsModal.jsx`, `appCommands.js`,
`TitleBar.jsx`, `MenuBar.jsx`, `shared/{Dialog,ContextMenu,ShortcutsOverlay}.jsx`,
`presenterFlow.js`, `presentationCommands.js`), or any region of
`electron/main/index.js` outside `seed(db)`. `shared/hymns.json` is read, not
edited — its text is copied by value into the new seed module, matching how
`index.js` already worked (seed data was always copied by value, never a live
reference).

## Todos

- [x] 1. **Red:** `electron/main/__tests__/firstRunSeed.test.ts`. First extract
  `FIRST_RUN_PRESENTATION` verbatim from the current `index.js` seed data (the
  three-song, copyrighted version) into `firstRunSeed.ts` as a throwaway
  intermediate, so the test is red against real current content, not an
  already-fixed fixture. Cases (**3 total, exhaustive**):
  1. **Banned phrases** — collect every string value in
     `FIRST_RUN_PRESENTATION` by recursive walk (arrays + objects), assert
     none contains, case-insensitive, any of the 5 phrases: `my chains are
     gone`, `how great is our god`, `worthy of every song`, `holy there is no
     one like you`, `the splendor of the king`. Iterates the collected list
     and asserts on all of it (no `.find`/early-exit) so a partial fix cannot
     pass.
  2. **No CCLI** — recursively enumerate every object key in
     `FIRST_RUN_PRESENTATION`; assert no key matching `/^ccli$/i` has a truthy
     value.
  3. **Structural floor** — `FIRST_RUN_PRESENTATION.sections.length >= 1` and
     the sum of every section's `slides.length` is `>= 1`.
  Verify (red): `npx vitest run electron/main/__tests__/firstRunSeed.test.ts`
  → cases 1 and 2 fail against the extracted copyrighted data; case 3 passes
  (structure is already valid) — record the actual failing count, do not
  assume.
- [x] 2. Replace `firstRunSeed.ts`'s content with the fixed data per Decisions
  1–2 (no songs array; one section, "Amazing Grace", 3 slides copied verbatim
  from `shared/hymns.json` verses 1–3). Verify: same command, **3/3 pass**.
  Then `grep -rn "How Great Is Our God\|Chris Tomlin\|Housefires\|4348399\|7070345\|My chains are gone" electron/main/firstRunSeed.ts electron/main/index.js` →
  must return nothing, confirming SONG-4's premise (no independently-seeded,
  unkeyed hymn row survives) — record the empty result in the findings report.
- [x] 3. `index.js`: `require('./firstRunSeed')` for `FIRST_RUN_PRESENTATION`;
  `seed(db)` builds its one `createPresentation` call from that constant
  (fresh `generateId()`s per slide/section so re-seeding two profiles never
  collides); delete the inline `songs` array and the `insertedSongs` /
  `sections` derivation. Wrap the insert + `settings.initialized` write in
  `db.transaction(() => { ... })()` (Decision 4, MAIN-B10). No other line in
  `index.js` changes.
- [x] 4. `electron.vite.config.js`: add
  `'main/firstRunSeed': resolve(__dirname, 'electron/main/firstRunSeed.ts')`
  next to the `main/closeController` entry.
- [x] 5. `e2e/hymns.spec.ts`: fix the stale comment at lines 48–50 per
  Decision 5. No assertion in this file changes.
- [x] 6. `npm run gate` && `npm run format:check` from `presenter-pro/`.
- [x] 7. Findings report in the PR body: the grep result from Todo 2, the
  `e2e/hymns.spec.ts` comment-only edit, and the full list of
  `e2e/*-snapshots/*.png` baseline names whose capture opens "Sunday Morning
  Service" or its song library (text/list content changed, so CI may need a
  recapture — no PNG is edited by this plan).

Manual verification: N/A — no Playwright/E2E run and no app launch in this PR
per the brief; the desktop-app addendum's "verify in a running window" step is
explicitly out of scope here and is called out as unverified in the findings.

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause verbatim above; exactness stated under Decisions/Comparisons (structural floor is a stated floor, not loosened from an equality) |
| List sampling designed against | Todo 1 enumerates all 5 banned phrases and all 3 test cases by count; case 1 walks the full string set, not a sample |
| Quantifier erosion designed against | Case 1 iterates every string in the tree (recursive walk, no early return); case 2 iterates every key |
| Sanctioned escape hatch | N/A — no allowlist; nothing here is expected to need an exemption |
| Bounded blast radius | "Blast radius" section |
| File-specific pitfall notes | Measured § on `electron.vite.config.js`'s CommonJS-relative-require requirement (Decision 3); Measured § on migration 3's exact tag string (why SONG-4 happens) |
| Exact paths | Blast radius lists every file |
| Per-todo verification | Todos 1–6 each name their command |
| Snapshot policy inline | N/A — no unit-test snapshots; Todo 7 covers the E2E visual-baseline finding without touching any PNG |
| Preconditions for conditional UI | N/A — no UI, no gated control |
| Structural floor under snapshots | N/A — no snapshot; case 3 is itself the structural-floor pattern applied directly to the seed data |
| IPC contract pinning | N/A — no `ipcMain`/`ipcRenderer` channel touched |
| Manual verification steps | N/A — explicitly out of scope per the brief; called out in Todo 7 / findings |
| Required findings report | Todo 7 |

## Review

`seed(db)` (`electron/main/index.js`) no longer inserts any `songs` rows — the
three copyrighted songs (wrong-CCLI "Amazing Grace" with a grafted-in
copyrighted chorus, Chris Tomlin's "How Great Is Our God", Housefires' "Build
My Life") are gone. The sample presentation "Sunday Morning Service" now has
one section, "Amazing Grace", with 3 slides copied verbatim from
`shared/hymns.json` (John Newton, public domain, no CCLI). Seed data moved to
`electron/main/firstRunSeed.ts` (new, electron-free, exports
`FIRST_RUN_PRESENTATION`); `index.js` requires it and wraps the whole seed
(insert + `settings.initialized` write) in `db.transaction(() => {...})()`
(MAIN-B10). `electron.vite.config.js` gained one Rollup input line.
`e2e/hymns.spec.ts` had a stale comment corrected; its assertions are
unchanged. `grep` confirms no copyrighted title/CCLI/lyric string remains in
either main-process file (Todo 2), which is also the SONG-4 fix: `seed()`
creating zero songs means there is nothing left for migration 3 to fail to
reconcile with the renderer's keyed hymn seeder.

`npx vitest run electron/main/__tests__/firstRunSeed.test.ts` went from 1/3
passing (structural floor only) to 3/3 after the data fix — the red step used
a verbatim, byte-for-byte extraction of the pre-fix `index.js` content
(including a throwaway `ccli` field moved onto each section, since the real
bug lived on the song row a section used to be copied from) so the two content
assertions were provably exercised against real current behavior, not an
already-safe fixture.

`npm run gate`: type-check pass, lint pass (0 warnings), 568/568 vitest tests
pass (0 skipped), coverage 30.31/27.86/27.76/31.21 (statements/branches/
functions/lines) against thresholds 26.8/24.7/24.4/27.7 — no threshold
change. `npm run format:check` passes.

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (red, against the extracted-verbatim copyrighted data) before Todo 2 (fix) |
| 2 | Behavior-change test edits | `e2e/hymns.spec.ts` comment-only edit (Todo 5) is documentation, not a tested-behavior change; its assertions are untouched (Decision 5) — N/A for the "must fail old / pass new" clause since no assertion changed |
| 3 | No weakened assertions | Clause verbatim; comparisons section states which checks are exact (CCLI, structural floor) vs. deliberately-broad-by-design (case-insensitive substring sweep) |
| 4 | Coverage floor | 3 cases cover the 3 distinct risks (residual copyrighted text, residual CCLI numbers, empty/broken seed data) |
| 5 | Lint floor | No `.only`/`.skip`; each case asserts; no `expect` inside `if`/`catch` (walk collects into an array first, asserts after) |
| 6 | Snapshot discipline | N/A — no snapshot in the new unit test |
| 7 | Completion gate | Todo 6 |
| 8 | Vitest/jsdom mechanics | Node environment (no jsdom needed — pure data test); no `better-sqlite3` or `electron` import; `firstRunSeed.ts` has zero electron/db imports by construction (Decision 3) |
| 9 | Test placement | `electron/main/__tests__/firstRunSeed.test.ts`, matching the "Electron main / IPC contract" row |
| 10 | Characterization before refactor | N/A — `firstRunSeed.ts` is new data extracted verbatim first (Todo 1), then corrected (Todo 2); `seed(db)` itself is a 6-line wrapper after the move, not a restructuring of untested logic that needed pinning first |
