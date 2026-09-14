# Executable Plan SEC1 — deny window.open, allow-list navigation, and reject built-in-media traversal

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked) **SEC-1** (P3, [S],
⚠ scenario corrected — see Decisions) and **SEC-3** (P3, [S]). Both are
hardening-only main-process fixes with no product-behavior change.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`11b7f4e` (`fix(songs): song edits can't vanish on quit or on a stale lyrics
box (#130)`).

---

## Measured

| Item | Code | What happened |
|---|---|---|
| SEC-1 | `electron/main/index.js` | `grep -c "web-contents-created\|setWindowOpenHandler\|will-navigate" electron/main/index.js` → 0. No `app.on('web-contents-created', ...)` exists anywhere in `electron/`, so a `window.open()` from renderer-controlled content would open with the preload's privileges, and no navigation is ever second-guessed. |
| SEC-3 | `electron/main/index.js:293-308`, `resolveBuiltInMediaAssetPath` | `path.join('test-media', assetName)` (and the two other candidate roots) is called directly on the caller-supplied `assetName` with only an `if (!assetName) return null;` guard. `path.join` COLLAPSES `..` segments rather than rejecting them, so `assetName = '../../../../etc/passwd'` resolves outside `test-media/`. The caller is the `system:resolveBuiltInMedia` IPC handler (`index.js:1315-1327`), which takes an array of names straight from the renderer with no validation of its own. |

## Decisions

1. **SEC-1's scope is hardening, not a data-loss fix.** The audit's original
   SEC-1 scenario (a dropped file could navigate the window and discard
   unsaved work) was corrected on re-verification: Electron's
   `navigateOnDragDrop` defaults to `false` and the main window never sets it,
   so a drag-drop onto dead space does nothing. The audit's own text: "Keep
   the 10-line `web-contents-created` deny as hardening." This plan does
   exactly that and does not claim to fix a data-loss bug.
2. **The allow/deny decision is a pure, exported, unit-tested function** —
   `isAllowedNavigation(targetUrl, { rendererDevUrl, appIndexPath })` in a new
   module `electron/main/navigationPolicy.ts`. `index.js` cannot be
   `require()`d in a unit test (it loads `electron` and opens a database at
   import time — see `lifecycleListeners.test.ts`'s header comment), so, same
   as `closeController.ts`, the decision logic lives outside `index.js` and
   `index.js` only wires it up.
3. **The exact allow-list**, derived from how `index.js` actually loads its
   three windows (main, output, stage-display — all read in Todo 0):
   - Same protocol + host as `rendererDevUrl` (`process.env.ELECTRON_RENDERER_URL`)
     when it is set. This is electron-vite's dev-server convention
     (`rendererLoading.test.ts` already pins that `index.js` reads it, not a
     hardcoded URL). Path/hash/query are ignored so the output and
     stage-display windows' `#/output` / `#/stage-display` dev-URL loads
     still work — `npm run dev` HMR must not break.
   - A `file:` URL whose path is exactly
     `path.join(__dirname, '../../out/renderer/index.html')` — the same
     expression `index.js` already uses in all three `loadFile(...)` calls.
     Hash/query are ignored for the same reason (the output/stage windows use
     `loadFile(path, { hash: '/output' })` / `{ hash: '/stage-display' }`).
     This is what a packaged app, `npm run preview`, and Playwright E2E
     (which launches `out/main/index.js` directly) all load.
   - Everything else is denied: any other http(s) origin, any other `file:`
     path, any other scheme (`javascript:`, `data:`, …), and anything
     `new URL()` cannot parse.
4. **SEC-3's guard is also a pure, exported, unit-tested function** —
   `isSafeBuiltInMediaAssetName(name)` in a new module
   `electron/main/mediaAssetSafety.ts`. Per the audit's own wording ("`basename`
   check"), the primary rule is `path.basename(name) !== name` ⇒ reject. It
   additionally rejects any name containing a literal `/` or `\` explicitly,
   because `path.basename` only splits on the HOST platform's separator —
   running the suite on macOS/Linux CI, `path.basename('..\\evil.png')` (POSIX
   `path`) does **not** treat `\` as a separator and would return the string
   unchanged, silently passing a Windows-style traversal string through.
   Explicit checks make the guard's behavior identical regardless of which OS
   runs the test.
5. **No IPC contract change.** `system:resolveBuiltInMedia`'s shape
   (`{ [assetName]: pathOrNull }`) is unchanged; a rejected name now resolves
   to `null` in that map, the same value it already returns for a name that
   doesn't exist on disk. No renderer change is needed or made.
6. **Not in this plan:** SEC-2 (`presenterpro-media:` protocol serves any file
   on disk — needs a DB-lookup or extension-allowlist redesign, [O]-sized),
   SEC-4 (IPC handlers don't validate sender window), SEC-5 (pin
   `sandbox: true`), SEC-6 (Dependabot/CodeQL). Each is its own change.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: `isAllowedNavigation`/`isSafeBuiltInMediaAssetName` return values
are exact booleans (`toBe(true)`/`toBe(false)`, never truthy/falsy checks); the
source-text wiring assertions are exact substring/regex matches, not "at least
one of."

## Blast radius

May create: `electron/main/navigationPolicy.ts`, `electron/main/mediaAssetSafety.ts`,
`electron/main/__tests__/navigationPolicy.test.ts`,
`electron/main/__tests__/mediaAssetSafety.test.ts`,
`electron/main/__tests__/navigationHardeningWiring.test.ts`, this plan file,
the `fable-pass-plan.md` status row, the `fable-notes.md` entry. May change:
`electron/main/index.js` (one new `require` line for each new module next to
the existing `./` requires; `resolveBuiltInMediaAssetPath`'s guard clause; one
new `app.on('web-contents-created', ...)` appended after the existing
`app.on('activate', ...)` at the bottom), `electron.vite.config.js` (two new
Rollup input lines with a comment, next to the other `main/*` entries). **May
not** change: any existing test file (including `lifecycleListeners.test.ts`
and `rendererLoading.test.ts`), the `app.whenReady()` startup chain, `seed(db)`,
any `will-quit` listener, the `firstRunSeed`/`startupFailure`/`../db/index`/
`../db/seed` requires, anything under `electron/db/`, or any `src/` renderer
file.

## Todos

- [x] 0. **Read before writing.** Confirmed via grep that SEC-1 and SEC-3 are
  both still unfixed on `main` (0 hits for `web-contents-created` /
  `setWindowOpenHandler` / `will-navigate`; `resolveBuiltInMediaAssetPath` has
  only the `if (!assetName)` guard). Read all three `loadURL`/`loadFile` call
  sites (main, output, stage-display) to derive the exact allow-list in
  Decision 3.
- [x] 1. **Red** — 39 new cases across 3 new files, 39 fail on the old code:
  `navigationPolicy.test.ts` (17 cases; all fail — brand-new module, "Cannot
  find module" is the acceptable failure mode for a new pure module's own
  unit tests) · `mediaAssetSafety.test.ts` (14 cases; same) ·
  `navigationHardeningWiring.test.ts` (8 cases; all fail **on their
  assertions** against current `index.js` / `electron.vite.config.js` source
  text — this file must never fail on a missing-module error, since it never
  imports the new modules, only reads source text).
- [x] 2. Implement `navigationPolicy.ts` (`isAllowedNavigation`) and
  `mediaAssetSafety.ts` (`isSafeBuiltInMediaAssetName`) per Decisions 2–4.
  Verify the two new unit-test files go green in isolation before touching
  `index.js`.
- [x] 3. Wire `index.js`: add the two `require` lines, replace
  `resolveBuiltInMediaAssetPath`'s `if (!assetName) return null;` guard with
  `if (!isSafeBuiltInMediaAssetName(assetName)) return null;`, and append the
  `app.on('web-contents-created', ...)` listener (Decision 3's allow-list via
  `isAllowedNavigation`) after `app.on('activate', ...)`. Add the two Rollup
  inputs to `electron.vite.config.js`.
- [x] 4. All three new test files plus the full `electron/main/__tests__/`
  suite (in particular `lifecycleListeners.test.ts` and
  `rendererLoading.test.ts`, unedited) → green.
- [x] 5. `npm run gate` → report `type-check`/`lint`/vitest pass count;
  `npm run format:check` → 0.
- [ ] 6. Manual/E2E verification (owed — not run locally per instruction; the
  machine is in use): confirm in CI's E2E run (loads `out/renderer/index.html`
  from disk, the `file:` branch) that the app still opens and all three
  windows still load, and confirm with Ethan in `npm run dev` that HMR still
  works (the `rendererDevUrl` branch). Neither Playwright nor `npm run dev`
  was launched from this session.
- [ ] 7. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact booleans, exact substring/regex matches |
| List sampling designed against | SEC-1 and SEC-3 each fully scoped from the audit's own line numbers (Measured); the allow-list is derived by reading all 6 `loadURL`/`loadFile` sites (Todo 0), not sampled |
| Quantifier erosion designed against | "every webContents" is `app.on('web-contents-created', ...)`, which fires for all of them by construction, not per-window opt-in; wiring test asserts the listener and both calls exist, not just one |
| Sanctioned escape hatch | N/A — no allowlist constant needed |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 3 (exact allow-list derivation, hash/query handling); Decision 4 (POSIX `path.basename` not splitting on `\\` — the CI-OS trap) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 4, 5 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — main-process logic, no UI |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel shape changed (Decision 5); `system:resolveBuiltInMedia` still returns `{ [name]: pathOrNull }`, only some inputs now map to `null` that previously might have resolved outside the directory |
| Manual verification steps | Todo 6 |
| Required findings report | Todo 7 |
| Data rewrites state their backup and rollback | N/A — no stored rows or snapshots rewritten |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2/3 implementation |
| 2 | Behavior-change test edits | N/A — no existing test edited; `lifecycleListeners.test.ts` and `rendererLoading.test.ts` pass unchanged |
| 3 | No weakened assertions | Clause verbatim; exact booleans and exact regex/substring matches, no `.sort()`/set-compare/`toContain`-for-exactness |
| 4 | Coverage floor | Every branch of `isAllowedNavigation` (dev-origin allow, dev-origin host/scheme mismatch deny, file allow with no/hash/query variants, file path mismatch deny, no-dev-url case, unparsable) and `isSafeBuiltInMediaAssetName` (traversal, backslash traversal, absolute POSIX/Windows, nested, empty, `.`/`..`, non-string, normal name) has its own case |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` — confirmed via `npm run lint` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 5 |
| 8 | Vitest / jsdom mechanics | Node environment (default), no DOM, no Zustand store, no `ipc.js` mock needed (pure functions only); `electron` and `better-sqlite3` never imported by any new file |
| 9 | Test placement | `electron/main/__tests__/` — matches the "Electron main / IPC contract" row of the placement table |
| 10 | Characterization before refactor | N/A — additive hardening, not a restructure of existing behavior; `resolveBuiltInMediaAssetPath`'s existing return shape (`string \| null`) is unchanged, only some additional inputs now return `null` |

## Review

Both items were still present on `main` (confirmed by grep in Todo 0) and
both are implemented as scoped — nothing was already fixed, nothing was
skipped.

**SEC-1.** `electron/main/index.js` now registers one
`app.on('web-contents-created', ...)` (appended after the existing
`app.on('activate', ...)`) that denies every `window.open` via
`setWindowOpenHandler(() => ({ action: 'deny' }))` and prevents any
`will-navigate` whose target `isAllowedNavigation` rejects. The decision
function lives in the new `electron/main/navigationPolicy.ts` — no Electron
import, fully unit-tested. As the audit's corrected text says, this is
hardening: no data-loss scenario is being closed (drag-drop navigation was
already impossible via Electron's `navigateOnDragDrop` default).

**SEC-3.** `resolveBuiltInMediaAssetPath` in `index.js` now rejects any
`assetName` that `isSafeBuiltInMediaAssetName` (new
`electron/main/mediaAssetSafety.ts`) flags before ever calling `path.join`,
closing the `../` traversal path from the renderer-supplied names on
`system:resolveBuiltInMedia`. The IPC channel's shape is unchanged; a
rejected name now maps to `null`, the same value an ordinary missing file
already produced.

**Proof.** 39 new test cases across 3 new files; all 39 failed on the old
code before implementation — 8 in the wiring file failed on their assertions
against current `index.js`/`electron.vite.config.js` text, and 31 in the two
new pure-module test files failed with "Cannot find module" (the sanctioned
failure mode for a brand-new module's own tests). All 39 pass after
implementation, alongside the full existing `electron/main/__tests__/` suite
(114/114, `lifecycleListeners.test.ts` and `rendererLoading.test.ts`
unedited and unaffected). Full repo gate:
`type-check ✓ · lint ✓ · vitest 702/702 passed (0 skipped)`;
`npm run format:check` clean.

**Findings.** No suspected regression. No allowlist/exemption added. No
snapshot touched. The navigation allow-list has not been exercised by a
running window or by CI's E2E in this session (machine in use, per
instruction) — see Todo 6: CI's E2E run (which loads
`out/renderer/index.html` from disk, exercising the `file:` branch) and
Ethan running `npm run dev` (exercising the `rendererDevUrl` branch) are both
still owed before this is considered runtime-verified.
