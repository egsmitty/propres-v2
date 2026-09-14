# Executable Plan DLG1 — Enter respects the focused dialog button

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked) — **CMD-B8 · P1 ·
[S] · CONFIRMED** — Enter on a focused Cancel runs the primary (even
destructive) action (`Dialog.jsx:36-41`).

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`11b7f4e`.

---

## Measured

| Item | Code | What happened |
|---|---|---|
| CMD-B8 | `src/components/shared/Dialog.jsx`, `handleEnter` (bubble-phase `window` keydown listener) | `const primary = actions.find((a) => a.primary); if (primary) { e.preventDefault(); resolve(...) }` runs unconditionally on any Enter, with no check of `document.activeElement`. Tab to Cancel, press Enter → the primary action resolves anyway, even when primary is destructive. Verified still present on `main` @ `11b7f4e` by reading the file (lines 41-48) before writing any test. |

## Decision

When focus is on one of the dialog's own action buttons at the moment Enter is
pressed, that button's own action resolves — not necessarily primary — and
resolves exactly once. When focus is anywhere else (a field, the dialog
container, or nothing in particular), Enter keeps firing primary, unchanged.

Implementation: the buttons' wrapping `<div>` gets a `ref` (`actionsRef`) and
each `<button>` gets `data-action-index={idx}`. `handleEnter` first checks
whether `document.activeElement` is an `HTMLButtonElement` contained by
`actionsRef.current`; if so it resolves `actions[Number(activeElement.dataset.actionIndex)]`
and returns — it never falls through to the primary lookup. Only when that
check misses does it fall back to the existing `find primary` behavior. This
is chosen over "let the browser's native button click happen" because jsdom
(this repo's test environment) does not synthesize a `click` from a
`keydown`/Enter on a `<button>` the way a real browser does, so a
native-activation-only fix would be untestable under jsdom and unverifiable by
the red-first cases below; explicit resolution is deterministic in both jsdom
and Electron's real Chromium, and calling `e.preventDefault()` before
resolving suppresses any native double-activation in the packaged app.

**Escape (plan L1) is untouched.** `handleEscape` is a separate function,
registered separately, in the capture phase, with its own `e.preventDefault()`
— nothing in this plan touches it, its listener registration, or its
cancel-action lookup. `cancel`-marked actions continue to be resolved from
Escape/backdrop exactly as before; this plan only changes which action Enter
resolves.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record
it as a suspected regression._

Comparisons: `resolve` mock call count is exact (`toHaveBeenCalledTimes`);
each call's argument is compared with `toEqual` against the exact
`{ action, values }` object (no `toContain`, no partial-shape matcher, no
sorting).

## Blast radius

May change: `src/components/shared/Dialog.jsx` only. May create:
`src/components/shared/__tests__/dialogEnterFocus.test.tsx` only. The charter
row in `tasks/fable-pass-plan.md` and the notes entry in `tasks/fable-notes.md`
are also written by this plan. **May not** touch `src/store/dialogStore.js`
(CMD-B9 is a separate plan), any file in the "other open PRs" list from the
task brief, or any existing test file — `escapeConsumed.test.tsx` must pass
unchanged.

## Todos

- [x] 1. **Red** — write `dialogEnterFocus.test.tsx` with the 3 minimum cases
      (focus on non-primary button; focus on neither button; focus on primary
      button) against the *current* `Dialog.jsx`. Run it and record which
      cases fail and why. Do not implement the fix yet.
- [x] 2. Implement the Decision: `actionsRef`, `data-action-index`, the
      focused-button branch in `handleEnter`, unchanged `handleEscape`.
- [x] 3. Re-run `dialogEnterFocus.test.tsx` (green) and
      `escapeConsumed.test.tsx` (unchanged, still green).
- [x] 4. `npm run gate` and `npm run format:check`, both exit 0. Report the
      vitest pass-count line.
- [x] 5. Findings report in the PR body (E2E `Enter` grep result, any
      suspected regression).

## Review

Fixed `handleEnter` in `src/components/shared/Dialog.jsx`: it now checks
whether `document.activeElement` is one of the dialog's own `<button>`
elements (tracked via a new `actionsRef` on their wrapping `<div>` plus
`data-action-index` on each button) and, if so, resolves that button's own
action instead of falling through to primary. Only when focus is elsewhere
does it fall back to the prior primary-lookup behavior. `handleEscape` and its
capture-phase registration (plan L1) are byte-for-byte unchanged.

**Red-first:** 3 new cases in `dialogEnterFocus.test.tsx`, 1 failed on the old
code (focus-on-Cancel resolved `ok` instead of `cancel` — the exact bug); the
other 2 already matched old behavior (primary fires with no button focused;
primary fires with primary focused), so they document the "keep working"
cases rather than proving the bug.

**Gate:** `gate: type-check ✓ · lint ✓ · vitest 666/666 passed (0 skipped)`;
`format:check ✓` (after `prettier --write` on the two touched files —
Prettier reflowed the new multi-line `if` condition).

**Findings:**
- `grep -rn "Enter" presenter-pro/e2e` finds 11 hits, all `page.keyboard.press('Enter')`
  on a focused Home-screen presentation row (opening a presentation) or a
  settings-field Enter-to-commit flow — none press Enter while focus is on a
  `Dialog` action button, so no existing E2E baseline or spec depends on the
  old (buggy) behavior.
- No suspected regression found; no other item from the audit was touched.
- `escapeConsumed.test.tsx` passes unchanged (12/12 across both files).
- No manual verification step was included per the task brief (Electron not
  launched); the fix is fully covered by jsdom component tests.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact `toEqual`/`toHaveBeenCalledTimes` comparisons, no loosening |
| List sampling designed against | Only 3 minimum cases required by the task brief; each is its own `it()`, no sampling — N/A beyond that (single small bug, not an enumerated list) |
| Quantifier erosion designed against | N/A — no "every X" claim in this plan; single handler, single file |
| Sanctioned escape hatch | N/A — no allowlist needed |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision section: jsdom does not synthesize click-from-Enter on buttons, so the fix must resolve explicitly rather than rely on native activation |
| Exact paths | Blast radius section |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — dialog is unconditionally rendered once `useDialogStore.show()` is called, matching the existing `escapeConsumed.test.tsx` pattern |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no `ipcMain`/`ipcRenderer` channel touched |
| Manual verification steps | N/A — not requested in the task brief; this is a keyboard-focus fix fully covered by jsdom component tests, and the task brief explicitly says not to launch the app |
| Required findings report | Todo 5 |
| Data rewrites state their backup and rollback | N/A — no stored rows or migrations |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (red) before Todo 2 (implement) |
| 2 | Behavior-change test edits | N/A — no existing test is modified; `escapeConsumed.test.tsx` passes unchanged (Todo 3) |
| 3 | No weakened assertions | Clause verbatim; exact `toEqual`/count comparisons |
| 4 | Coverage floor | 3 cases cover the 3 focus states named in the task brief |
| 5 | Lint floor | No `.only`/`.skip`; every `it()` asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | `@vitest-environment jsdom` + `@testing-library/jest-dom/vitest`; `useDialogStore` reset in `beforeEach` (module singleton); no `electron` or `better-sqlite3` import; no timers involved |
| 9 | Test placement | `src/components/shared/__tests__/dialogEnterFocus.test.tsx` — matches the React-component row of the placement table, same directory as `escapeConsumed.test.tsx` |
| 10 | Characterization before refactor | N/A — this is a bug fix to one small handler, not a restructure of a large file |
