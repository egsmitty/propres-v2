# Executable Plan L2 — one shortcut guard, and PowerPoint's Slide Show keys

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 1 plan **L2**:
**LIVE-A5** Backspace deletes slides mid-service · **LIVE-C1** clickers
(PageDown/PageUp) do nothing · **LIVE-C2** no `.` blank key · **CMD-B6**
Delete/arrows reach slides behind modals and `<select>`s · **CMD-B10** Space
advances the projector behind a dialog · **LIVE-B12** the presenter key handler
ignores modals and selects · **ED-2** Backspace in the toolbar's font-size box
deletes the selected text box.

Written per `.cursor/rules/writing-executable-plans.mdc`. Stacked on L1
(`plan-L1-escape-and-menu.md`); L0's 28 cases and L1's tests must pass unchanged.

---

## Measured (2026-09-13, branch base `fix/l1-escape-and-menu`)

Three window keydown handlers each had their own inline "is the user typing?"
check, and one had none:

| Handler | Typing check | `<select>`? | Modal open? |
|---|---|---|---|
| `Editor.jsx` (save, select ↑↓, delete slide, F5, Esc, ?, B, L) | INPUT / TEXTAREA / contentEditable | **no** | **no** |
| `PresenterPanel.jsx` (← → Space) | INPUT / TEXTAREA / contentEditable | **no** | **no** |
| `Canvas.jsx` (capture: box Delete, ⌘C/V/D, B/I/U, align…) | **none** | **no** | **no** |

- `Editor.jsx`: `if (!meta && (e.key === 'Delete' || e.key === 'Backspace')) deleteSelectedSlideFromCurrentPresentation()` — no `isPresenting` check. PowerPoint's Slide Show maps Backspace to **previous slide**.
- `PresenterPanel.jsx` handled exactly `ArrowLeft`, `ArrowRight`, `' '` / `Space`. A clicker sends `PageDown` / `PageUp` (and often `.` for blank). ↑ / ↓ went to the Editor, which moved the *selection* while live.
- `Canvas.jsx` capture handler: Backspace with a text box selected removes it — `if (isEditing) return` is the only escape — and focus in the toolbar's `LiveNumberField` does not clear the box selection (`data-editor-toolbar`), so the box went.
- `PresenterPanel` is always mounted in the editor (`Editor.jsx`), so its handler is live whenever a session is.

## Decisions

1. **One guard module**, `src/utils/shortcutGuard.ts`: `isTypingTarget(el)` (text-like `<input>`, `<textarea>`, `<select>`, contenteditable — checked by attribute too, since jsdom has no `isContentEditable`), `isTypingOutsideSlideEditor(el)` (for Canvas, which must still own ⌘B / Escape inside the slide editor), `isModalOpen()` (the 5 app overlay flags + a showing dialog), `shouldIgnoreGlobalShortcut()`.
2. **One keymap**, `src/utils/presenterKeymap.ts`, copied from PowerPoint's Slide Show: next = → ↓ PageDown Space Enter N; prev = ← ↑ PageUp Backspace P; Home / End = first / last; black = B `.`. Any ⌘ / Ctrl / Alt → nothing.
3. **The Editor's decision becomes a pure function**, `src/utils/editorKeyAction.ts`, so LIVE-A5 can be red-tested without mounting the editor (Canvas needs geometry jsdom cannot produce). The table pins every existing behaviour and marks the fixes.
4. **While presenting, the Editor leaves navigation to the panel**: Backspace, ↑, ↓ return nothing from the Editor; Delete does nothing at all. B / `.` black and L logo stay in the Editor (they now also `preventDefault`).
5. **Out of scope, recorded:** W / `,` white (the app has no white screen); number + Enter to jump; ED-3 (⌘C/⌘V/⌘D act on the box while editing — needs a Canvas render to red-test; editor wave); FS-8 (MediaLibraryPanel's window Delete handler); the double-tap race LIVE-A7 (L4).

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: every table row asserts the exact action (`toBe`); sent-slide
lists are exact and ordered (`toEqual`); each table's length is asserted.

## Blast radius

May create: `src/utils/{shortcutGuard,presenterKeymap,editorKeyAction}.ts` and
their tests, `src/components/presenter/__tests__/PresenterPanel.clicker.test.tsx`.
May change: `src/pages/Editor.jsx` (the keydown handler body and imports only),
`src/components/presenter/PresenterPanel.jsx` (the keydown effect, `goFirst` /
`goLast`, imports), `src/components/editor/Canvas.jsx` (one guard line at the top
of the keydown handler, one import), this plan, the charter row, the notes entry.
**May not** change L0's or L1's tests.

## Todos

- [x] 1. **Red:** `presenterKeymap.test.ts` (25 rows + length) and
  `shortcutGuard.test.ts` (12 cases) and `editorKeyAction.test.ts` (33 rows +
  length) fail — modules missing. `PresenterPanel.clicker.test.tsx` (16 cases):
  **all 10 clicker moves and "Space behind a dialog" fail** on the old handler.
  Five pass before the fix only vacuously (the old handler ignored those keys
  entirely: `<select>` + ↓, modifier-held PageDown, B / `.`, Home / End bounds,
  the count) — they become meaningful once the keymap handles those keys.
- [x] 2. Implement Decisions 1–4.
- [ ] 3. The four new files green; L0 (`presenterFlow`, `PresenterPanel.keys`,
  `appCommands.present`) and L1 (`escapeKey`, `escapeConsumed`, `nativeMenu`,
  `menuBarEscape`, `settingsModalsEscape`) unchanged and green.
- [ ] 4. `npm run gate` + `npm run format:check`.
- [ ] 5. Manual verification (packaged or dev build; owed to Ethan under
  standing rule 7): present, then (a) PageDown / PageUp on a clicker move one
  slide; (b) Backspace goes back a slide and the filmstrip still has every
  slide; (c) Home / End jump; (d) `.` blacks the output; (e) open Output Settings
  and press Space / ↓ → the projector does not move; (f) not presenting: select a
  text box, click the toolbar font-size field, press Backspace → the digit is
  deleted, the text box stays.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact `toBe` / ordered `toEqual` |
| List sampling designed against | Every table's length asserted (25, 33, 10, 5 flags) |
| Quantifier erosion designed against | "every overlay flag" is the enumerated `FLAGS` array with a length check |
| Sanctioned escape hatch | N/A — no allowlist; out-of-scope keys are named in Decision 5 |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | jsdom lacks `isContentEditable` and `scrollIntoView` (Decision 1, clicker test setup); `PresenterPanel` is always mounted (Measured) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | The panel's handler mounts only while presenting — `presentFrom()` seeds `isPresenting`, the live slide and `allSlides` |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel touched |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test modified |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Every keymap key, every guard branch, every Editor action has a row |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom header where the DOM is used; app / dialog / editor / presenter stores reset; `@/utils/ipc` mocked; `scrollIntoView` and `ResizeObserver` stubbed as measurement seams |
| 9 | Test placement | `src/utils/__tests__/`, `src/components/presenter/__tests__/` |
| 10 | Characterization before refactor | The Editor handler's existing behaviour is pinned row-by-row in `editorKeyAction.test.ts` (non-FIX rows) before and after the extraction; L0 / L1 tests unchanged |
