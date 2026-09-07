# Executable Plan E4b — Hover handlers → `hover:` classes

**Workstream:** E · **Charter row:** "hover handlers → `hover:` classes — needs a hover capture first".
**Category:** one — a hover look that is _identical on screen_ before and after, with the JavaScript that produced it gone.

## Measured (2026-09-07, `main` after E4)

| Fact                                     | Value                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onMouseEnter` handlers in JSX           | **38** across 17 files                                                                                                                                                                |
| … that only mutate `currentTarget.style` | **37** — `background` 34, `color` 3, `borderColor` 3, `boxShadow` 2, `transform` 1 (some set two)                                                                                     |
| … that do something else                 | **1** — `MenuBar.jsx` opens a sibling menu on hover while one is open (`setOpenMenu`); stays                                                                                          |
| Conditional hovers                       | several depend on `active` / `disabled` / `open` (`active ? accent-dim : hover`, `if (disabled) return`) — they become conditional class strings, the same condition, no new branches |
| What the E2 net sees of hover            | nothing: no capture hovers anything                                                                                                                                                   |

## Why it is worth doing

Each handler pair is ~6 lines of JavaScript doing what one `hover:` utility
does, and it leaves an inline `background` on the element after the mouse
leaves — which is why E4 had to keep every base value the handlers restore.
Removing them also removes a class of bug: a state change while hovered
(`active` flipping) is not reflected until the next mouse event.

## Decisions

1. **Hover captures first, one per handler.** `e2e/visual-hover.spec.ts`
   hovers each control and captures a **clipped** screenshot (the control's
   bounding box plus 12px), so 37 small baselines instead of 37 full frames.
   Captured on the CI runner like every other baseline. A control that only
   exists in a state the net does not enter is captured in that state if the
   spec can reach it cheaply; otherwise its handler stays and is listed.
2. **Conversion is mechanical:** enter/leave pair → `hover:<utility>` on the
   same element, with the base class it restores already present from E4.
   A conditional pair becomes the same condition in the class string
   (`active ? 'bg-accent-dim' : 'bg-transparent hover:bg-bg-hover'`); a
   `disabled` early-return becomes `enabled:hover:…` (native disabled) or
   the same condition in the string (a prop). The `mouseleave` restore is
   simply deleted — the base class is the restore.
3. **Proof is pixel-exact, as in E4:** capture on the base, convert, strict
   compare — 0 differing pixels on all hover captures **and** all 23
   existing captures (a lost base value would show there).
4. **Guard:** the inline-style ratchet already exists; this plan adds a
   second small ratchet in the same test file — `onMouseEnter` count per
   file — so a new style-mutating hover handler fails the gate. Ceiling 1
   for `MenuBar.jsx`, 0 elsewhere, at the end.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

The 17 files' `onMouseEnter`/`onMouseLeave` attributes and `className`
strings; the hover spec and its baselines; the ratchet test. No handler
that does anything but style is touched.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Hover spec: reach every hoverable control, hover, clipped capture;
      CI baselines via `update_baselines`; E2 addendum PR (#83, 29 captures).
- [x] 2. Convert in one PR; strict compare on all 52 captures; ratchet added
      with a red proof.
- [x] 3. Record.

## Findings

- **29 of 38 handlers converted** (30 replacements, 246 lines gone). Strict
  compare: **0 differing pixels on all 52 captures** — the 29 hovered
  controls and the 23 existing screens, so no base value was lost either.
  Where the base background was an inline dynamic value it moved into the
  same condition in the class string; an inline base would have beaten any
  `hover:` utility.
- **A bug fell out.** The song card's Delete button painted a red border on
  hover and its leave handler restored only the background, so the red
  border stayed until re-render. `hover:border-…` restores itself. Recorded,
  not hidden: the hovered capture is identical, the un-hovered look after a
  hover is now correct.
- **Ratchet:** `HOVER_HANDLER_BUDGET` in `inlineStyleBudget.test.ts`, red
  proof with Home's ceiling one too low. Left, with their ceilings: the two
  handlers that set React state (`MenuBar` opens a sibling menu, `Home`'s
  row `hovered` state), the two collapsed-panel slivers (no capture reaches
  them the same way on every machine), the presenter divider (must stay
  highlighted while dragging — not a pure hover), and `FormattingToolbar`'s
  five (unreachable component, see the notes).
- Inline style props: 198 → 197 (the pin button's whole object went).
