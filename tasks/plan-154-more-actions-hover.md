# Executable Plan #154 — Recent-card "…" button mirrors the Pin hover

**Issue:** #154. On a presentation row in Home's **Recent** and **Open** lists,
hovering the three-dots **More actions** (…) button does nothing, while the
**Pin** button beside it lights up with a ring shadow and border highlight. The
two buttons sit together and should feel the same on hover. One PR, one CSS
change. Branch base `main` @ `748d8f5` (#169 merged).

---

## Measured (read on 2026-09-23, `main` @ `748d8f5`)

- `src/pages/Home.jsx` renders both action buttons in one shared
  `PresentationRow` component (line ~963), used by the Home Recent list, the
  Home Pinned list, and the Open list — so one class change fixes every surface
  the issue names.
- The **Pin** button (line ~1049) carries the hover treatment:
  `hover:shadow-[0_0_0_2px_rgba(74,124,255,0.12)]` plus, when unpinned,
  `hover:border-border-default` (when pinned, `hover:border-accent`).
- The **More actions** button (line ~1075) carries **no `hover:` classes**:
  `w-11 h-11 rounded-full flex items-center justify-center bg-transparent
  text-text-tertiary border border-border-subtle`. That is the whole bug — it is
  inert on hover.

## Decision

Add the Pin's non-pinned hover classes to the More button so the two match:
`hover:shadow-[0_0_0_2px_rgba(74,124,255,0.12)] hover:border-border-default`.
The More button is not a pin toggle, so it mirrors the neutral (unpinned) Pin
treatment, which is the same ring + border-highlight the issue points at. No
markup, layout, handlers, or other rows change.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**May change:** `src/pages/Home.jsx` (one `className` string on the More button),
`src/pages/__tests__/Home.test.tsx` (one new test), this plan, the notes entry.
**May not change:** any handler, any other row, the Pin button, the context
menu, presentation open/rename/delete behavior.

## Todos

- [x] 1. **Red:** `Home.test.tsx` — a new test asserts the More button's
      `className` contains both Pin hover classes, with a guard that the Pin
      itself still carries them (so the test fails loudly if the Pin drifts,
      not silently against a stale constant). Confirmed red on the More
      assertion, green on the Pin guard.
- [x] 2. **Green:** add the two hover classes to the More button in `Home.jsx`.
- [x] 3. Full gate from `presenter-pro/`.
- [x] 4. PR body: the finding, the one-line change, manual check owed (hover in
      a running window on Recent and Open).

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; the test guards the Pin's own classes so the mirror can't pass against a stale literal |
| Bounded blast radius | One `className` string + one test; may-not-change list above |
| Per-todo verification | Todo 1 red proof, Todo 3 full gate |
| Behavior-change test edits | None — a new test only; no existing test changed |
| Required findings report | Todo 4 |
| Data rewrites | N/A |

## Review

**What changed.** One `className` on the More actions (…) button in the shared
`PresentationRow` (`src/pages/Home.jsx`), adding
`hover:shadow-[0_0_0_2px_rgba(74,124,255,0.12)] hover:border-border-default` so
it mirrors the Pin button's hover ring and border highlight. Because the row is
shared, the fix covers Home Recent, Home Pinned, and the Open list.

**Test.** `Home.test.tsx` gains one test (#154) asserting the More button
carries both Pin hover classes, guarded by first asserting the Pin still has
them. It was red on the More assertion before the change, green after.

**Gate:** type-check ✓ · lint ✓ · vitest 1104/1104 passed (0 skipped) ·
prettier ✓.

**Manual check owed:** hover the … button on a Recent row and an Open row in a
running window; it should light up like the Pin.
