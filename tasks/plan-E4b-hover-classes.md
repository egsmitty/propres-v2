# Executable Plan E4b — Hover handlers → `hover:` classes

**Workstream:** E · **Charter row:** "hover handlers → `hover:` classes — needs a hover capture first".
**Category:** one — a hover look that is _identical on screen_ before and after, with the JavaScript that produced it gone.

## Measured (2026-09-07, `main` after E4)

| Fact                                        | Value                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onMouseEnter` handlers in JSX              | **38** across 17 files                                                                                                                                                                 |
| … that only mutate `currentTarget.style`    | **37** — `background` 34, `color` 3, `borderColor` 3, `boxShadow` 2, `transform` 1 (some set two)                                                                                       |
| … that do something else                    | **1** — `MenuBar.jsx` opens a sibling menu on hover while one is open (`setOpenMenu`); stays                                                                                            |
| Conditional hovers                          | several depend on `active` / `disabled` / `open` (`active ? accent-dim : hover`, `if (disabled) return`) — they become conditional class strings, the same condition, no new branches |
| What the E2 net sees of hover               | nothing: no capture hovers anything                                                                                                                                                    |

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

- [ ] 1. Hover spec: reach every hoverable control, hover, clipped capture;
      CI baselines via `update_baselines`; E2 addendum PR.
- [ ] 2. Convert, file by file, in one or two PRs; strict compare on all
      captures; ratchet added with a red proof.
- [ ] 3. Record.

## Findings

(filled as it goes)
