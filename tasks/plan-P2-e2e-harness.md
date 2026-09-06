# Executable Plan P2 — Playwright E2E Harness

**Workstream:** Process · **Depends on:** nothing (P1 is independent)
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

## Why this exists

Three of the six real bugs in this project lived in paths unit tests structurally
cannot reach — window lifecycle, quitting, live presenting. All three were found
by a human clicking. A fourth (the missing `closeController` rollup entry) would
have shipped an app that **crashes on launch while the build reports SUCCESS**.

A launch smoke test alone would have caught that fourth one. That is the single
highest-value test in this plan.

## Scope

**In scope:** harness setup plus three flows — launch, quit, unsaved-changes.
**Out of scope, deliberately:** presenting and multi-display output. Those need
real or virtual displays and are their own plan; note them in the findings report
as still manual-only.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

**You may create or modify only these files:**

| File | Action |
|---|---|
| `presenter-pro/playwright.config.ts` | create |
| `presenter-pro/e2e/launch.spec.ts` | create |
| `presenter-pro/e2e/quit.spec.ts` | create |
| `presenter-pro/e2e/unsavedChanges.spec.ts` | create |
| `presenter-pro/e2e/fixtures/launchApp.ts` | create |
| `presenter-pro/package.json` | modify (add `test:e2e`, add devDependency) |
| `.github/workflows/e2e.yml` | create |
| `presenter-pro/.gitignore` **or** root `.gitignore` | modify (ignore artifacts) |

**Do NOT modify:** any file under `src/` or `electron/`, any existing test,
`vitest.config.mjs`, `eslint.config.mjs`, `eslint-suppressions.json`, or
`.github/workflows/pr-checks.yml`. If a flow fails, that is a finding to report —
**not** a licence to change application code.

---

## Critical pitfalls — read before writing anything

1. **E2E must never touch the real user database.** The app opens
   `app.getPath('userData')/presenterpro.db`. Running tests against a
   developer's real database risks destroying actual presentations. **Every**
   launch must pass a throwaway profile:
   ```ts
   `--user-data-dir=${await fs.mkdtemp(path.join(os.tmpdir(), 'ppro-e2e-'))}`
   ```
   Assert inside the fixture that the resolved userData path is under the OS
   temp dir, and throw if it is not. This is a guard against a future refactor
   silently dropping the flag.

2. **The app must be built first.** Playwright launches `out/main/index.js`, not
   the dev server. `npm run build` is a precondition for every run — wire it into
   the `test:e2e` script so it cannot be forgotten.

3. **`better-sqlite3` must be rebuilt for Electron.** CI's gate job installs with
   `--ignore-scripts`; E2E **cannot**. The E2E workflow must use a full
   `npm ci`, exactly like the build job.

4. **Do not run E2E on `ubuntu-latest` without a display server.** Use
   `macos-latest`, which runs headed without extra setup.

5. **Do not add E2E to the required `PR Gate` yet.** E2E is flaky-prone on day
   one, and a flaky required check trains people to ignore red. Ship it as a
   separate workflow that reports independently; promoting it into `pr-gate`
   is a later, deliberate decision once it has proven stable.

---

## Todos

- [ ] **1. Install Playwright** as a devDependency in `presenter-pro`:
      `npm install -D --ignore-scripts @playwright/test`.
      *Verify:* `node -e "console.log(require('./package.json').devDependencies['@playwright/test'])"`
      prints a version.

- [ ] **2. Create the launch fixture** `presenter-pro/e2e/fixtures/launchApp.ts`,
      exporting a helper that:
      - creates a fresh temp userData directory per launch,
      - **throws** if the directory is not under `os.tmpdir()` (pitfall 1),
      - launches via `_electron` with `out/main/index.js` and the
        `--user-data-dir` switch,
      - returns `{ app, window, userDataDir }`,
      - exposes a `close()` that terminates the app and removes the temp dir.

- [ ] **3. Write `e2e/launch.spec.ts` — all 3 assertions, this list is
      exhaustive:**
      1. the app launches and produces exactly one window
      2. the window title is non-empty
      3. **no main-process error was emitted during startup** — capture stderr
         and assert it contains no `Cannot find module` and no
         `Error:` line. *This is the assertion that would have caught the
         missing `closeController` rollup entry.*
      *Verify:* `npm run test:e2e -- launch.spec.ts` passes.

- [ ] **4. Write `e2e/quit.spec.ts`.** With no unsaved changes, trigger a quit
      and assert the Electron app process actually exits (await the app's close
      event with a timeout; a timeout is a FAIL, not a skip). This is finding #0
      from `phase7-remediation.md`, which shipped broken for months.
      *Verify:* `npm run test:e2e -- quit.spec.ts` passes.

- [ ] **5. Write `e2e/unsavedChanges.spec.ts`.** Create or open a presentation,
      make it dirty, request a close, and assert the **styled** Unsaved Changes
      dialog appears with exactly the three actions `Cancel`, `Discard`, `Save` —
      compare the rendered labels with `toEqual` against that exact array.
      Order and count both matter; do not use `toContain`. Then assert Cancel
      leaves the window open.
      *Verify:* `npm run test:e2e -- unsavedChanges.spec.ts` passes.

- [ ] **6. Add the `test:e2e` script** to `presenter-pro/package.json` as
      `npm run build && playwright test`. Do not add it to `gate` — the gate must
      stay fast, and E2E is not yet a required check (pitfall 5).

- [ ] **7. Create `.github/workflows/e2e.yml`**: on `pull_request`, `macos-latest`,
      full `npm ci` (not `--ignore-scripts`), `npx playwright install --with-deps`
      if required, then `npm run test:e2e`. Upload the Playwright report as an
      artifact on failure. **Do not** reference this job from `pr-gate`.

- [ ] **8. Ignore artifacts:** add `playwright-report/`, `test-results/`, and
      `e2e/.artifacts/` to the appropriate `.gitignore`. Committed test output is
      the same mistake as the committed `coverage/` directory.

- [ ] **9. Run the completion gate and report.** E2E is separate from the gate,
      so unit numbers must be unchanged.
      *Verify:* `cd presenter-pro && npm run gate` — expect **124/124** and 0
      lint errors. Then `npm run test:e2e` — report passed/total separately.

---

## Sanctioned escape hatch

Exactly one, and it starts empty:

```ts
/**
 * E2E specs permitted to be skipped, with the reason they cannot run in this
 * environment. Every entry REQUIRES a justification and must be reported.
 * Never add an entry to make a failing test go away — a failing E2E is a
 * finding, not an obstacle.
 */
export const E2E_ENVIRONMENT_SKIPS: ReadonlyArray<{ spec: string; reason: string }> = [];
```

## Required findings report

1. Unit gate result (`passed/total`) — must be unchanged at 124/124
2. E2E result (`passed/total`), per spec
3. Every `E2E_ENVIRONMENT_SKIPS` entry added, with justification — must be empty
   unless reported otherwise
4. Confirmation that no test run touched a real userData directory
5. Any file changed outside the blast radius, even if justified
6. Any suspected pre-existing regression discovered but NOT fixed — including
   any flow that fails. **Do not fix application code under this plan.**

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; todo 5 mandates `toEqual` on the exact action list and forbids `toContain`; todo 4 states a timeout is a FAIL not a skip |
| List sampling designed against | Todo 3 enumerates **all 3** assertions as a counted exhaustive list |
| Quantifier erosion designed against | "exactly one window"; exact three-action array compared whole |
| Sanctioned escape hatch | `E2E_ENVIRONMENT_SKIPS`, initially empty, entries require justification + report |
| Bounded blast radius | Eight-file table; explicit ban on touching `src/`, `electron/`, and `pr-checks.yml` |
| File-specific pitfall notes | Five numbered pitfalls: real-DB destruction, build precondition, native rebuild, no headless Linux, not-yet-required check |
| Exact paths, no improvisation | Every file named in full |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | `N/A — no snapshots in this plan` |
| Preconditions for conditional UI | Todo 5 states the presentation must be made dirty before the dialog is reachable |
| Structural floor under snapshots | `N/A — no snapshots` |
| IPC contract pinning | `N/A — no IPC channel changed; E2E exercises them end to end` |
| Manual verification steps | `N/A — this plan IS automated verification; it changes no user-facing behavior` |
| Required findings report | Six-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | `N/A — these tests characterize already-shipped behavior; there is no new feature to test-drive. A spec that fails is a finding (report item 6), not a fix licence.` |
| 2 | Behavior-change test edits | `N/A — no existing test modified` |
| 3 | No weakened assertions | Clause verbatim; exact-equality mandated in todos 3–5 |
| 4 | Coverage floor | Three flows, each the site of a real historical bug |
| 5 | Lint floor | No `.only`, no `.skip` (skips only via the reported allowlist), no assertion-free specs |
| 6 | Snapshot discipline | `N/A — no snapshots` |
| 7 | Completion gate | Todo 9 runs `npm run gate` and reports passed/total, plus E2E separately |
| 8 | Vitest/jsdom mechanics | `N/A — Playwright, not Vitest. The native-module ban is inverted here: E2E REQUIRES a full npm ci (pitfall 3).` |
| 9 | Test placement | `e2e/<flow>.spec.ts` per the placement table's E2E row |
| 10 | Characterization before refactor | These ARE the characterization tests; nothing is refactored under this plan |
