# Executable Plan E3 — Keyboard operability

**Workstream:** E · **Decision (Ethan, 2026-09-06):** every control keyboard-reachable; a test asserting interactive elements are focusable; live-operation ergonomics (what a volunteer can reach without a mouse, mid-service).
**Category:** one — reachability and visibility of keyboard focus.

## Measured (2026-09-06)

| Fact                                      | Value                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native `<button>`s                        | 88                                                                                                                                                                                                                                                                                            |
| Native non-button elements with `onClick` | 6 — four are modal **backdrops** (click-outside-to-close; Escape already closes them), two are real gaps: the editor's panel **collapse slivers** (`Editor.jsx` `CollapseSliver`, a `div`) and the Home page **presentation rows** (`Home.jsx`, a `div` grid row that opens the presentation) |
| `outline-none` / `outline: 'none'`        | 29 occurrences, on inputs, selects and spans — keyboard focus is invisible on them                                                                                                                                                                                                            |
| Global focus style                        | **none** — no `:focus-visible` rule anywhere; the app relies on browser defaults where they survive                                                                                                                                                                                           |
| Live-ops shortcuts                        | present and documented in the `?` overlay: F5 present, Esc stop, ←/→ slides, B black, L logo, ⌘M new slide, ⌘S save                                                                                                                                                                           |

## Decisions

1. **Visible focus, once, globally.** `globals.css` gains `:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }`. `:focus-visible` matches keyboard focus (and inputs, where a ring is the expected affordance), not mouse clicks on buttons, so the mouse-driven look is unchanged. The 29 `outline-none` suppressions are removed so the ring can appear. **This is the one deliberate visual addition in workstream E, and it is the decision's whole point.**
2. **Collapse slivers become `<button>`s** with the same styles and an `aria-label` ("Expand/Collapse filmstrip" …); Enter/Space work for free.
3. **Home presentation rows** get `role="button"`, `tabIndex={0}`, an `aria-label` with the title, and Enter/Space → open. Same look.
4. **Backdrops are marked** `data-backdrop="true"` so the guard can tell a deliberate click-outside surface from a missing keyboard path.
5. **Guard test** (`src/__tests__/keyboardReachability.test.ts`): scans `src/**/*.jsx`; every native non-button element with `onClick` must be a marked backdrop or carry `role`, `tabIndex` and an `onKeyDown`. Zero exceptions at merge; anything new fails.
6. **E2E** `e2e/keyboard.spec.ts`: Home → Tab to a presentation row → Enter opens it; in the editor `?` opens the shortcuts overlay and Escape closes it; F5 starts presenting (output window appears) and Escape stops it — the live-ops path with no mouse.

Out of scope (recorded): a roving-tabindex menu bar and filmstrip (arrow-key navigation inside composite widgets) — a UX design decision for Ethan, not a correctness fix.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

`globals.css`; `Editor.jsx` (CollapseSliver), `Home.jsx` (row), the four backdrop files, the files carrying `outline-none` (class or style removal only); the guard test; the E2E spec; tasks records.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Guard test FAILS on current code naming the two gaps (backdrops unmarked would name six; mark them first so the failure is the real finding). E2E written.
- [x] 2. Ring, slivers, rows, `outline-none` removals; guard green; gate; E2E ×2.
- [x] 3. Record; PR.

## Findings (2026-09-06)

- Guard red on the old code naming all six (four backdrops, the collapse
  sliver, the presentation row); green after marking the backdrops and fixing
  the two real gaps. `aria-hidden` was **not** put on backdrops: the dialog is
  a child of the backdrop element, so it would have hidden the dialog itself
  from assistive tech.
- 28 of 29 `outline-none` suppressions removed; the one kept is the inline
  slide text editor, whose canvas selection chrome already marks focus (a
  second ring around the box while typing would be noise). Documented in
  place.
- New E2E: keyboard-only — Enter on a presentation row opens it; `?` /
  Escape toggle the shortcuts overlay; F5 opens the output window and Escape
  closes it. First run exposed a timing truth: the presenting flag flips only
  after the output window's ready handshake, so the spec waits for the
  "Presenting" banner before Escape.
- Gate 38 files / 306 tests; lint clean; **E2E 21/21 ×2**. Coverage
  15.35/13.04/14.55/16.16 (thresholds unchanged, still above).
