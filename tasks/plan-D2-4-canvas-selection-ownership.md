# Executable Plan D2 slice 4 — Canvas: the four remaining `set-state-in-effect` findings

**Workstream:** D · **Depends on:** D2 slices 1–3 merged
**Category:** one — state ownership between `Canvas.jsx` and the editor store.

## Why these four are one plan

`Canvas.jsx` keeps `selectedTextBoxIds` in local state **and** mirrors it into
the editor store in an effect; it resets its interaction state in an effect
when the selected slide changes, calling two store setters the store's own
selection actions already call; and it decides in an effect, after the render
that showed the slide, whether to drop into text editing. The store already
owns `selectedSlideId`, `editingSlideId`, `selectedTextBoxIds` and
`suppressAutoEditSlideId`. Giving it the decision removes all four effects.

| #   | Site                                                            | Decision                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `Canvas.jsx:540` viewport measurement                           | drop the synchronous `measure()`; the `requestAnimationFrame` and the ResizeObserver's initial notification already measure on mount (same frame budget)                                                                                                                                                                                                                           |
| 6   | `Canvas.jsx:554` reset on slide change                          | local UI state (draft boxes, editing box, guides, marquee, metric, drag, refs) resets with the adjust-while-rendering pattern keyed on `section                                                                                                                                                                                                                                    | slide`; the two store calls (`setSelectedTextBoxIds([])`, `setEditingSlide(null)`) are dropped — `setSelectedSlide`/`setSlideSelection`/`setPresentation` / undo / redo already do them |
| 7–8 | `Canvas.jsx:574/597` auto-enter editing                         | **moved into the store**: `resolveSelectionEditing(presentation, sectionId, slideId, { suppress })` (pure, `src/utils/autoEdit.ts`) runs inside `setSelectedSlide` / `setSlideSelection`. The two "insert a new slide" flows pass `{ suppressAutoEdit: true }` instead of calling `setSuppressAutoEditSlideId` _after_ selecting (which only worked because the effect ran later). |
| —   | `Canvas.jsx:570` mirror effect (not a finding, same root cause) | `selectedTextBoxIds` becomes store-owned; the mirror goes; the store setter accepts a functional updater for the one shift-click site                                                                                                                                                                                                                                              |

**Deliberate behaviour change (recorded):** undo/redo restore a selection
without entering edit mode. Before, the Canvas effect fired on any
`slide.id` change, so undoing into an empty slide dropped the user into
editing. History navigation should never do that.

## Tests (written first)

- `src/utils/__tests__/autoEdit.test.ts` — 7 cases (empty single box → edit;
  suppressed → select only; text → nothing; two boxes → nothing; media slide →
  nothing; missing slide/presentation → nothing; whitespace is empty).
- `src/store/__tests__/editorStore.test.ts` — 5 new cases (select empty →
  editing + box; select text slide → nothing; `suppressAutoEdit` option;
  functional updater; undo does not auto-edit).
- `e2e/editing.spec.ts` — the mount case and the navigation case through the
  real UI: a blank presentation opens editing its empty first slide; Escape
  leaves editing; Insert → New Slide selects the new slide **without**
  editing; ArrowUp back onto the empty first slide re-enters editing.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                                       | Action                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/utils/autoEdit.ts` + test                                             | create                                                                               |
| `src/store/editorStore.js` (+ test)                                        | selection actions take `options`; run the rule; functional updater                   |
| `src/utils/presentationCommands.js`, `src/components/editor/Filmstrip.jsx` | pass `{ suppressAutoEdit: true }`; drop the post-hoc suppress call                   |
| `src/components/editor/Canvas.jsx`                                         | four effects removed; store-owned `selectedTextBoxIds`; adjust-while-rendering reset |
| `e2e/editing.spec.ts`                                                      | create                                                                               |
| `eslint-suppressions.json`, `vitest.config.mjs`                            | prune; thresholds                                                                    |
| `tasks/*`                                                                  | record                                                                               |

**Do NOT modify:** Toolbar / FormattingToolbar readers of the store (they already read the store), other E2E specs.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Unit tests red (helper absent; store rule absent). E2E written.
- [x] 2. Implement; `eslint` reports none of the four; prune; gate; E2E 22/22 ×2; packaged-app launch (Canvas is the editor's core).
- [x] 3. Record; PR.

## Findings (2026-09-06)

- Red first: helper absent, three store cases failing. E2E written before the
  implementation and **run against the old code to validate its premise** —
  which it failed: the store's editing state never opened the inline
  contentEditable (that opens only on double-click/Enter), so the spec now
  asserts the state the store actually owns, exposed as `data-text-editing`
  on the canvas root and `data-selected` on each text box root (two
  attributes added as test hooks). On the fixed code it passes; Escape was
  dropped from the spec because it only closes the inline editor.
- A fifth Canvas effect ("a text box was just added → select it") shared the
  root cause and is handled the same way: the store's `addSlideTextBox`
  selects the new box; Canvas resets its transient state while rendering.
- All Canvas `set-state-in-effect` findings gone; suppressions 38 → **34**.
  Gate 35 files / 298 tests; E2E **20/20 ×2**; packaged app probe: the blank
  presentation opens in editing mode with one box selected.
- Deliberate behaviour change (recorded): undo/redo never enter edit mode.
- iCloud: 49 "name 2.ext" duplicates appeared across `src/`, `electron/`,
  `out/` and `coverage/` during this slice alone; removed. Excluded patterns
  keep them out of the gate, but the folder should not live in iCloud.
