# Fable's Notes — Opinions, Corrections, and Recommendations

Kept as instructed: anything I doubted, corrected, or would recommend that sits
outside the plans as written. Ethan asks for this file at the end. Entries are
dated and honest; where I disagree with a prior decision I say so and why.

---

## 1. Proofread of the plans (2026-09-06, before executing anything)

I was told to doubt everything. I did. Verdict: the plans are structurally
sound and the Compliance Manifest discipline is real, but each had at least one
factual error that would have produced a wrong or fragile implementation.

### Plan A1 — versioned migrations

**A1-1. The baseline design had a data hole.** The plan said: if
`schema_migrations` is absent and legacy tables exist, _record_ every migration
as applied _without executing it_. That assumes every existing database already
has every column. It only does if it was launched by a build that ran the
current ten `ALTER TABLE`s. A user who skipped a version would be baselined
past columns they do not have, and the first query touching one would crash.
**Fix:** migration 1 is _idempotent by inspection_ — it checks
`PRAGMA table_info` before each `ADD COLUMN` and `sqlite_master` before each
`CREATE` — and is simply _run_ on every database, legacy or fresh. No skip
path exists, so there is nothing to get wrong. Simpler and safer.

**A1-2. File-copy backup is unsafe under WAL.** The database is opened with
`journal_mode = WAL`. Copying the `.db` file while open can miss pages still in
the `-wal` file, producing a backup that is silently inconsistent — exactly when
a backup matters most. **Fix:** use better-sqlite3's `db.backup(path)`, which
performs a proper online backup through SQLite's backup API.

**A1-3. The runner itself had no tests.** The plan only tested the pure planner
(ordering, baseline detection). The thin shell — transaction boundaries,
recording each version after its SQL, stopping on first failure — was
"verified manually". That is the part that destroys data if wrong. **Fix:** the
runner takes a minimal DB interface (`exec`, `prepare`, `transaction`,
`backup`) so a fake can record every call. Unit tests now assert the exact SQL
sequence and that a failing statement rolls back and records nothing.

**A1-4. The native-module premise was right for the wrong reason, and is
fragile.** `require('better-sqlite3')` _succeeds_ under Node 20 here — only
`new Database()` fails, because the binary is built for Electron's ABI (121 vs
Node's 115). In CI the gate installs with `--ignore-scripts`, which leaves the
_Node_ prebuilt in place, so the same test would pass there and fail locally
after any full `npm install`. Tests must not depend on either state. The
injected-interface design above is what makes that true.

### Plan P1 — process hardening

**P1-1. The Dependabot/commitlint claim was wrong.** The plan said Dependabot's
PRs would fail the `commit-msg` hook without a `chore` prefix. Husky hooks run
_locally_ on the committing machine; Dependabot commits on GitHub, where no
hook runs. The prefix is still worth setting for a clean conventional history —
but it is not a blocker and the plan overstated it. Corrected in the plan.

### Plan P2 — E2E harness

**P2-1. The plan forbade the one change that makes it possible.** It banned
touching `electron/`. But `electron/main/index.js` uses
`isDev = !app.isPackaged` and hardcodes `http://localhost:5173` in three
places. Playwright launches `out/main/index.js` unpackaged, so `isDev` is true
and the app would try to reach a dev server that is not running. Every E2E
would fail on launch. **Fix:** the electron-vite convention —
`process.env.ELECTRON_RENDERER_URL` is set by `electron-vite dev` (verified in
`node_modules/electron-vite/dist/chunks/lib-t2ExBjL5.mjs`) and unset
otherwise. Loading from that env var when present, else from the built file, is
the documented pattern. It is a full fix, not an E2E hack: it also makes
`npm run preview` work, which is currently broken by the same hardcoding.

**P2-2. "No `Error:` line in stderr" is too strict.** Electron and Chromium
emit benign `Error`-prefixed lines on some platforms. Asserting on that would
make the launch test flaky, and a flaky launch test would be disabled within a
week. **Fix:** assert on the specific failure modes that matter — `Cannot find
module` and unhandled exceptions — not on the word "Error".

**P2-3. The unsaved-changes flow does not need typing.** `createNewPresentation`
sets `requiresInitialSave(true)`, so a freshly created blank presentation
already triggers the prompt on close. That removes the most fragile step
(driving a `contentEditable` canvas through Playwright). Simpler test, same
guarantee.

---

## 2. Execution-order decision

The charter says P1 and P2 are independent of A1. True. I am running **P2
before A1** anyway: A1's riskiest failure is a packaging error the build reports
as success (this already happened once with `closeController`), and P2's launch
smoke test catches exactly that. Building the safety net before the risky data
change is the right order. P1 is trivial and goes first.

---

## 3. Recommendations outside the plans

These are opinions. None are actioned without Ethan's say-so.

**R1. Electron 29 is end-of-life.** Electron supports the three most recent
majors; 29 shipped in early 2024 and stopped receiving security fixes long ago.
Chromium CVEs land constantly. For an app that loads local media files, this
is the single largest _security_ debt in the project, ahead of anything in the
lint backlog. Dependabot (P1) will surface the upgrade; it will be a major PR
with real breakage risk and deserves its own plan. I would schedule it before
Workstream E.

**R2. Node 20 is holding back the toolchain.** `@electron/rebuild@4` and
`node-abi` both warn `EBADENGINE: required node >=22.12`. Node 20 is
maintenance-only. Bumping `.nvmrc` and `engines` to 22 LTS is small and unblocks
current tooling. Best done together with R1.

**R3. "Autosave + journal" — I would ship the journal first.** Opus flagged the
consequence and I agree with it more strongly: continuous autosave to the real
record removes the ability to abandon a bad edit, and this app's users are
volunteers editing under time pressure. A crash-recovery journal alone
eliminates the data-loss risk _without_ changing what Save means. Autosave can
follow once undo history is persistent. This is a product call, so it is
recorded here rather than changed.

**R4. Test count is becoming a vanity metric.** 124 "tests" includes ~20 from
`it.each` over every npm script — one assertion, twenty rows. That is fine as a
guard, but "N tests passing" should not be read as N units of confidence.
Coverage percentage and _which paths_ are covered are the honest numbers.

**R5. `enforce_admins` should have been on from the start.** Protection that
the owner silently bypasses is theater; the earlier direct push to `main`
proved it. P1 fixes this.

**R6. Consider `app.requestSingleInstanceLock()` sooner than Workstream C.**
Two PresenterPro instances open on a live machine, both bound to the same
output display and the same SQLite file, is a plausible Sunday-morning failure.
It is a five-line change.

---

## 4. Running log

_(appended as work proceeds)_

### 2026-09-06 — P1 done, P2 done

**P1 (process hardening)** — config only. Dependabot for npm + github-actions
(non-majors grouped, majors individual, no `ignore`). `enforce_admins` verified
`true`; required checks still exactly `["PR Gate"]`. Gate unchanged at 124/124.
PR #17.

**P2 (E2E harness)** — 7 specs, 7/7 across five consecutive full runs after the
teardown fix (8.8–9.2s each). Gate 129/129 (124 + 4 renderer-loading guards +
1 script-table row). Things worth knowing:

- _The dev-server hardcoding was real and blocked every launch_, exactly as the
  proofread predicted. Fixed with `ELECTRON_RENDERER_URL` at all three load
  sites; the guard test failed first (2/4) and passes after (4/4). `npm run
preview` now works too.
- _`--user-data-dir` is honored by Electron_ — the isolation check passed on
  every launch. I made the check honest in code: it is detection, not
  prevention, because the app opens SQLite during `ready` before any evaluate
  can run. The switch is the prevention; the check makes a regression loud.
- _Playwright's `app.close()` is the wrong teardown for this app._ It requests a
  graceful quit, which correctly runs the unsaved-changes handshake and blocks
  on the dialog — so a spec that leaves a document unsaved hangs teardown for
  60s and poisons the worker. Electron's `app.exit(0)` (immediate, skips
  `before-quit`, closes windows without asking) is the right tool; SIGKILL only
  as a last resort because it leaves helper processes lingering. This also cut
  suite time from ~24s to ~9s.
- _Never call `app.process()` after the app may have exited_ — Playwright
  disposes its wrapper and the accessor throws an internal TypeError, which made
  a **successful** quit look like a failed test. The child process is captured
  at launch instead. The quit spec now waits on the real OS `exit` event and
  asserts exit code 0.
- _One cold-start `firstWindow` timeout_ was observed on a worker's first launch
  with empty stdout/stderr — a slow start, not an error. First-window allowance
  raised to 60s (test timeout 90s). Zero recurrences in five runs; if it
  returns on CI, investigate macOS Gatekeeper on freshly built binaries before
  raising it further.
- _Added one spec beyond the plan_: "Cancel on a quit keeps the app running".
  It exercises the deferred-quit path (`before-quit` → handshake → Cancel must
  cancel the _quit_, not just the window close), which is the newest and least
  exercised code in the lifecycle fix. Cheap, and it passes.
- _Blast-radius deviations, reported per the plan_: `package-lock.json`
  (dependency install — unavoidable), `.prettierignore` and `tsconfig.json`
  (not in the table; needed so E2E files are type-checked in the gate and
  Playwright output is not format-checked). Both should have been listed.
- _E2E is a separate workflow (`e2e.yml`), not in `PR Gate`_, per pitfall 5.
  Promote it once it has a green streak on CI.

### 2026-09-06 — A1 (versioned migrations) implemented

- **Backup uses `VACUUM INTO`, not `db.backup()`.** My own proofread (A1-2)
  chose `db.backup()`; it is async, which would force `runMigrations` async and
  a change to `electron/main/index.js` outside A1's blast radius. `VACUUM INTO`
  is synchronous and consistent under WAL (it reads through a normal
  transaction). Same guarantee, no startup-sequence change. Recorded here
  because it contradicts the amended plan text.
- **The plan says six tables; there are five** (songs, media, media_folders,
  presentations, settings). The proofread missed it. Migration 1 has five.
- **A test of mine was wrong, not the code.** The "ascending order" runner spec
  passed a misordered list `[m2, m1]`; `assertMigrationsWellFormed` rejects
  that by design. Fixed the input, kept the assertion — the applied order and
  full call sequence are what is under test.
- **I hand-computed a unix timestamp wrong** in a test expectation. Now derived
  from the same fixed `Date`. Lesson for the rules file: never hand-compute
  values in assertions when they can be derived from the fixture.
- **`eslint-suppressions.json` had to be pruned** (71 → 61): the ten
  `no-empty` suppressions became unused and ESLint 9 treats unused suppressions
  as an error. The amended plan listed that file as do-not-touch, which is
  wrong whenever a plan fixes suppressed violations — pruning is the documented
  workflow. Deviation reported.
- **Backup filenames avoid colons** (`20260906T153000Z`) so they are valid on
  Windows. Given the `dist:win` history, this codebase's Windows blind spots
  are worth assuming everywhere paths are built.

### 2026-09-06 — A1 verified against real databases (copies)

Made the plan's "existing database" manual check mechanical:
`e2e/tools/verify-legacy-db.mjs <db>` copies a database into a throwaway
profile, launches the BUILT app there, and diffs row counts before/after.
Ethan can run it on any installation before upgrading. Results on this
machine, both against copies:

| Database                                | Before                                                     | After                                                       | Migration   | Backup    |
| --------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ----------- | --------- |
| `PresenterPro/` (packaged app, 640K)    | 47 presentations · 7 songs · 15 media                      | identical                                                   | v1 recorded | 1 written |
| `presenter-pro/` (older dev build, 28K) | 2 · 3 · 3, **no `media_folders` table, 8 columns missing** | identical; table created, all 8 columns added by inspection | v1 recorded | 1 written |

The second one is exactly the case the proofread's A1-1 fix exists for: the
original "baseline and skip" design would have recorded that database as
fully migrated and left `media_folders` and eight columns missing.

Also observed, and I got it wrong once before checking: `seed(db)` runs after
migrations and inserts a sample presentation and songs — but only when
`settings.initialized` is absent. Every real database has that row, so my
synthetic legacy fixture was _less_ realistic than reality and the seeded
sample tripped an exact-equality assertion. Fixed the fixture (it now carries
`initialized`), not the assertion. Lesson: a synthetic fixture must reproduce
the invariants a real installation always has, not just its schema.

**A1 E2E: three wrong theories before the right one.** The legacy spec failed
on extra rows. I blamed main's `seed()` (partly right — it is gated by
`settings.initialized`, and the fixture lacked that row, so the fixture was
unrealistic), then the renderer's keyed hymn seeding (right mechanism), then
mis-read a `built_in_key` NULL that was actually a **timing** artifact: the
renderer seeds four hymns asynchronously ~1s after the window loads, and my
query landed mid-seeding. Dumping the actual rows at two points in time settled
it in one run. Lesson recorded: when an assertion fails on data the app wrote,
dump the rows before theorizing. Filtering to `built_in_key IS NULL` makes the
user-data assertion independent of that race. Reading the seeder also surfaced
phase7 #14 (it can overwrite/delete a user's hymn-titled song) — not fixed
under A1; needs a decision.

**A1: the E2E improved the design.** The legacy-database spec asserted the
backup has no `schema_migrations` table — and it did, empty, because the runner
created the tracking table before backing up. A backup should be the database
_untouched_. Reordered: detect the table via `sqlite_master`, read applied
versions only if present, back up, _then_ create the table; a fully-applied
database now sees zero writes on launch. The unit tests changed to describe
that stricter contract — a deliberate behaviour change, stated as such. This
is the pattern the charter asks for: a mechanical check found a flaw no reading
would have.

### 2026-09-06 — Dependabot's first sweep (10 PRs, triage)

Dependabot ran immediately on config creation. All PRs run the full gate, so
nothing merges unverified. Recommended dispositions, for Ethan:

| PR      | Update                                                                             | Disposition                                       | Why                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #24     | npm minor+patch group                                                              | **merge when green**                              | that is the point of grouping                                                                                                                             |
| #19–#23 | GitHub Actions majors (checkout, setup-node, upload/download-artifact, gh-release) | **merge when green, one at a time**               | action majors are usually runtime-only (Node 20 → 24); the gate proves each                                                                               |
| #28     | typescript 5.9 → 7.0                                                               | **hold — add to `ignore` as a recorded decision** | TS 7 is outside `typescript-eslint`'s supported range (`<6.1`) and removed `baseUrl`; this exact version was deliberately pinned away from during Phase 6 |
| #25     | @electron/rebuild 3 → 4                                                            | **hold until Node 22**                            | requires Node ≥22.12; `.nvmrc` pins 20 (see R2)                                                                                                           |
| #26     | electron-vite 2 → 5                                                                | **hold — needs its own plan**                     | three majors at once across the build toolchain; couple it with the Electron upgrade (R1)                                                                 |
| #27     | @commitlint/config-conventional 20 → 21                                            | merge when green                                  | low risk; hooks are local                                                                                                                                 |

`ignore` entries for #28 and #25 are the _recorded-decision_ path the
dependabot.yml comment describes — not pre-emptive pinning. Filed as a small
follow-up PR rather than mixed into A1.

**Two process findings from the first Dependabot sweep.**

1. _Every Dependabot PR fails `npm ci`_ with "package.json and package-lock.json
   are not in sync — Missing: esbuild@0.28.2 … @esbuild/<platform>". Dependabot's
   lockfile regeneration is dropping esbuild's optional platform packages, so
   its PRs cannot pass the gate as opened. This is Dependabot's lock, not ours
   (our lock installs cleanly on macOS, Windows, and Linux CI). Workaround per
   PR: check out the branch, run `npm install`, push the corrected lock. Worth
   an upstream look before relying on grouped auto-updates. Recorded rather
   than fixed — outside every plan's blast radius.
2. _`git check-ignore` does not report tracked files._ I misread "NOT matched"
   as a broken rule; the rule was fine. The artifact got tracked because the A1
   branch was cut from `main` before P2's ignore rules existed there, and a
   `git add -A` swept it in. Untracked now; cannot recur once branches are cut
   from current `main`. Lesson: cut branches from freshly fetched `main`, and
   never `git add -A` — add paths.

**lint-staged had a gap.** Its globs covered `js,jsx,ts,tsx` but not `.mjs`/`.cjs`,
so `e2e/tools/verify-legacy-db.mjs` was committed unformatted and CI's
`format:check` (which covers everything) went red. Globs now include `mjs`,
`cjs`, `yml`, `yaml`. The pre-commit hook and the CI check must cover the same
set, or the hook silently lies.

## 5. Decisions from Ethan (2026-09-06, via the questions modal)

| Question            | Decision                                                                                                                              | Consequence                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A2 model            | **Journal first.** Save keeps its meaning; a crash-recovery journal eliminates data loss; autosave waits for persistent undo history. | Plan A2 = recovery journal only. R3 accepted.                                                           |
| Electron 29 EOL     | **Plan it next, after A2.** Electron → current, Node 20 → 22, then @electron/rebuild 4 / electron-vite 5.                             | Becomes plan U1, sequenced after A2, run behind the E2E harness.                                        |
| Seeder (phase7 #14) | **Match by `built_in_key` only, never delete.** Title matching becomes a one-time versioned data migration.                           | Becomes plan A3 — and it is also the first _data_ migration (migration 2), which exercises A1 for real. |
| Dependabot          | **Fix the lock on the safe PRs** (#24, #27; the Actions bumps need only a branch update).                                             | Done by me; see the running log.                                                                        |

### 2026-09-06 — A2 (crash-recovery journal) implemented

- **Escape must never discard.** With `[Discard, Recover]`, DialogHost resolves
  Escape to the first action. Added **Later** as the cancel action (keep the
  journal, ask next launch). Deviation from the plan text, stated in the plan.
- **A fresh profile has two presentations, not one.** Main's `seed()` inserts a
  sample "Sunday Morning Service"; the E2E helper assumed a single row and
  failed before ever reaching the recovery dialog. Same family as the earlier
  seeding surprises: synthetic expectations about a fresh database are wrong
  until checked against what the app actually seeds.
- **The staleness rule works as designed:** the journal's `base_updated_at`
  equalled the row's `updated_at` after a crash (verified by dumping both).
  `touchPresentation` bumps `updated_at` on close/open, which correctly
  invalidates a journal only when the row genuinely changed after the snapshot.
- **IPC drift guard now exists** (`ipcChannels.test.ts`): main handlers and
  preload wrappers must be the same set. Zero drift locked in; the three
  journal channels are covered. This was workstream B's first rule, brought
  forward because the pinning rule required it.
- **Git lesson, expensive:** deleting a stale `index.lock` left by a
  concurrent background `git fetch` corrupted the index (every file showed as
  untracked). `git reset` (mixed) rebuilt it from HEAD without touching the
  working tree. Never run foreground git while a background job may hold the
  lock; and never `rm index.lock` without checking for a live process.
- Behaviour-change test edits (stated per the rule): `migrations.spec.ts`
  expected version lists `[1]` → `[1, 2]` and the table list gained
  `presentation_journal`. Each failed under the old code and passes now.

### 2026-09-06 — GitHub issues triage (Ethan: "check for up-to-dateness; fix if true, else close")

Seven open issues (#3–#9), all filed 2026-05-14, ~26 items across Home, templates,
song editor, editor layout, song library, media library, presenter. Every item
was checked against the code on `main`, not the commit log. **All 26 are
implemented**; no code change was needed. Each issue was closed with an
item-by-item comment citing `file:line`.

Two places where a first grep gave the wrong answer, corrected before acting:
"collapsed on open" (the filmstrip sets `next[section.id] = true` on
presentation change — I had grepped for `collapsed: true`), and the media
library's menu options (built from handlers, not string labels). Lesson, again:
grep hits are leads, not verdicts.

Dependabot: #24 and #27 (npm) and #19–#23 (Actions) merged after branch
updates; #25/#28 closed as recorded holds; **#26 (electron-vite 2 → 5) left
open on purpose** as the reminder for plan U1.

### 2026-09-06 — A3 (seeder key-only + migration 3) implemented

- **The migration list moved to TypeScript** (`electron/db/migrationList.ts`).
  Not planned: the first unit test that imported `migrations.js` failed to load
  because its CommonJS `require('./migrationRunner')` cannot resolve a `.ts`
  module under Vitest. Extracting the typed list (leaving `migrations.js` as
  the thin fs-wiring shell) is what A1 should have done from the start; the
  guard tests now cover both files and the new rollup entry.
- **Migration 3 is the first data migration** and the hymn list is frozen
  inside it on purpose — a data migration must mean the same thing on every
  database it ever runs on, even if `shared/hymns.json` changes.
- **The verify tool had gone stale** — it hard-coded "exactly migration 1",
  which was wrong the moment migration 2 shipped. Now checks a contiguous
  1..N. A check must not know which migrations exist.
- **Open question for Ethan, not changed:** the seeder still _refreshes_ a
  keyed row's content on every launch (`updateSong`, `ccli` preserved). That
  means a user who edits a built-in hymn — reorders verses, fixes a line —
  loses the edit on next launch. Same family as #14, but outside today's
  decision. Two honest options: never update after creation (ship hymn text
  fixes as data migrations), or add an `edited_by_user` flag. Asking.
- Behaviour-change edits, stated: `migrations.spec.ts` version lists `[1,2]` →
  `[1,2,3]`. Real DB copies: counts identical; migrations 1–3 recorded.

### 2026-09-06 — A3b (refresh only if untouched) implemented

**Your decision:** "Refresh only if untouched". Done exactly that way; plan and
matrix in `tasks/plan-A3b-refresh-if-untouched.md`.

**Two things I found while doing it — be aware of both:**

1. **A real bug fixed along the way.** `updateSong` wrote `built_in_key = ?`
   with `null` whenever a caller omitted the field. The song editor does pass
   the key today, so you were one refactor away from: user edits a hymn → key
   cleared → next launch the seeder re-creates it → duplicate. And nothing at
   all would have preserved the new `built_in_revision`. Both columns are now
   `COALESCE(?, column)` — a caller that says nothing changes nothing. That is
   a small behaviour change in a query function and is pinned by
   `electron/db/__tests__/songQueries.test.ts`.

2. **Every fresh install ships two "Amazing Grace" songs.** The main process's
   sample seed (`electron/main/index.js:525`) inserts an unkeyed "Amazing
   Grace" and the renderer seeds the built-in one. My first E2E asserted
   "exactly one Amazing Grace" and failed — on a wrong premise, not a product
   bug, so I rewrote the assertion to something stronger (row count unchanged
   across relaunch + exactly one row by key) rather than weakening it. I did
   NOT touch the sample seed (outside A3b's blast radius). **Opinion:** the
   sample songs should go entirely — the built-in hymns already give a new
   user something to click, and a sample titled identically to a built-in is
   pure confusion. Say the word and it is a five-line change with an E2E
   assertion update.

**Verification:** gate 197/197; E2E 16/16 twice; `npm run verify:db` on your
real library DB (`~/Library/Application Support/PresenterPro/presenterpro.db`):
migrations 1–4 recorded, `built_in_revision` added, 47/7/15 counts identical.
The second DB copy I verified for A1–A3 (`presenter-pro/presenterpro.db`) no
longer exists, so only the real one was checked this time.

**What upgrading does to your existing hymns:** the rows migration 3 keyed have
no stamp. If their text still equals the shipped hymn they get stamped on first
launch; if you ever edited one, it is left alone forever. Nothing is deleted.

### 2026-09-06 — README rewritten (#35) and Claude removed from the contributor list

**Your ask:** "remove yourself as a contributor… fine to have you in the commits
but i cant have you on the main page."

**What put me there:** the `Co-Authored-By: Claude … <noreply@anthropic.com>`
trailer on every commit. GitHub credits co-author trailers in the repository's
contributor listing. Nothing else in the commits maps to an account.

**What I did:** rewrote `main`'s commit _messages_ only — 94 Claude trailers
removed across 95 commits; the 14 Dependabot / Ethan co-author lines kept;
every commit's tree verified byte-identical before pushing. That needed a
force-push, so branch protection was relaxed for the ~2 seconds of the push
and restored immediately (enforce-admins on, force pushes off, `PR Gate`
required, strict up-to-date, conversation resolution on — verified via the
API afterwards). A local safety ref `backup/main-pre-trailer-rewrite` holds
the old history in your clone; delete it whenever you like. Dependabot was
asked to rebase #26 onto the new history. **Commit SHAs on `main` changed**;
any other clone should `git fetch && git reset --hard origin/main`.

**Going forward:** no co-author trailer on my commits, ever. PR footers and
commit bodies may still say "Generated with Claude Code" — that is text, not
an identity.

### 2026-09-06 — U1 (Electron 44 / Node 22 / toolchain) implemented

Plan: `tasks/plan-U1-electron-node-upgrade.md` (breaking-change review 30–44
item by item, all ruled out or accepted). Electron 29.4 → **44.2** (Chrome 152,
Node 24.20), electron-vite 2 → 5, Vite 5 → 7, plugin-react 4 → 5,
better-sqlite3 9 → 13, Node 20 → 22 (`.nvmrc`, `engines`, `@types/node`, CI).
No application code changed. Gate 199/199, E2E 16/16 twice, real library DB
verified, packaged app launched and migrated.

**Three things worth your attention:**

1. **The native-module rebuild is gone, and the ABI trap with it.** better-sqlite3
   13 moved to N-API and ships prebuilt binaries; the same file loads in Node 22
   and in Electron 44. I removed `postinstall: electron-rebuild`, dropped
   `@electron/rebuild`, and set `npmRebuild: false` for electron-builder.
   Consequence: **unit tests can now use real in-memory SQLite** instead of the
   injected fakes. Opinion: worth a small follow-up plan — keep the fakes where
   they pin SQL text (the songQueries test), but the migration runner and the
   query modules deserve one real-SQLite test each. Not done here (blast radius).

2. **Electron no longer downloads in `npm install`** (since 42). It fetches
   itself the first time anything requires it — Playwright included — so nothing
   in CI needed changing, and I proved it from a clean `npm ci`. If you ever see
   "Electron failed to install correctly", the fix is `npx install-electron`.

3. **Dialogs open in Downloads now** (Electron 43): the media import dialog no
   longer remembers the last folder. If that annoys you in practice, the fix is a
   `defaultPath` remembered in settings — a small, separate change.

Also: macOS 12+ is now the minimum (Electron 38 dropped 11). README updated.
Node 24 would match Electron 44's bundled runtime exactly; I stayed on 22 per
your decision (LTS until April 2027). Dependabot's `@electron/rebuild` ignore
is removed; #26 (electron-vite 5) is superseded by this PR and will be closed.

### 2026-09-06 — S1: disabled presenter window removed; phase7 sweep closed

Working autonomously per your "keep working until a hard stop".

**Why this before B1 (typed IPC):** the IPC drift guard had a hole — it matched
`// ipcMain.handle(...)` inside comments — so seven `presenter:*` channels
had preload wrappers and no handlers since Phase 3, and a 409-line
`PresenterView.jsx` sat behind a hash no window loads. Typing a contract over
dead channels would have enshrined them. Gone now; the guard strips comments.

**Honest note:** my first deletion pass left three references to a removed
constant in `App.jsx`. Lint caught it (3 errors) and the E2E suite failed 5 of
16 because the renderer threw inside effects. Fixed before commit; 16/16. That
is exactly why the harness exists, and why "provably no behaviour change"
still gets the full run.

**Gap recorded:** there is no E2E for the presenting flow (output/stage
windows). C1 (lifecycle) should add one — windowed output on the primary
display, then stop — since single-instance and teardown work touches it.

Ratchets moved: lint warnings 16 → 15, suppressions 61 → 56. Phase 7 items
1/2/10 were already fixed; 3/7/9 fixed here; 4/5/6/8 belong to workstream D.

### 2026-09-06 — B1 (IPC contract) implemented

`tasks/plan-B1-typed-ipc-contract.md`. Three things you get from this:

1. **One place to look.** `shared/ipcContract.ts` lists every channel by the
   method name the renderer calls. Preload is generated from it (no more
   hand-written wrappers), main can only register channels that are in it, and
   the renderer has exactly one door (`src/utils/ipc.ts`). Add a channel = one
   row + one handler + one export, in the same PR, or a test names what you
   forgot — and `assertComplete()` refuses to launch with a handler missing.
2. **The envelope is now a guarantee, not a habit.** A handler that throws,
   rejects, returns nothing, or returns the wrong shape all become a proper
   `{ success:false, error }` (logged). Before, a throw rejected the renderer's
   `invoke` with a serialized Error and every `result.success` check crashed.
3. **No more `window.electronAPI` in components.** Nine files bypassed the
   wrapper; a test now fails if any file under `src/` mentions it.

**What this did NOT do (honest scope):** the domain payloads (presentation,
song, media records) are still `unknown` in the types. Typing them is the next
ratchet and belongs with the domain models, not the transport.

**Trap for future work (recorded in the preload header):** preload must use ES
`import`, not `require`, for local modules — electron-vite leaves CommonJS
requires external and the packaged app then has no `electronAPI` at all. I hit
this; E2E caught it (8/16 red); fixed and verified in the packaged app.

### 2026-09-06 — C1 (process lifecycle) implemented

`tasks/plan-C1-lifecycle-robustness.md`. What changed for a live service:

- **Only one copy can run per profile.** A second double-click now focuses the
  running app and exits, instead of opening a second editor on the same
  SQLite file. E2E-proven (second instance exits 0 within 15 s; the first
  keeps its window).
- **A crashed projector recovers itself.** If the output or stage renderer
  dies, main reloads it and re-sends the live slide when it says ready. Before
  this the output window went blank until someone stopped and restarted.
  E2E-proven with a forced renderer crash.
- **Side discovery, fixed:** re-opening the output window mid-session also
  came up blank until the next slide advance — same re-sync fixes it.
- GPU/utility crashes are now logged with their reason; a mojibake comment
  that shipped in the close handler is fixed.

**The presenting-flow E2E gap from S1 is closed** (open output windowed →
two windows → stop → one).

**Housekeeping you should know about:** this Desktop folder is iCloud-synced
and it produced "name 2.ext" duplicates of three brand-new test files while I
worked. Vitest and ESLint now ignore that pattern; prettier's rule for it was
silently inert (POSIX class) and is now a plain glob. If you ever see a
"… 2.ts" file in git status, delete it — it is never a source of truth.

### 2026-09-06 — A4: the database layer now has real-SQLite unit tests

The follow-up I suggested after U1, done: `tasks/plan-A4-real-sqlite-tests.md`.
22 cases run the migration runner on the legacy schema (with a real backup
directory) and every query module against real in-memory SQLite. They prove
the things the SQL-text fakes could only spell: `updateSong` really keeps
provenance columns when the editor omits them, the journal really upserts,
deleting a folder really removes its media, the backup really is the untouched
original and a second run really writes nothing. All green first time — no
production bug found, which is itself worth knowing. Coverage 7.4 → 8.3 %.

### 2026-09-06 — D1: React Compiler immutability/memoization findings (5 of the 70 React items)

`tasks/plan-D1-react-compiler-immutability.md`. Workstream D started with the
"urgent subset" the charter named. Four fixed by code (Canvas body-cursor writes
moved to a helper; `section` memoized; OutputRenderer's media helpers hoisted
so nothing is used before it is declared). The fifth is the honest one: the
compiler cannot prove a memo dependency immutable because it comes through a
store selector. I verified nothing mutates it and left an explicit, reasoned
`eslint-disable` block at the site. **Opinion:** that is what triage should
produce sometimes — a documented decision at the line, not a silent entry in
a JSON file. The suppressions file still only shrinks (56 → 51).

This PR also adds the **first React component render test** (OutputRenderer:
subscriptions, media-slide resolution, unsubscribe on unmount) — the pattern
D2/D3 will reuse. Coverage jumped to 10 % because it reaches Canvas.

Remaining in D: 16 `set-state-in-effect`, 15 `exhaustive-deps`, 34
`no-unused-vars` (mostly dead code), 1 `no-unescaped-entities`.

### 2026-09-06 — D2 slice 1: three `set-state-in-effect` findings (13 remain)

`tasks/plan-D2-set-state-in-effect.md` has the full 16-row table with a
decision per row. This slice: the two toolbar number fields now _derive_ what
they show (draft while focused, the controlled value otherwise) instead of
copying the prop into state in an effect, and the onboarding tutorial reads
its step from the store instead of mirroring it — the mirror was updated in
lock-step in three places, which is exactly the kind of duplication that
drifts.

**Suspected UX bug found by the characterization test, left for your call:**
clear the font-size box in the formatting toolbar and click away → the size
becomes **8** (the minimum), because an empty field parses as `0` and is
clamped. Reverting to the previous value would be the expected behaviour. One
line to fix; it is a behaviour change, so I did not fold it into a lint PR.

### 2026-09-06 — D2 slice 2: six more `set-state-in-effect` findings (7 remain)

- **`ApplyThemeModal.jsx` was dead** — nothing imports it; deleted. One finding
  and a stray `no-unescaped-entities` suppression gone with it.
- **SongEditorModal** (1,380 lines, four findings): the form now computes its
  initial state from `song` once, and the two places that open it for a real
  song key it by song id, so switching songs is a remount — the React way to
  "reset on prop change". Lyrics textarea, collapsed groups and the selection
  are derived values now, not copies kept in sync by effects.
- **Countdown display** in the output window is set where the countdown
  message arrives and on each tick; the effect only owns the interval.
- 9 new render-test cases; the song editor now has its first test at all.

Left in D2: Filmstrip, MediaLibraryPanel, Home (three "clear the selection
when it vanishes" effects) and four in Canvas.
