# Executable Plan D3 — `react-hooks/exhaustive-deps` (11 warnings, individually)

**Workstream:** D · **Depends on:** D4 (the file set is now stable)
**Category:** one — effect and memo dependency lists that omit something they read.

Each warning was read in full. None is a live stale-closure bug today: in every
case the omitted function reads values that _are_ in the dependency list (so
the closure is re-created when they change) or reads through refs/`getState()`.
They are still worth fixing: each one is a stale closure the next edit can
introduce silently, and together they are the entire lint-warning budget.

## Decisions

| #   | Site                                          | Omitted                                               | Kind                                                                                                                                                            | Decision                                                                                |
| --- | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `App.jsx:67`                                  | two store setters                                     | stable zustand functions                                                                                                                                        | list them                                                                               |
| 2   | `Canvas.jsx:1034`                             | `finishInlineEditing`                                 | handler called from document listeners                                                                                                                          | `useLatest` — the listener calls the newest handler without re-subscribing every render |
| 3–4 | `FormattingToolbar.jsx:255/269` (NumberField) | `commit`                                              | handler from a registry / document listener                                                                                                                     | `useLatest`                                                                             |
| 5   | `SlideTextEditor.jsx:64`                      | `textBox?.body`                                       | **deliberate exclusion**: the effect seeds the contentEditable when the _box_ changes; re-running on every body keystroke would rewrite the editor while typing | read the body through `useLatest` at seed time — no dependency, no disable              |
| 6–7 | `Toolbar.jsx` numeric field (two effects)     | `commitCurrentValue`                                  | registry + document listener                                                                                                                                    | `useLatest`                                                                             |
| 8   | `MediaLibraryPanel.jsx:68`                    | `handleDeleteFolder`                                  | window keydown                                                                                                                                                  | `useLatest`                                                                             |
| 9   | `PresenterPanel.jsx:175`                      | `goNext`, `goPrev`                                    | window keydown while presenting                                                                                                                                 | `useLatest` (they already read refs internally)                                         |
| 10  | `SlidePreviewSurface.jsx:48`                  | `mediaSlide`                                          | derived from `slide`, which is listed                                                                                                                           | list it                                                                                 |
| 11  | `Editor.jsx:290`                              | `handleSave`, `handlePresent`, `handleStopPresenting` | window keydown                                                                                                                                                  | `useLatest` for all three                                                               |

`useLatest` (`src/hooks/useLatest.ts`, 3 tests) is the documented pattern
behind React 19's `useEffectEvent`, written for React 18: a ref updated in an
effect after every render. The alternative — listing the handler — would tear
down and re-create each subscription on every render.

## Tests

- `useLatest` — 3 cases.
- `FormattingToolbarFields.test.tsx` gains "a mousedown outside a focused
  NumberField commits" (the document-listener path that now goes through the ref).
- The E2E suite already drives the window-keydown effects for real:
  `editing.spec` (ArrowUp in the editor) and `lifecycle.spec` (presenting).

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Blast radius

`src/hooks/useLatest.ts` (+ test); the nine files above, dependency lists and
one-line ref reads only; `package.json` lint ceiling → 0; tasks records.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Hook + test; NumberField outside-click test (green on current code).
- [x] 2. Eleven edits; `eslint` reports **zero** warnings; ceiling 11 → 0; gate; build; E2E ×2.
- [x] 3. Record; PR.

## Findings (2026-09-06)

- The rule cannot see that `useLatest` returns a stable ref, so it asked for
  the nine ref objects in the dependency lists; they are listed (a ref object
  never changes identity, so this is inert). With that, **`eslint .` reports
  zero problems** — no errors, no warnings, no suppressions. The warning
  ceiling is `--max-warnings 0`.
- Gate 36 files / 302 tests; E2E 20/20; coverage 15.30/13.05/14.56/16.10.
- Workstream D is complete: 5 compiler immutability/memo findings, 16
  `set-state-in-effect`, 34 `no-unused-vars`, 11 `exhaustive-deps`, 1
  `no-unescaped-entities` — 67 findings, each with a written decision.
