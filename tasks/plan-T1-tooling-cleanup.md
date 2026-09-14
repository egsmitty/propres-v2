# Executable Plan T1 — tooling cleanup (import cycle, dead file, shared walker, cached lint/type-check, engine-strict, plan/baseline scripts)

**Source:** Audit items REPO-30a, REPO-30b, REPO-33, REPO-35, REPO-36,
WF-45/WF-46 (T1 tooling PR).

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, `main` @ `f0f8195`)

- **REPO-30a.** `presenter-pro/src/utils/sectionTypes.js:1` imports
  `SECTION_COLORS` from `@/utils/backgrounds`. `presenter-pro/src/utils/backgrounds.js:10`
  imports `{ isMediaSlide, normalizeSectionType }` from `@/utils/sectionTypes`.
  Confirmed by reading both files: a genuine two-file cycle. Nothing else in
  `src` imports `SECTION_COLORS` from `backgrounds.js` (`grep -rn
  "SECTION_COLORS"` — only `backgrounds.js` defines it and `sectionTypes.js`
  consumes it), so the array can move to a leaf module with no other call site
  to update.
- **REPO-30b.** `grep -rn "slideParser" presenter-pro` (excluding
  node_modules/.git) hits only `presenter-pro/src/utils/slideParser.js` itself,
  and two `.cursor/rules/*.mdc` doc examples (illustrative skeletons, not real
  imports) plus `tasks/todo.md` prose. No test file exists for it
  (`src/utils/__tests__/slideParser.test.ts` is absent). Confirmed dead.
- **REPO-33.** Three named files each hand-roll a walker:
  - `src/__tests__/inlineStyleBudget.test.ts` — `componentFiles()`: skips
    `__tests__`, `node_modules`, iCloud-dup names (` \d(\.|$)`); matches
    `.jsx`/`.tsx`; excludes `.test.`.
  - `src/__tests__/keyboardReachability.test.ts` — `walk()`: skips only
    `__tests__` dirs; matches `.jsx` only; no iCloud/`.test.` filtering.
  - `src/__tests__/tailwindTokens.test.ts` — **measured to have no walker at
    all.** It only `readFileSync`s `src/styles/globals.css` once. The audit
    item's premise ("each hand-roll a recursive walker") does not hold for
    this file on current `main`; nothing to extract here. (A fourth, unnamed
    walker exists at `src/styles/__tests__/tokens.test.ts` — out of scope,
    not one of the three named files, left untouched.)
  - Verified no edge case currently differs between the two real walkers'
    behavior: no `node_modules` under `src`, no iCloud-duplicate-named
    entries under `src`, no `.test.jsx` files under `src` (`find` checks run).
    A unified walker exposing `{ extensions, excludeTestFiles }` reproduces
    both files' current output exactly.
- **REPO-35.** Current scripts: `"lint": "eslint . --max-warnings 0"`,
  `"type-check": "tsc --noEmit"`. No cache configured for either.
- **REPO-36.** No `presenter-pro/.npmrc` exists. `package.json` already
  declares `"engines": { "node": ">=22.12.0", "npm": ">=10.0.0" }`. All three
  workflows (`build-release.yml`, `e2e.yml`, `pr-checks.yml` x2) already use
  `node-version-file: .nvmrc` (pinned to `22`). `dependabot.yml` sets no
  explicit Node version for the npm ecosystem (it uses the runner default);
  `electron/main/__tests__/toolchain.test.ts` already asserts `.nvmrc`,
  `engines.node`, and `@types/node` majors agree — so `engine-strict` adds a
  local/CI install-time enforcement of a pin that's already tested for
  consistency.
- **WF-45/46.** `presenter-pro/scripts/` currently holds only
  `electron-builder-after-pack.cjs` and `generate_app_icons.py`. The 14
  "writing-executable-plans" manifest items and 10 "testing-standards" items
  are read verbatim from the two `.mdc` files (see Decisions below for the
  exact list). `.github/workflows/e2e.yml` uploads baselines as artifact
  `visual-baselines` from `presenter-pro/e2e/*-snapshots/` (glob); local
  snapshot layout is `presenter-pro/e2e/<spec>.spec.ts-snapshots/<name>-darwin.png`
  (verified via `find`). The exact root `actions/upload-artifact` normalizes
  the download to is not independently verifiable without running the
  workflow, so the script resolves each downloaded PNG to its repo match by
  relative-suffix search rather than assuming one fixed root.

## Decisions

1. **REPO-30a fix:** new leaf module `src/utils/sectionColors.js` holding only
   `export const SECTION_COLORS = [...]` (moved verbatim, no logic). Update
   `backgrounds.js` to `export { SECTION_COLORS } from '@/utils/sectionColors'`
   (keeps the symbol available from its historical home in case anything is
   added there later — currently nothing imports it from `backgrounds.js`, but
   this is a one-line, zero-risk re-export). Update `sectionTypes.js` to import
   `SECTION_COLORS` from `@/utils/sectionColors` directly instead of from
   `backgrounds.js`. `backgrounds.js` keeps importing `isMediaSlide` /
   `normalizeSectionType` from `sectionTypes.js` — that edge is now
   one-directional (`backgrounds → sectionTypes`, not both ways), so the cycle
   is broken. No other call site changes because no other file imports
   `SECTION_COLORS` from `backgrounds.js`.
2. **REPO-30b fix:** `git rm src/utils/slideParser.js`. No test file exists to
   remove alongside it.
3. **REPO-33 fix:** new helper `presenter-pro/src/__tests__/sourceFiles.ts`
   (not `*.test.*`, so Vitest's `include` glob skips it; lives beside the
   files that use it, no new directory) exporting
   `listSourceFiles(root: string, { extensions: string[], excludeTestFiles = true }): string[]`.
   Behavior is the union/superset of both real walkers: skip `__tests__` dirs,
   skip `node_modules` dirs, skip iCloud-dup names (` \d(\.|$)`, applied to
   both dirs and files, matching `inlineStyleBudget`'s current check), filter
   by extension suffix, optionally exclude `.test.` filenames. Because no file
   under `src` currently trips the extra filters `keyboardReachability` lacked,
   this is behavior-preserving for both. `tailwindTokens.test.ts` is left
   unmodified (Measured: no walker there). `importCycles.test.ts` (new, item
   REPO-30a's test) also uses this helper — that's the "plus the new
   importCycles test" the audit item names.
4. **REPO-35 fix:** `"lint": "eslint . --max-warnings 0 --cache
   --cache-location node_modules/.cache/eslint/"`, `"type-check": "tsc
   --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc/tsbuildinfo"`.
   `test:unit` is untouched (owned by a parallel PR). Cache dirs live under
   `node_modules/`, already gitignored — no new gitignore entry needed.
5. **REPO-36 fix:** add `presenter-pro/.npmrc` with `engine-strict=true`. Given
   `engines.node` is already `>=22.12.0` and every workflow already pins Node
   22 via `.nvmrc`, and `toolchain.test.ts` already guards the pin agreement,
   this is additive enforcement with no other file changes needed.
6. **WF-45 (`new-plan.mjs`):** takes `<id> <slug>` (+ optional 3rd arg /
   `PLAN_OUTPUT_DIR` env var for the output directory, defaulting to
   `presenter-pro/scripts/../../tasks`, i.e. repo-root
   `tasks/`). Refuses to overwrite an existing `plan-<id>-<slug>.md`. Template
   sections, in order: title line (`# Executable Plan <ID> — <slug words>`),
   `Source`, `Measured`, `Decisions`, the anti-weakening clause verbatim inside
   `Decisions`, `Blast radius`, `Todos`, `Compliance Manifest` with two tables:
   the 14 writing-executable-plans items and the 10 testing-standards items,
   both with empty (blank cell, not filled) disposition columns for the
   executor to fill in. Item names copied verbatim from the two `.mdc` files:
   - **14 writing-executable-plans items:** Assertion weakening designed
     against; List sampling designed against; Quantifier erosion designed
     against; Sanctioned escape hatch; Bounded blast radius; File-specific
     pitfall notes; Exact paths; Per-todo verification; Snapshot policy inline;
     Preconditions for conditional UI; Structural floor under snapshots; IPC
     contract pinning; Manual verification steps; Required findings report.
   - **10 testing-standards items:** TDD ordering; Behavior-change test edits;
     No weakened assertions; Coverage floor; Lint floor; Snapshot discipline;
     Completion gate; Vitest / jsdom mechanics; Test placement;
     Characterization before refactor.
   Test: `presenter-pro/electron/main/__tests__/newPlanScript.test.ts` runs the
   script via `node scripts/new-plan.mjs <id> <slug> <tmpdir>` (a real OS
   tmpdir via `node:fs.mkdtempSync`, never `tasks/`), reads the produced file,
   asserts (a) the anti-weakening clause string appears verbatim, (b) the
   first manifest table has exactly 14 data rows, (c) the second has exactly
   10, by parsing the markdown table rows mechanically (split on `\n|`,
   count), not by eyeballing.
7. **WF-46 (`baselines.sh`):** header comment documents usage
   (`scripts/baselines.sh <branch>`). Steps: `gh workflow run e2e.yml --ref
   <branch> -f update_baselines=true`; poll `gh run list --workflow e2e.yml
   --branch <branch> --limit 1 --json databaseId,status,createdAt` for a run
   newer than the dispatch time (avoids grabbing a stale run); `gh run watch
   <id> --exit-status`; `gh run download <id> -n visual-baselines -D
   "$tmpdir"`; then for every `*.png` found under `$tmpdir` (recursive),
   locate the matching file under `presenter-pro/e2e/` by relative-suffix
   match (the downloaded file's path from its own `*-snapshots/` ancestor
   down must equal the target's path from its `*-snapshots/` ancestor down —
   this is robust to whichever root `actions/upload-artifact` normalizes to,
   per the Measured note); `cmp -s` old vs new; copy only files that differ,
   printing every copied path. If a downloaded PNG has no unique match under
   `presenter-pro/e2e/` (0 or >1 candidates), the script prints what it would
   have compared/copied and **exits 1 without copying anything** (the "layout
   unclear" escape hatch the item allows). No unit test — this item drives a
   real GitHub Actions run and `gh` auth; noted as `N/A` in the manifest with
   this reason, per the item's own allowance.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**May change:**
- `presenter-pro/src/utils/sectionColors.js` (new)
- `presenter-pro/src/utils/backgrounds.js`
- `presenter-pro/src/utils/sectionTypes.js`
- `presenter-pro/src/utils/slideParser.js` (deleted)
- `presenter-pro/src/__tests__/sourceFiles.ts` (new)
- `presenter-pro/src/__tests__/importCycles.test.ts` (new)
- `presenter-pro/src/__tests__/inlineStyleBudget.test.ts` (walker call only —
  ceilings/assertions unchanged)
- `presenter-pro/src/__tests__/keyboardReachability.test.ts` (walker call
  only — assertions unchanged)
- `presenter-pro/package.json` (`lint`, `type-check` scripts only — **not**
  `test:unit`)
- `presenter-pro/.npmrc` (new)
- `presenter-pro/scripts/new-plan.mjs` (new)
- `presenter-pro/scripts/baselines.sh` (new)
- `presenter-pro/electron/main/__tests__/newPlanScript.test.ts` (new)
- `tasks/plan-T1-tooling-cleanup.md` (this plan)
- `tasks/fable-pass-plan.md` (status row)
- `tasks/fable-notes.md` (T1 section)

**May not change:** `src/__tests__/tailwindTokens.test.ts`,
`src/styles/__tests__/tokens.test.ts`, `presenter-pro/package.json`
`"test:unit"`, any `.github/workflows/*`, `commitlint.config.mjs`,
`.github/dependabot.yml`.

## Todos

- [ ] 1. **Red:** write `presenter-pro/src/__tests__/importCycles.test.ts`
  against the *current* `sectionTypes.js`/`backgrounds.js` (before item 2's
  fix). Verify: `npx vitest run src/__tests__/importCycles.test.ts` — the
  "no cycles" assertion fails and prints the `sectionTypes.js ↔
  backgrounds.js` cycle; the two floor assertions (`files.length > 50`,
  `edges > 100`) pass on their own.
- [ ] 2. Create `src/utils/sectionColors.js`; update `backgrounds.js` and
  `sectionTypes.js` per Decision 1. **Green:** re-run the same command — 0
  cycles, same two floor assertions still pass.
- [ ] 3. Characterization check for the refactor in step 2: run
  `npx vitest run src/utils/__tests__/backgrounds.test.ts
  src/utils/__tests__/sectionTypes.test.ts` before and after step 2 — same
  pass count both times (these are the pre-existing tests for the two
  refactored files; they must be unaffected).
- [ ] 4. REPO-30b: confirm dead via
  `grep -rn "slideParser" presenter-pro --include=*` (excluding
  node_modules/.git) one more time immediately before deleting (in case item
  1–3's edits added a reference — they should not have). Then
  `git rm presenter-pro/src/utils/slideParser.js`.
- [ ] 5. REPO-33: add `presenter-pro/src/__tests__/sourceFiles.ts`
  (`listSourceFiles`). Record baseline case counts:
  `npx vitest run src/__tests__/inlineStyleBudget.test.ts
  src/__tests__/keyboardReachability.test.ts --reporter=verbose` (before
  editing the two test files) → note total `it` count executed.
- [ ] 6. Rewrite `componentFiles()` in `inlineStyleBudget.test.ts` and
  `walk()` in `keyboardReachability.test.ts` to call
  `listSourceFiles` with the matching `extensions` option (drop the
  hand-rolled bodies). Re-run the same command from step 5 — same total case
  count, same pass/fail per test name (all still passing, since these are
  pure refactors of the walker, not the budgets).
- [ ] 7. REPO-35: edit `lint` / `type-check` scripts per Decision 4.
  Verify cache still fails correctly:
  (a) introduce one deliberate lint error (e.g. an unused var) in a scratch
  file under `/Users/ethansmith/.claude/jobs/2cb21992/tmp/tooling/`, temporarily
  copy it into `src/` — actually: simpler and safer — introduce the error
  in-place in a file already slated for no other change (e.g. add an unused
  `const _t = 1;` to `src/utils/sectionColors.js` transiently), run
  `npm run lint`, confirm non-zero exit, then revert;
  (b) similarly introduce a one-line type error transiently (e.g. assign a
  `number` to a `string`-typed export in a `.ts` file under `src/__tests__/`),
  run `npm run type-check`, confirm non-zero exit, then revert.
  (c) Time two consecutive clean runs of each command
  (`time npm run lint`, `time npm run type-check` x2) and record both
  timings — second run should be faster with the cache populated.
  (d) Confirm `node_modules/.cache/eslint/` and `node_modules/.cache/tsc/`
  are created and are under the existing `presenter-pro/node_modules/`
  gitignore entry (`git status` shows nothing new untracked outside
  `node_modules`).
- [ ] 8. REPO-36: add `presenter-pro/.npmrc` with `engine-strict=true`. Verify
  `npm install --dry-run` (repo already has `node_modules`, so this is safe
  and fast) exits 0 under the active Node 22 shell. Note the
  dependabot/workflow findings from Measured in the plan (already captured
  above) — no dependabot/workflow file changes needed.
- [ ] 9. WF-45: read `.cursor/rules/writing-executable-plans.mdc` and
  `.cursor/rules/testing-standards.mdc` one more time immediately before
  writing the script's template strings, to copy the 14 + 10 item names
  character-for-character. Write `presenter-pro/scripts/new-plan.mjs`.
- [ ] 10. **Red then green** for WF-45: write
  `presenter-pro/electron/main/__tests__/newPlanScript.test.ts` first against
  the not-yet-written script (expect it to fail — script missing / no output
  file), then implement the script, then re-run:
  `npx vitest run electron/main/__tests__/newPlanScript.test.ts`.
- [ ] 11. WF-46: read `.github/workflows/e2e.yml` (done in Measured) and the
  `presenter-pro/e2e/` snapshot layout (done in Measured) then write
  `presenter-pro/scripts/baselines.sh` per Decision 7. No automated test
  (manifest records `N/A` with reason). Manually shellcheck-read it once for
  obvious quoting bugs (no `gh` invocation during this plan — do not actually
  dispatch a workflow run).
- [ ] 12. `cd presenter-pro && npm run gate && npm run format:check`. Report
  `gate: type-check ✓ · lint ✓ · vitest N/N passed (0 skipped)`.
- [ ] 13. Findings report appended to this plan's `## Review` section and to
  `tasks/fable-notes.md` / `tasks/fable-pass-plan.md` per the parent task's
  Records instructions: the `tailwindTokens.test.ts` premise mismatch, the
  `tokens.test.ts` fourth-walker out-of-scope note, any other surprise.

Comparisons: cycle count is **exact** (`toEqual([])`, not `toBeLessThan`);
file/edge floor counts are **exact thresholds** (`toBeGreaterThan`, stated as
such — count matters, not order); walker-refactor case counts before/after are
**exact** (same total, same per-test pass/fail, not just "still green");
manifest table row counts in the new-plan script test are **exact** (14 and
10, not "at least").

## Compliance Manifest

### writing-executable-plans.mdc (this rule)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Comparisons paragraph above; Todo 1/2 exact cycle-array equality, Todo 10 exact row counts |
| List sampling designed against | WF-45 item names enumerated as two explicit itemized lists (14, 10) in Decision 6, with mechanical row-count assertions in Todo 10 |
| Quantifier erosion designed against | importCycles walks the whole `src/**` graph (self-enforcing floor: files > 50, edges > 100), not a sample; `listSourceFiles` iterates every dir entry, not a subset |
| Sanctioned escape hatch | WF-46's "print what it would copy and exit without copying" when the artifact layout doesn't uniquely resolve (Decision 7) is the one allowed escape hatch, and it's auditable via its printed output |
| Bounded blast radius | "Blast radius" section |
| File-specific pitfall notes | Measured: `tailwindTokens.test.ts` has no walker (don't force one); no `node_modules`/iCloud-dup/`.test.jsx` edge cases under `src` today (verified, so unification is safe); `core.hooksPath`-style absolute-path traps N/A here |
| Exact paths | Blast radius lists every file with full path |
| Per-todo verification | Every todo 1–12 names its command |
| Snapshot policy inline | N/A — no Vitest snapshots involved in this plan's tests |
| Preconditions for conditional UI | N/A — no UI, no conditional rendering touched |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no `ipcMain`/`ipcRenderer` channel touched |
| Manual verification steps | N/A — no user-facing/renderer behavior change; this is build tooling and dev scripts only, nothing to click-path in `npm run dev` |
| Required findings report | Todo 13 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (importCycles red before Todo 2 green); Todo 10 (newPlanScript red before green) |
| 2 | Behavior-change test edits | N/A — `inlineStyleBudget.test.ts` / `keyboardReachability.test.ts` edits (Todo 6) change only the walker implementation, not tested behavior; ceilings/assertions untouched, proven by identical case counts in Todo 5 vs 6 |
| 3 | No weakened assertions | Clause verbatim above; Comparisons paragraph states exact vs. threshold per check |
| 4 | Coverage floor | importCycles: cycle-detection case + floor case; newPlanScript: clause-present case + both row-count cases |
| 5 | Lint floor | No `.only`/`.skip` in any new test; every `it` in new files asserts; no `expect` inside `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots anywhere in this plan |
| 7 | Completion gate | Todo 12 |
| 8 | Vitest/jsdom mechanics | N/A for jsdom/Zustand/ipc — all new tests are node-environment file/process tests; no `better-sqlite3`; no timers needed |
| 9 | Test placement | `importCycles.test.ts` + `sourceFiles.ts` in `src/__tests__/` (repo-wide static-analysis tests already live there); `newPlanScript.test.ts` in `electron/main/__tests__/` (matches `toolchain.test.ts`, a repo-tooling guard, per the reference plan's own placement choice) |
| 10 | Characterization before refactor | Todo 3 (backgrounds/sectionTypes existing tests, unchanged pass count, before *and* after Todo 2); Todo 5 vs 6 (walker case counts, before and after) |

## Review

All 6 items done as planned; no item skipped.

- **REPO-30a:** fixed. New leaf `src/utils/sectionColors.js`; `backgrounds.js`
  re-exports `SECTION_COLORS` from it; `sectionTypes.js` imports from it
  directly. `src/__tests__/importCycles.test.ts` is red before (exactly one
  cycle found: `backgrounds.js -> sectionTypes.js -> backgrounds.js`) and
  green after; `backgrounds.test.ts` (24 cases) and `sectionTypes.test.ts`
  (part of that same 24) unchanged and passing before and after.
- **REPO-30b:** fixed. `src/utils/slideParser.js` deleted (`git rm`); no test
  file existed for it.
- **REPO-33:** fixed for the two files that actually walk
  (`inlineStyleBudget.test.ts`, `keyboardReachability.test.ts`) via the new
  `src/__tests__/sourceFiles.ts` (`listSourceFiles`), also used by
  `importCycles.test.ts`. **`tailwindTokens.test.ts` was skipped** — measured
  to have no walker at all on current `main` (it only reads one CSS file);
  the audit item's premise doesn't hold for it. Case counts: both real
  walker test files reported 6 total passing cases before and after
  (identical test names, all green).
- **REPO-35:** fixed. `lint`/`type-check` scripts cached; `test:unit`
  untouched. Timings: lint 7.3s cold → ~1.0s warm; type-check ~2.4s cold →
  ~1.5s warm. Deliberate lint error and deliberate type error both still
  caught with cache populated, then reverted.
- **REPO-36:** fixed. `presenter-pro/.npmrc` with `engine-strict=true`.
  `npm install --dry-run` under Node 22 exits 0. No dependabot/workflow
  change needed (already `.nvmrc`-driven; already guarded by
  `toolchain.test.ts`).
- **WF-45:** fixed. `scripts/new-plan.mjs` + `electron/main/__tests__/
  newPlanScript.test.ts` (5 cases). Red proof: script temporarily moved
  aside, all 5 cases failed (missing-module errors / non-zero exits); restored,
  all 5 pass.
- **WF-46:** fixed. `scripts/baselines.sh`. No automated test (manifest
  entry below explains why); the artifact-root matching logic was verified
  by hand against a throwaway fixture tree covering both plausible artifact
  roots (with and without a `presenter-pro/e2e/` prefix) — both resolved to
  the correct single match and correctly detected the differing file. The
  script itself was never run against the real GitHub workflow.

**Suspected pre-existing issues (not caused by this PR):**
`SongEditorModal.test.tsx`'s `asks before re-parsing, rather than choosing
for you` test timed out once under the full 536-test gate run with all 64
Vitest workers spawned in parallel; rerun in isolation it passed in 46ms
(17/17 in the file, 1.5s total). This file is untouched by this PR — a
scheduling/CPU-contention flake under heavy parallel load, not a code
regression. No allowlist/exemption entries were added anywhere in this PR.

Gate: `type-check ✓ · lint ✓ · vitest 536/536 passed (0 skipped)`.
`npm run format:check` clean.
