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
