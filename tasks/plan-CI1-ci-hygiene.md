# Executable Plan CI1 — CI hygiene sweep

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked) Part 8, items
CI-1, CI-4, CI-5, CI-6, CI-7, CI-8, CI-10, CI-11, and the gate half of SEC-6.
CI-12/13/14 are explicitly out of scope (handled elsewhere).

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, branched from `origin/main` @ `ab65e2d`)

- `presenter-pro/package.json`: `"test:unit": "vitest run"` — no `--coverage`,
  so `vitest.config.mjs`'s `thresholds` block is dead. `npm run gate` runs
  `type-check && lint && test:unit`, never `--coverage`.
- `npx vitest run --coverage --coverage.reporter=text-summary` (this repo,
  this commit) passes today: Statements 26.93% / Branches 24.8% /
  Functions 24.59% / Lines 27.87% against thresholds 26.8/24.7/24.4/27.7 —
  every axis clears by 0.03–0.17 points. Close, but green; no threshold edit
  needed.
- `presenter-pro/package.json` `build.npmRebuild: false`; no `postinstall`
  script anywhere in `package.json`; `better-sqlite3@^13.0.3` (N-API, ships
  prebuilds — no compiler needed for either Node or Electron's ABI). The
  `--ignore-scripts` / "full install" comments in `pr-checks.yml:45-48,83-84`,
  `e2e.yml:54-56`, and `build-release.yml:46` all describe a native rebuild
  that does not exist in this project's configuration.
- `grep -rn "uses:" .github/workflows/*.yml` → 13 lines, 5 distinct actions:
  `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`,
  `actions/download-artifact@v8`, `softprops/action-gh-release@v3`. SHAs
  resolved via `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; the first four
  are lightweight tags (`object.type: "commit"`); `softprops/action-gh-release`
  is an annotated tag (`object.type: "tag"`), dereferenced via
  `gh api repos/<owner>/<repo>/git/tags/<sha>`:
  - `actions/checkout@v7` → `3d3c42e5aac5ba805825da76410c181273ba90b1`
  - `actions/setup-node@v7` → `820762786026740c76f36085b0efc47a31fe5020`
  - `actions/upload-artifact@v7` → `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`
  - `actions/download-artifact@v8` → `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`
  - `softprops/action-gh-release@v3` → `efb35369e0ad2afab669f228072c1b0d510eae64`
- No job in any of the three workflows has `timeout-minutes` today (6 jobs
  total: `gate`, `build`, `pr-gate` in pr-checks.yml; `e2e` in e2e.yml;
  `build` (Package), `release` (Draft GitHub Release) in build-release.yml).
- `build-release.yml` sets `permissions: contents: write` at top level (line
  15) — both the `build` job (never touches the release) and the `release` job
  inherit write.
- `.github/dependabot.yml`: comment at line 6 says "There is deliberately no
  `ignore` list", but lines 29–51 are an `ignore:` block with 5 entries, each
  with its own justifying comment (typescript, @vitejs/plugin-react, eslint,
  @eslint/js, vite, @types/node). The comment contradicts the file it sits in.
  No `cooldown:` key anywhere.
- `presenter-pro/playwright.config.ts`: `retries: process.env.CI ? 1 : 0`, no
  `failOnFlakyTests`. Installed `@playwright/test` is `1.63.0`
  (`node_modules/@playwright/test/package.json`) — `failOnFlakyTests` shipped
  in 1.52, so it's supported.
- `npm audit --omit=dev --audit-level=high` (this repo, this commit) → "found
  0 vulnerabilities", exit 0. Safe to add to the gate job.
- `presenter-pro/electron/main/__tests__/toolchain.test.ts` is the existing
  precedent for a repo-tooling guard test: plain `node:fs` reads, no special
  harness, lives in `electron/main/__tests__/`.
- Job-name detection is mechanical: within a workflow file, `^jobs:$` starts
  the jobs block; job names are lines matching `/^  [A-Za-z0-9_-]+:\s*$/`
  (exactly two leading spaces) from there until the next line with less
  indentation or EOF. Verified against all three files by hand
  (`awk '/^jobs:/{f=1} f' … | grep -n "^  [a-zA-Z]"` finds exactly `gate`,
  `build`, `pr-gate` in pr-checks.yml; `e2e` in e2e.yml; `build`, `release` in
  build-release.yml — nested keys under a job, e.g. `strategy:`/`steps:`, sit
  at 4-space indent and don't collide).

## Decisions

1. **CI-1**: change `test:unit` to
   `"vitest run --coverage --coverage.reporter=text-summary"`. Do not touch
   `thresholds` (they pass, measured above) and do not add
   `thresholds.autoUpdate` (would rewrite the config on every CI run).
2. **CI-4**: correct the three comment blocks to state the actual reason for
   each install mode — `--ignore-scripts` in the gate job skips Electron's own
   binary download (the only postinstall-adjacent cost that install path has),
   not a native rebuild; the full installs in `build`/`e2e`/`build-release`
   exist because those jobs need the Electron binary itself (to build/package/
   launch), not because better-sqlite3 needs compiling.
3. **CI-5**: drop `macos-latest` from `pr-checks.yml`'s `build` job matrix,
   keep `windows-latest`. `e2e.yml` already builds and runs on macOS on every
   PR, so the smoke-build coverage doesn't shrink — only the duplicate does.
4. **CI-6**: `timeout-minutes` per the task brief: pr-checks `gate` 10,
   `build` 15, `pr-gate` 5; e2e.yml `e2e` 25; build-release.yml `build`
   (Package) 30, `release` (Draft GitHub Release) 10.
5. **CI-7**: pin all 5 distinct actions (13 call sites) to the commit SHAs
   measured above, each with a trailing `# v<tag>` comment so the intended
   version stays legible.
6. **CI-8**: move `permissions: contents: write` from build-release.yml's
   top level down to the `release` job only; add a top-level
   `permissions: contents: read` so the `build` (Package) job — which never
   creates a release — doesn't inherit write.
7. **CI-10**: add `failOnFlakyTests: !!process.env.CI` next to `retries` in
   `playwright.config.ts`; leave `retries` exactly as is (task brief and
   measured comment both say retries stays).
8. **CI-11**: rewrite the dependabot.yml header comment to describe the
   `ignore` block accurately (recorded, justified holds — not "no ignore
   list"); add `cooldown: { default-days: 3 }` to both `updates` entries
   (npm and github-actions).
9. **SEC-6 (gate part)**: add a `npm audit --omit=dev --audit-level=high` step
   to the gate job in pr-checks.yml, after "Install dependencies". Confirmed
   green locally above, so it ships.
10. **Guard test (item G)** goes in before CI-6/CI-7 land, and is the
    mechanism that proves both: `electron/main/__tests__/workflows.test.ts`
    parses `.github/workflows/*.yml` as text only (no `yaml` package — none is
    a project dependency), collects every job across all three files and every
    `uses:` line across all three files, asserts both collected counts are
    `> 0` (empty-parse guard), then asserts every job has a
    `timeout-minutes:` line inside its block and every `uses:` value matches
    `/@[0-9a-f]{40}\b/`.

**Anti-weakening clause (verbatim):** *"If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record
it as a suspected regression."*

Comparisons and their exactness:
- Coverage thresholds vs. measured percentages: numeric `>=`, not equality —
  this is inherent to a ratchet, not a weakening; the pass/fail comes from
  vitest's own threshold enforcement, not a hand-written comparison.
- Guard test job count and `uses:` count: `> 0`, exact per the "self-enforcing
  count" pattern (not a substitute for the per-item assertions that follow).
- Guard test per-job `timeout-minutes` presence and per-`uses:` SHA-pin format:
  boolean/regex match per item, asserted for **every** collected job and
  **every** collected `uses:` line (no sampling, no `.some()`).
- `npm audit` step: exit-code gate (vitest/CI semantics), not a hand-rolled
  comparison.

## Blast radius

May change: `presenter-pro/package.json` (`test:unit` script only),
`presenter-pro/playwright.config.ts` (`failOnFlakyTests` only),
`presenter-pro/electron/main/__tests__/workflows.test.ts` (new),
`.github/workflows/pr-checks.yml`, `.github/workflows/e2e.yml`,
`.github/workflows/build-release.yml`, `.github/dependabot.yml`, this plan
file, `tasks/fable-pass-plan.md` (one status-table row), `tasks/fable-notes.md`
(one new section at the end).

**May not change:** `presenter-pro/vitest.config.mjs` thresholds (they pass;
lowering them is exactly the anti-weakening violation this clause forbids),
required check names (`PR Gate` in pr-checks.yml, `E2E (macOS)` in e2e.yml),
any other test file, `commitlint.config.mjs`, lint-staged config.

## Todos

- [x] 1. **Red:** write `presenter-pro/electron/main/__tests__/workflows.test.ts`
  per Decision 10. Verify:
  `npx vitest run electron/main/__tests__/workflows.test.ts` — expect failures
  on the `timeout-minutes` and SHA-pin assertions against the current
  (untouched) workflow files; the two "count > 0" assertions pass (jobs and
  `uses:` lines already exist).
- [x] 2. **CI-6 + CI-7 (make the guard green):** add `timeout-minutes` to
  every job named in Decision 4; replace every `uses: <owner>/<repo>@<tag>`
  with `uses: <owner>/<repo>@<sha> # <tag>` per Decision 5's SHA table, across
  all three workflow files. Verify:
  `npx vitest run electron/main/__tests__/workflows.test.ts` → green.
- [x] 3. **CI-4:** correct the three misleading comment blocks (pr-checks.yml
  ~45-48 and ~83-84, e2e.yml ~54-56, build-release.yml ~46) per Decision 2.
  No behavior change — comment-only. Verify: `git diff` shows only comment
  lines changed in those hunks.
- [x] 4. **CI-5:** remove `macos-latest` from pr-checks.yml's `build` job
  matrix; update the matrix comment. Verify: `grep -n "os:" pr-checks.yml`
  shows only `windows-latest`.
- [x] 5. **CI-8:** move `contents: write` to the `release` job in
  build-release.yml; add top-level `contents: read`. Verify: `grep -n
  "permissions" -A1 build-release.yml` shows `read` at top level and `write`
  only under `release`.
- [x] 6. **CI-1:** change `test:unit` in `presenter-pro/package.json` per
  Decision 1. Verify: `npm run gate` from `presenter-pro/` — coverage summary
  prints and thresholds pass (already confirmed manually above; re-confirm
  through the real `gate` script, not the ad hoc flag invocation).
- [x] 7. **CI-10:** add `failOnFlakyTests` to `playwright.config.ts` per
  Decision 7. Verify: `npx tsc --noEmit -p presenter-pro` (covered by gate's
  type-check) accepts the new option; no test exercises Playwright config
  directly, so this is a type-check + manual read verification, noted in
  Findings.
- [x] 8. **CI-11:** fix the dependabot.yml comment and add `cooldown:
  { default-days: 3 }` to both entries per Decision 8. Verify:
  `grep -n "cooldown" -A1 .github/dependabot.yml` shows two hits; comment no
  longer claims "no ignore list" while one exists.
- [x] 9. **SEC-6 (gate part):** add the `npm audit` step to pr-checks.yml's
  `gate` job per Decision 9. Verify (local rehearsal, already done above):
  `npm audit --omit=dev --audit-level=high` → exit 0, "found 0
  vulnerabilities".
- [x] 10. Full guard re-run + gate: `npx vitest run
  electron/main/__tests__/workflows.test.ts` (green, final), then from
  `presenter-pro/`: `npm run gate && npm run format:check` — report
  `type-check ✓ · lint ✓ · vitest N/N passed (0 skipped)`.
- [x] 11. Records: append one row to the status table at the end of
  `tasks/fable-pass-plan.md`; append `## CI1 — <title> (2026-09-13)` to the
  end of `tasks/fable-notes.md`. Findings report in the PR body (skipped
  items — none expected, all 9 numbered items plus the guard are in scope —
  and any surprises, e.g. the e2e.yml comment describing a *different* wrong
  reason than the pr-checks.yml one).

## Compliance Manifest

### writing-executable-plans.mdc (this rule)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause above; per-comparison exactness listed under it |
| List sampling designed against | Todo 1's guard test asserts collected job count and `uses:` count are non-empty, then checks **every** collected job and **every** collected `uses:` line — no `.some()`/sampling |
| Quantifier erosion designed against | "every job has timeout-minutes" and "every uses: is SHA-pinned" are both mechanically iterated in the guard test, not spot-checked |
| Sanctioned escape hatch | N/A — no allowlist; every job and every action in scope gets timeout + pin, no exemptions |
| Bounded blast radius | "Blast radius" section |
| File-specific pitfall notes | Measured §: annotated vs. lightweight tag dereferencing for `action-gh-release`; two-space job-indent detection verified by hand; `npmRebuild:false`/no postinstall as the CI-4 root fact |
| Exact paths | Blast radius lists every file |
| Per-todo verification | Todos 1–9 each name their command |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — no UI, CI/config only |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no IPC channel touched |
| Manual verification steps | N/A — no user-facing renderer/main change; this is CI config. Todo 7 notes the one place a running-window check doesn't apply and why |
| Required findings report | Todo 11 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (red) before Todo 2 (green) |
| 2 | Behavior-change test edits | N/A — no existing test modified, only the new guard test |
| 3 | No weakened assertions | Clause verbatim above; per-comparison exactness stated under it |
| 4 | Coverage floor | One guard test covering both mechanical checks (timeout presence, SHA pin format), each asserted per-item across all jobs/uses lines |
| 5 | Lint floor | No `.only`/`.skip`; every `it` in the new test asserts; no `expect` inside `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 10 |
| 8 | Vitest/jsdom mechanics | N/A for jsdom/Zustand/ipc/timers/canvas — node environment, plain `node:fs` reads, no `better-sqlite3`, matches `toolchain.test.ts`'s existing pattern |
| 9 | Test placement | `electron/main/__tests__/workflows.test.ts`, alongside `toolchain.test.ts` (same "repo tooling guard" category) |
| 10 | Characterization before refactor | N/A — not a refactor of application code; no large file restructured |
