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
`schema_migrations` is absent and legacy tables exist, *record* every migration
as applied *without executing it*. That assumes every existing database already
has every column. It only does if it was launched by a build that ran the
current ten `ALTER TABLE`s. A user who skipped a version would be baselined
past columns they do not have, and the first query touching one would crash.
**Fix:** migration 1 is *idempotent by inspection* — it checks
`PRAGMA table_info` before each `ADD COLUMN` and `sqlite_master` before each
`CREATE` — and is simply *run* on every database, legacy or fresh. No skip
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
fragile.** `require('better-sqlite3')` *succeeds* under Node 20 here — only
`new Database()` fails, because the binary is built for Electron's ABI (121 vs
Node's 115). In CI the gate installs with `--ignore-scripts`, which leaves the
*Node* prebuilt in place, so the same test would pass there and fail locally
after any full `npm install`. Tests must not depend on either state. The
injected-interface design above is what makes that true.

### Plan P1 — process hardening

**P1-1. The Dependabot/commitlint claim was wrong.** The plan said Dependabot's
PRs would fail the `commit-msg` hook without a `chore` prefix. Husky hooks run
*locally* on the committing machine; Dependabot commits on GitHub, where no
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
is the single largest *security* debt in the project, ahead of anything in the
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
eliminates the data-loss risk *without* changing what Save means. Autosave can
follow once undo history is persistent. This is a product call, so it is
recorded here rather than changed.

**R4. Test count is becoming a vanity metric.** 124 "tests" includes ~20 from
`it.each` over every npm script — one assertion, twenty rows. That is fine as a
guard, but "N tests passing" should not be read as N units of confidence.
Coverage percentage and *which paths* are covered are the honest numbers.

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

- *The dev-server hardcoding was real and blocked every launch*, exactly as the
  proofread predicted. Fixed with `ELECTRON_RENDERER_URL` at all three load
  sites; the guard test failed first (2/4) and passes after (4/4). `npm run
  preview` now works too.
- *`--user-data-dir` is honored by Electron* — the isolation check passed on
  every launch. I made the check honest in code: it is detection, not
  prevention, because the app opens SQLite during `ready` before any evaluate
  can run. The switch is the prevention; the check makes a regression loud.
- *Playwright's `app.close()` is the wrong teardown for this app.* It requests a
  graceful quit, which correctly runs the unsaved-changes handshake and blocks
  on the dialog — so a spec that leaves a document unsaved hangs teardown for
  60s and poisons the worker. Electron's `app.exit(0)` (immediate, skips
  `before-quit`, closes windows without asking) is the right tool; SIGKILL only
  as a last resort because it leaves helper processes lingering. This also cut
  suite time from ~24s to ~9s.
- *Never call `app.process()` after the app may have exited* — Playwright
  disposes its wrapper and the accessor throws an internal TypeError, which made
  a **successful** quit look like a failed test. The child process is captured
  at launch instead. The quit spec now waits on the real OS `exit` event and
  asserts exit code 0.
- *One cold-start `firstWindow` timeout* was observed on a worker's first launch
  with empty stdout/stderr — a slow start, not an error. First-window allowance
  raised to 60s (test timeout 90s). Zero recurrences in five runs; if it
  returns on CI, investigate macOS Gatekeeper on freshly built binaries before
  raising it further.
- *Added one spec beyond the plan*: "Cancel on a quit keeps the app running".
  It exercises the deferred-quit path (`before-quit` → handshake → Cancel must
  cancel the *quit*, not just the window close), which is the newest and least
  exercised code in the lifecycle fix. Cheap, and it passes.
- *Blast-radius deviations, reported per the plan*: `package-lock.json`
  (dependency install — unavoidable), `.prettierignore` and `tsconfig.json`
  (not in the table; needed so E2E files are type-checked in the gate and
  Playwright output is not format-checked). Both should have been listed.
- *E2E is a separate workflow (`e2e.yml`), not in `PR Gate`*, per pitfall 5.
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

| Database | Before | After | Migration | Backup |
|---|---|---|---|---|
| `PresenterPro/` (packaged app, 640K) | 47 presentations · 7 songs · 15 media | identical | v1 recorded | 1 written |
| `presenter-pro/` (older dev build, 28K) | 2 · 3 · 3, **no `media_folders` table, 8 columns missing** | identical; table created, all 8 columns added by inspection | v1 recorded | 1 written |

The second one is exactly the case the proofread's A1-1 fix exists for: the
original "baseline and skip" design would have recorded that database as
fully migrated and left `media_folders` and eight columns missing.

Also observed, and I got it wrong once before checking: `seed(db)` runs after
migrations and inserts a sample presentation and songs — but only when
`settings.initialized` is absent. Every real database has that row, so my
synthetic legacy fixture was *less* realistic than reality and the seeded
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
*untouched*. Reordered: detect the table via `sqlite_master`, read applied
versions only if present, back up, *then* create the table; a fully-applied
database now sees zero writes on launch. The unit tests changed to describe
that stricter contract — a deliberate behaviour change, stated as such. This
is the pattern the charter asks for: a mechanical check found a flaw no reading
would have.

### 2026-09-06 — Dependabot's first sweep (10 PRs, triage)

Dependabot ran immediately on config creation. All PRs run the full gate, so
nothing merges unverified. Recommended dispositions, for Ethan:

| PR | Update | Disposition | Why |
|---|---|---|---|
| #24 | npm minor+patch group | **merge when green** | that is the point of grouping |
| #19–#23 | GitHub Actions majors (checkout, setup-node, upload/download-artifact, gh-release) | **merge when green, one at a time** | action majors are usually runtime-only (Node 20 → 24); the gate proves each |
| #28 | typescript 5.9 → 7.0 | **hold — add to `ignore` as a recorded decision** | TS 7 is outside `typescript-eslint`'s supported range (`<6.1`) and removed `baseUrl`; this exact version was deliberately pinned away from during Phase 6 |
| #25 | @electron/rebuild 3 → 4 | **hold until Node 22** | requires Node ≥22.12; `.nvmrc` pins 20 (see R2) |
| #26 | electron-vite 2 → 5 | **hold — needs its own plan** | three majors at once across the build toolchain; couple it with the Electron upgrade (R1) |
| #27 | @commitlint/config-conventional 20 → 21 | merge when green | low risk; hooks are local |

`ignore` entries for #28 and #25 are the *recorded-decision* path the
dependabot.yml comment describes — not pre-emptive pinning. Filed as a small
follow-up PR rather than mixed into A1.

**Two process findings from the first Dependabot sweep.**

1. *Every Dependabot PR fails `npm ci`* with "package.json and package-lock.json
   are not in sync — Missing: esbuild@0.28.2 … @esbuild/<platform>". Dependabot's
   lockfile regeneration is dropping esbuild's optional platform packages, so
   its PRs cannot pass the gate as opened. This is Dependabot's lock, not ours
   (our lock installs cleanly on macOS, Windows, and Linux CI). Workaround per
   PR: check out the branch, run `npm install`, push the corrected lock. Worth
   an upstream look before relying on grouped auto-updates. Recorded rather
   than fixed — outside every plan's blast radius.
2. *`git check-ignore` does not report tracked files.* I misread "NOT matched"
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

| Question | Decision | Consequence |
|---|---|---|
| A2 model | **Journal first.** Save keeps its meaning; a crash-recovery journal eliminates data loss; autosave waits for persistent undo history. | Plan A2 = recovery journal only. R3 accepted. |
| Electron 29 EOL | **Plan it next, after A2.** Electron → current, Node 20 → 22, then @electron/rebuild 4 / electron-vite 5. | Becomes plan U1, sequenced after A2, run behind the E2E harness. |
| Seeder (phase7 #14) | **Match by `built_in_key` only, never delete.** Title matching becomes a one-time versioned data migration. | Becomes plan A3 — and it is also the first *data* migration (migration 2), which exercises A1 for real. |
| Dependabot | **Fix the lock on the safe PRs** (#24, #27; the Actions bumps need only a branch update). | Done by me; see the running log. |

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
