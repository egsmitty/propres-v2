# Phase 7 — Remediation Backlog

Findings from the Phase 6 audit. **This file is append-only during 6F.** Fixes
happen in 6G, each with a failing test written first (TDD, see
`.cursor/rules/testing-standards.mdc`).

Priority: **P0** = user-facing crash or data loss · **P1** = broken/wrong
behavior · **P2** = dead code, cleanup, or risk without a known symptom.

---

## P0 — Confirmed runtime crashes

Found by ESLint `no-undef` on the very first lint run (2026-09-05).

### 1. Toolbar "Insert Image" / "Insert Video" throws ReferenceError

- **Where:** `src/components/layout/Toolbar.jsx:1594` and `:1597`
- **What:** Both `MenuOption` handlers call `importMediaToSelectedSlide(...)`,
  but `Toolbar.jsx` never imports it. The function *is* exported from
  `src/utils/presentationCommands.js:334`, and `FilmstripSlide.jsx:10` imports
  it correctly — so the same feature works from the filmstrip context menu and
  crashes from the toolbar.
- **Impact:** Insert → Media → Insert Image / Insert Video is dead from the
  toolbar. `CLAUDE.md` currently claims this feature works.
- **Fix:** add the import. **Test first:** render the Insert menu, click each
  option, assert `importMediaToSelectedSlide` is called with `'image'` /
  `'video'` — the test must fail with a ReferenceError under current code.

### 2. Clearing a media slide throws ReferenceError

- **Where:** `src/utils/presentationCommands.js:402`
- **What:** `placeholderText: slide.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT`
  references a constant that is exported from `src/utils/textBoxes.js` but never
  imported into this file.
- **Impact:** the code path converting a media slide back to a text slide
  (clear / reset) crashes.
- **Fix:** add the import. **Test first:** call the clearing action on a media
  slide and assert the resulting slide's `placeholderText` equals
  `DEFAULT_PLACEHOLDER_TEXT` imported from the production module.

---

## P1 — Suspicious behavior

### 3. `songSections.js:32` — unnecessary regex escape

- **Where:** `src/utils/songSections.js:32`, `no-useless-escape` on `\[`
- **Why it matters:** this regex parses song section labels. A stray escape in a
  character class is a common source of a pattern that silently matches the
  wrong thing. **Verify what it currently matches before changing it** — write
  a characterization test first, then fix only if behavior is genuinely wrong.

### 4. 17 × `react-hooks/set-state-in-effect`

Calling `setState` synchronously in an effect body causes cascading renders.
Concentrated in `Home.jsx` and the editor panels. Each needs individual triage —
some are legitimate sync-with-external-store patterns, some are real perf bugs.
Do **not** bulk-fix; convert to `useSyncExternalStore` or derived state
case-by-case.

### 5. 4 × `react-hooks/immutability` + 1 × `preserve-manual-memoization`

Direct mutation of values React expects to be immutable. Real correctness risk
under concurrent rendering.

---

## P2 — Cleanup

### 6. 36 × `no-unused-vars`

Includes `ensureGroup` (`songSections.js:81`) and `alertDialog`
(`presentationCommands.js:24`) — dead imports/functions. Each removal should be
checked for a *missing call site* rather than assumed dead: an unused import is
sometimes the visible half of a feature that was never wired up (see P0 #1,
which is the same class of mistake in the opposite direction).

### 7. 11 × `no-empty`

Empty catch blocks swallowing errors. Each one hides a failure mode. Replace
with either a real handler or an explicit comment justifying the swallow.

### 8. 16 × `react-hooks/exhaustive-deps` (warnings)

Missing effect dependencies. Classic source of stale-closure bugs.

### 9. Commented-out `presenterWindow` code in `electron/main/index.js`

Kept for rollback when the presenter moved to an in-editor sidebar (Phase 3).
That decision has held for several phases — delete it, since git history is the
real rollback mechanism.

### 10. `/fonts/Inter-Variable.woff2` unresolved at build time

Known Vite warning, carried in `CLAUDE.md` "Known Issues" for multiple phases.

---

## Counts at audit time (2026-09-05, pre-format)

`npx eslint .` → **90 problems (74 errors, 16 warnings)** across:

| Count | Rule | Severity |
|---|---|---|
| 36 | `no-unused-vars` | error |
| 17 | `react-hooks/set-state-in-effect` | error |
| 16 | `react-hooks/exhaustive-deps` | warn |
| 11 | `no-empty` | error |
| 4 | `react-hooks/immutability` | error |
| 3 | `no-undef` | error |
| 1 | `react/no-unescaped-entities` | error |
| 1 | `react-hooks/preserve-manual-memoization` | error |
| 1 | `no-useless-escape` | error |

This table is the **ratchet baseline**. The count must only ever go down.
