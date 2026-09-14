# Executable Plan ED3 — paste keeps text only

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 2 plan **D4**,
item **ED-9** (P1, [O]): paste from Word, Google Docs or the web is not
sanitised. The audit's fix is "default to Keep Text Only"; its ⌘⇧V half is
**CMD-M2**, a separate command item, and is not in this plan. (ID ED3: ED1 is
plan-ED1-editor-small-fixes, ED2 is plan-ED2-entity-compounding.)

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`e24a2f8`.

---

## Measured

| Code | What happened |
|---|---|
| `SlideTextEditor.jsx` `handlePaste()` | Only cleared the placeholder. The browser's default paste then ran, inserting the clipboard's `text/html`. |
| `SlideTextEditor.jsx` `handleInput()` | Saves `normalizeEditorHtml(ref.current.innerHTML)` as the body — so the pasted spans, inline styles and `pt` font sizes went into the slide body, where `pt` sizes don't scale in thumbnails or on the output. |
| An image on the clipboard | The browser inserted an `<img>` into the text box body; slide media belongs to backgrounds. |
| Tests | No paste test existed. jsdom has no native paste, so the old behaviour is proven through its mechanism: the default was never prevented, and nothing inserted or saved text. |

## Decisions

1. **Paste always keeps text only.** `handlePaste` prevents the default and reads
   `text/plain`, normalising `\r\n` / `\r` to `\n`.
2. **Insert through `document.execCommand('insertText')` when it works** — it
   keeps the browser's undo stack and turns newlines into line breaks. Otherwise
   (jsdom, or a refusal) insert text nodes separated by `<br>` at the caret and
   move the caret after them. The call is guarded with try/catch so a throwing
   implementation still pastes.
3. **Save through the existing `handleInput`**, since preventing the default also
   suppresses the `input` event. The placeholder is cleared first, as before.
4. **A paste with no text does nothing** — no image, no empty save.
5. **Not in this plan:** ⌘⇧V "Paste and Match Style" (CMD-M2); pasting whole
   slides or media; the duplicate `normalizeEditorHtml` in `Toolbar.jsx`.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: the saved body's plain text compared exactly; "no styles" asserted
by a regex over the stored body; `preventDefault` observed through
`fireEvent`'s return value; the native command's call compared exactly.

## Blast radius

May create: `src/components/editor/__tests__/SlideTextEditor.paste.test.tsx`,
this plan. May change: `src/components/editor/SlideTextEditor.jsx`
(`insertPlainText`, `handlePaste`), the charter row, the notes entry. **May not**
change any existing test or any other file.

## Todos

- [x] 1. **Red** — `SlideTextEditor.paste.test.tsx`: 5 new cases, 5 fail on the old
  code on their assertions (default not prevented ×2, nothing saved ×2,
  `insertText` never called).
- [x] 2. Implement Decisions 1–4.
- [x] 3. The paste file green; `SlideTextEditor.test.tsx`, `richTextEditor`,
  `ScaledSlideText` unchanged and green → 12 / 12 across four files. (No
  `slideMarkup` test exists on this base; it arrives with ED2.)
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 642/642 passed`;
  `format:check` ✓ after one `prettier --write` of `SlideTextEditor.jsx` (line
  wrapping only), with the suites and ESLint re-run clean.
- [ ] 5. Manual verification (owed to Ethan): copy two lines of lyrics from a
  styled Word or Google Docs document and paste into a slide → the text takes
  the slide's own font and size, keeps its two lines, and the thumbnail matches;
  ⌘Z right after the paste removes it; copy an image and paste into a slide →
  nothing happens.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact comparisons |
| List sampling designed against | Each clipboard shape (styled HTML + text, multi-line text, text into a placeholder, no text) has its own case |
| Quantifier erosion designed against | "every paste into a slide text box" = the one `onPaste` on the contentEditable in `SlideTextEditor.jsx` (Measured) |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 2 (jsdom has no `execCommand`; the fallback is what the tests exercise); Decision 3 (`preventDefault` suppresses `input`) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots; no E2E spec pastes |
| Preconditions for conditional UI | The editor must be mounted with a text box; the placeholder case mounts an empty box with `placeholderText` |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — no stored data is rewritten; bodies already containing pasted styles are left as they are |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test edited |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Both insertion paths (native command, node fallback) and the no-text early return |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom; `clipboardData` passed through `fireEvent.paste`; `document.execCommand` restored in `afterEach` |
| 9 | Test placement | `src/components/editor/__tests__/` |
| 10 | Characterization before refactor | N/A — a bug fix; `SlideTextEditor.test.tsx` passes unchanged |
