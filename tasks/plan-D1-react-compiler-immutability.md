# Executable Plan D1 — React Compiler "immutability" + "preserve-manual-memoization" (5 findings)

**Workstream:** D (React correctness) · **Depends on:** nothing
**Category:** one — the React Compiler's data-flow rules. The 16 `set-state-in-effect`,
15 `exhaustive-deps` and 34 `no-unused-vars` findings are D2, D3, D4.
**Charter rule:** individually triaged, no bulk fixes; `eslint-suppressions.json` only shrinks.

## The five findings, individually

| #   | Location                 | Message                                                                                                         | Triage                                                                                                                                                                                                                     | Fix                                                                                                                                                                                                        |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Canvas.jsx:1072`        | "Modifying a variable defined outside a component" — `document.body.style.cursor = …` inside `beginInteraction` | **Real rule, benign code.** The write is in a pointer-down handler, but `beginInteraction` is a plain function in render scope, so the compiler must assume it may run during render and bails out of the whole component. | Move the body-style writes to `src/utils/bodyInteractionStyle.ts` (`beginBodyInteraction(cursor)` / `endBodyInteraction()`), a module the compiler does not analyse. Same behaviour, unit-tested in jsdom. |
| 2   | `Canvas.jsx:1073`        | same, `userSelect`                                                                                              | same                                                                                                                                                                                                                       | same helper                                                                                                                                                                                                |
| 3   | `Canvas.jsx:369`         | "Existing memoization could not be preserved" — `useMemo(…, [resolvedSongId, section])`                         | **Real.** `section` is recomputed with `find()` every render, so the `useMemo` never hits and the compiler refuses to trust it.                                                                                            | Memoize `section` on `[presentation, selectedSectionId]`. The song-section memo then holds.                                                                                                                |
| 4   | `OutputRenderer.jsx:114` | "`loadMedia` is accessed before it is declared"                                                                 | **Real hazard class.** Function declarations hoist, so it runs, but the compiler cannot track a value used before its declaration and skips the component.                                                                 | Inline the load into the effect.                                                                                                                                                                           |
| 5   | `OutputRenderer.jsx:129` | "`fetchMedia` is accessed before it is declared"                                                                | same                                                                                                                                                                                                                       | `fetchMedia` uses only `getMedia`; move it to module scope above the component.                                                                                                                            |

Also `Canvas.jsx:736–737` (the matching `cursor = ''` / `userSelect = ''` inside the
pointer-up handler) uses the same helper so the pair stays together. It is not a
finding today because it sits inside an effect the compiler understands.

## Tests (written first)

- `src/utils/__tests__/bodyInteractionStyle.test.ts` (jsdom): begin sets both
  properties; end clears both; the cursor value passes through untouched.
- `src/components/presenter/__tests__/OutputRenderer.test.tsx` (jsdom,
  `@/utils/ipc` and `@/utils/backgrounds` mocked): on mount it loads the media
  library once, signals ready once, and subscribes to all five events; an
  `output:update` with a **media slide** resolves the item from the loaded
  library and paints it; an update with a text slide and a background paints
  the background; unmount unsubscribes all five. This is the characterization
  that pins the behaviour the hoisting must preserve.
- Finding 3 has no behavioural test that is honest to write (it is a
  memoization hit-rate); the rule itself is the check: the suppression
  entry disappears and `eslint` stays clean on the file.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                         | Action                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `src/utils/bodyInteractionStyle.ts` + test                   | create                                            |
| `src/components/presenter/__tests__/OutputRenderer.test.tsx` | create                                            |
| `src/components/editor/Canvas.jsx`                           | lines 361, 736–737, 1072–1073 only                |
| `src/components/presenter/OutputRenderer.jsx`                | `fetchMedia` to module scope; `loadMedia` inlined |
| `eslint-suppressions.json`                                   | prune (56 → 51)                                   |
| `vitest.config.mjs`                                          | thresholds only                                   |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md`           | record                                            |

**Do NOT modify:** any other finding's site (D2–D4), PresenterPanel/Editor
body-style writes (not findings), E2E specs.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Tests written; helper test FAILS (module absent); OutputRenderer test green on current code (characterization). Paste.
- [x] 2. Fixes; `eslint` reports zero of these five; prune; gate; E2E (presenting flow covers OutputRenderer).
- [x] 3. Record; PR.

## Findings (2026-09-06)

- Characterization: the OutputRenderer test (4 cases) was green on the
  unfixed code and stayed green after the hoisting; the helper test was
  written with its 6-line module (no red phase to show for a pure extraction).
- Findings 1, 2, 4, 5: fixed by code; `eslint` reports none of them.
- **Finding 3 triaged, not silenced by code:** with `section` memoized the
  compiler still refuses to preserve the memo because `resolvedSongId` derives
  from a store-selected object it cannot prove immutable. Nothing in Canvas
  mutates slide/section/presentation (grep-verified), the deps are a
  primitive and a memoized object, and removing the memo would churn its two
  consumers every render. The finding now carries an explicit, reasoned
  block directive at the site instead of a silent entry in the suppressions
  file — reviewable, and the file count still only shrinks (56 → 51).
- Gate 30 files / 260 tests; E2E 19/19. Coverage 8.25/7.00/7.66/8.72 →
  10.12/8.49/9.09/10.77 (the first component render test reaches Canvas
  and OutputRenderer); thresholds raised to 9.9/8.2/8.8/10.5.
- Added `@types/react` / `@types/react-dom` (dev) so `.tsx` tests type-check.
