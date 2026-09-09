# Executable Plan F1 — extract and test the pure helpers, so F can start

**Workstream:** F (Structure) · **This is the gate opener, not the refactor.**
The charter blocks F until "characterization tests exist for a file before it
is decomposed." This plan builds the first and cheapest part of that: the pure
functions already sitting at module top level in the large files, exported and
tested **without moving a single component or changing a single render**.

Written per `.cursor/rules/writing-executable-plans.mdc`. Ends with a complete
Compliance Manifest.

---

## Why this first

Measured 2026-09-09. The six files F wants to decompose:

| File | Lines | Coverage | Top-level non-component functions |
|---|---|---|---|
| `src/components/editor/Canvas.jsx` | 1816 | **0 %** | 25 (18 pure, before the first component at :1535) |
| `src/components/layout/Toolbar.jsx` | 1768 | **0 %** | 26 (≈10 pure, the rest are components) |
| `electron/main/index.js` | 1557 | **0 %** | — |
| `src/components/editor/Filmstrip.jsx` | 1217 | **0 %** | 17 |
| `src/pages/Home.jsx` | 1088 | **0 %** | 21 |
| `src/components/library/SongEditorModal.jsx` | 1167 | 31.7 % | — |

Two things follow from that table:

1. **Rendering is not where the risk is.** `Canvas.jsx`'s first 300 lines are
   pure geometry — resize-from-centre, rotation from a pointer, rect
   intersection, snap-to-guide — which is the most intricate logic in the app
   and the least observable. `testing-standards.mdc` already prescribes the
   remedy: *"Extract the computation into a pure function and test that"*,
   because jsdom returns zeros from `getBoundingClientRect()`.
2. **Nothing has to move for this to pay.** These functions are already at
   module top level and already pure. They are untestable today only because
   they are not exported. Exporting and testing them is a **zero-render-change**
   step that puts real tests under the exact files F targets.

A component-extraction plan written before this one would be a rewrite with
extra steps — the phrase the testing standard uses.

## A bug found while measuring — fix it in this plan

`getSelectedSlide(presentation, selectedSectionId, selectedSlideId)` is
**defined twice**, with the same name and signature and **different behaviour**:

```js
// Canvas.jsx:62 — throws when `sections` is missing
if (!presentation) return null;
const section = presentation.sections.find(…);

// Toolbar.jsx:100 — null-safe throughout
const section = presentation?.sections?.find(…);
if (!section) return null;
return section.slides?.find(…) || null;
```

Canvas's copy throws a `TypeError` on a presentation whose `sections` is
undefined; Toolbar's returns `null`. Both are reachable from the same store.
One shared, null-safe implementation replaces both.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

**Applied specifically here:** these tests DESCRIBE current behaviour. If a test
of an extracted helper fails, the extraction is wrong — do not "fix" the helper
to match the test, and do not adjust the test to match a changed helper. The one
exception is `getSelectedSlide`, whose two copies genuinely disagree; the plan
says explicitly which behaviour wins and why.

## Bounded blast radius

### Slice 1 — Canvas geometry and text helpers

| File | Action |
|---|---|
| `presenter-pro/src/utils/canvasGeometry.ts` | create — the 10 geometry helpers, moved verbatim |
| `presenter-pro/src/utils/canvasTextStyle.ts` | create — the 7 text/style helpers, moved verbatim |
| `presenter-pro/src/utils/selectedSlide.ts` | create — the one shared `getSelectedSlide` |
| `presenter-pro/src/utils/__tests__/canvasGeometry.test.ts` | create |
| `presenter-pro/src/utils/__tests__/canvasTextStyle.test.ts` | create |
| `presenter-pro/src/utils/__tests__/selectedSlide.test.ts` | create |
| `presenter-pro/src/components/editor/Canvas.jsx` | modify — **delete the moved functions, add imports. Nothing else.** |
| `presenter-pro/src/components/layout/Toolbar.jsx` | modify — **delete its `getSelectedSlide`, import the shared one. Nothing else.** |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |

### Slice 2 — Toolbar value normalizers

| File | Action |
|---|---|
| `presenter-pro/src/utils/toolbarValues.ts` | create — `normalizeFontFamilyValue`, `rgbToHex`, `normalizeColorValue`, `normalizeAlignValue`, `getRenderedBodyFontSize` |
| `presenter-pro/src/utils/__tests__/toolbarValues.test.ts` | create |
| `presenter-pro/src/components/layout/Toolbar.jsx` | modify — delete the moved functions, add imports |
| `presenter-pro/vitest.config.mjs` | modify — thresholds |

### Do NOT, in either slice

Move, rename or restructure **any component** (`EmptyState`, `SongOrderTray`,
`ResizeHandles`, `RotationHandle`, `GuideLine`, `SelectionRect`,
`CanvasBackground`, and every `Toolbar` sub-component stay exactly where they
are) · change any hook, effect or render path · change any default value,
colour or magic number · touch `Filmstrip.jsx`, `Home.jsx`,
`SongEditorModal.jsx` or `electron/main/index.js` — those are later slices ·
touch any `e2e/` spec or baseline.

**A moved function must be byte-identical apart from the `export` keyword and
its import list.** If it needs an edit to work after moving, STOP and report:
that means it was not pure, and it belongs in a different slice.

---

## The functions to extract — all 18, exhaustive

### `canvasGeometry.ts` — 10, from `Canvas.jsx`

| # | Function | Line |
|---|---|---|
| 1 | `clamp` | 69 |
| 2 | `getResizeHandleCode` | 73 |
| 3 | `getResizeHandleDirections` | 77 |
| 4 | `resizeBoxFromCenter` | 85 |
| 5 | `normalizeRect` | 133 |
| 6 | `rectsIntersect` | 141 |
| 7 | `boxBounds` | 150 |
| 8 | `snapGroupToGuides` | 230 |
| 9 | `getRotationFromPointer` | 296 |
| 10 | `handleCursor` | 304 |

### `canvasTextStyle.ts` — 7, from `Canvas.jsx`

| # | Function | Line |
|---|---|---|
| 11 | `resolveVerticalAlignment` | 161 |
| 12 | `renderOutline` | 167 |
| 13 | `renderShadow` | 173 |
| 14 | `renderTextDecoration` | 178 |
| 15 | `baseHighlightStyle` | 186 |
| 16 | `renderTextBody` | 199 |
| 17 | `cycleCase` | 212 |

### `selectedSlide.ts` — 1, replacing two copies

| # | Function | From |
|---|---|---|
| 18 | `getSelectedSlide` | `Canvas.jsx:62` **and** `Toolbar.jsx:100` |

**Toolbar's null-safe version wins.** It is strictly more defensive, it already
handles every input Canvas's does, and Canvas's `TypeError` on a missing
`sections` array is a latent crash, not a behaviour worth preserving. This is
the plan's one deliberate behaviour change; it must be stated in the summary,
and it gets a test that fails under Canvas's version.

---

## Todos

- [ ] **1. Failing tests first (TDD — before todo 2).** Write the three test
      files against modules that do not exist yet. **At least one case per
      extracted function — 18 minimum**, and each test file ends with a
      self-enforcing coverage guard:

      ```ts
      import * as geometry from '@/utils/canvasGeometry';
      it('tests every exported helper', () => {
        const exported = Object.keys(geometry).sort();
        expect(exported).toEqual(EXPECTED_EXPORTS); // exact list, count matters
      });
      ```

      That guard is the anti-list-sampling mechanism: adding an export without a
      test fails the suite instead of relying on diligence.

      Cases that matter most, because they encode behaviour nobody can see today:
      - `resizeBoxFromCenter` with `keepRatio` true and false, from each of the
        8 handles — **8 handles is the full set; assert against
        `getResizeHandleDirections`' own list, not a hardcoded 8.**
      - `snapGroupToGuides`: snaps to a centre guide when within threshold,
        does not snap when outside it, and returns the input unchanged when
        there are no other boxes.
      - `getRotationFromPointer` with `shiftKey` (angle snapping) and without.
      - `rectsIntersect`: touching edges, containment, disjoint.
      - `cycleCase`: the full cycle returns to the original after N steps.
      - `getSelectedSlide`: **a presentation whose `sections` is undefined
        returns `null` rather than throwing** — fails under Canvas's copy.

      *Verify:* `npx vitest run src/utils/__tests__/canvas* src/utils/__tests__/selectedSlide.test.ts` — must FAIL (modules absent). Paste the output.

- [ ] **2. Move the functions verbatim** and delete them from `Canvas.jsx` /
      `Toolbar.jsx`, adding imports. Do not reformat, rename parameters, or
      "improve" anything in transit.
      *Verify:* todo-1 command passes; `git diff` on `Canvas.jsx` shows only
      deletions plus an import line.

- [ ] **3. Gate.** `npm run gate` && `npm run format:check`. ESLint `no-undef`
      is the net for these untyped `.jsx` files — a missed reference shows up
      there, which is exactly how two real ReferenceErrors were caught here
      before.

- [ ] **4. Raise coverage thresholds** to just below the new measured floor.

- [ ] **5. Push; CI is the verdict.** The 52 screenshot baselines must not move
      — moving a pure function cannot change a pixel, so any movement is a
      finding, not a recapture. **Do not run Playwright locally while Ethan is
      at the machine** (standing rule 7).

- [ ] **6. Slice 2**: repeat 1–5 for `toolbarValues.ts`.

- [ ] **7. Record** in `tasks/fable-pass-plan.md` and `tasks/fable-notes.md`,
      including the `getSelectedSlide` divergence and which behaviour won.

---

## Pitfall notes

1. **`Canvas.jsx` is 0 % covered and not type-checked** (`checkJs: false`), so
   the only mechanical net during the move is ESLint `no-undef` plus the E2E
   suite. Move one file's worth at a time and gate between.
2. **jsdom returns zeros from `getBoundingClientRect()`.** None of these tests
   may render anything — that is the entire point of extracting them. Assert on
   computed numbers, never on layout.
3. **`snapGroupToGuides` and `resizeBoxFromCenter` take native dimensions**
   (`nativeW`, `nativeH`), not measured pixels. Pass literals; do not reach for
   a component.
4. **Do not extract `getSelectedSlide` into `presentationCommands.js`** — that
   module imports the stores and would drag them into Canvas's import graph.
   Its own tiny module keeps the dependency direction clean.
5. **Some helpers return React elements** (`renderTextBody`, `GuideLine`).
   `renderTextBody` returns a style object or markup string — check before
   moving it into a `.ts` file; if it returns JSX it belongs in a `.tsx` module
   or stays put. **Verify before assuming.**
6. **Commitlint** rejects non-conventional types and sentence-case subjects.
7. **Never `git add -A`.** Add explicit paths.

## Required findings report

1. Gate results and CI E2E result.
2. Todo-1 failure output, proving tests came first.
3. The `getSelectedSlide` behaviour change, stated explicitly.
4. Any function that could NOT be moved verbatim, and why.
5. Any file touched outside the blast radius.
6. The before/after coverage numbers for `Canvas.jsx` and `Toolbar.jsx`
   specifically, not just the global figure.

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim, plus an explicit "these tests describe current behaviour; a failure means the extraction is wrong" rule and the one sanctioned exception named |
| List sampling designed against | The 18 functions are listed in three counted tables; each test file carries an exported-symbol guard asserting the **exact** export list |
| Quantifier erosion designed against | The resize cases iterate `getResizeHandleDirections`' own handle list rather than a hardcoded 8; the export guard compares whole sorted arrays |
| Sanctioned escape hatch | "If a function cannot be moved verbatim, STOP and report" — reported in findings item 4, rather than an allowlist, because a partial move has no valid state |
| Bounded blast radius | Two per-slice tables plus an explicit do-not-touch list naming every component that must not move |
| File-specific pitfall notes | 7 notes: `checkJs: false`, jsdom zeros, native dimensions, import direction, the JSX-return check, commitlint, add-paths |
| Exact paths, no improvisation | Every file and every source line number named |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | Todo 5: moving a pure function cannot change a pixel; any baseline movement is a finding, never a recapture; no local Playwright while Ethan is present |
| Preconditions for conditional UI | `N/A — nothing rendered; every function is called directly` |
| Structural floor under snapshots | `N/A — no test snapshots` |
| IPC contract pinning | `N/A — no channel is touched` |
| Manual verification steps | `N/A — no user-visible change. CI's 52 captures and the E2E suite are the check` |
| Required findings report | 6-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 strictly precedes todo 2; failure output required |
| 2 | Behavior-change test edits | One only — `getSelectedSlide`'s null-safety, named in the plan and in findings item 3, with a test that fails under Canvas's copy |
| 3 | No weakened assertions | Clause verbatim; exact export-list comparisons; handle set derived from production code |
| 4 | Coverage floor | ≥ 1 case per extracted function (18 minimum), enforced by the export guard rather than by counting |
| 5 | Lint floor | No `.only` / `.skip` / assertion-free tests / conditional `expect`; `eslint . --max-warnings 0` |
| 6 | Snapshot discipline | `N/A — no test snapshots.` Screenshot baselines covered by todo 5 |
| 7 | Completion gate | Todo 3 (and again in todo 6 for slice 2) |
| 8 | Vitest / jsdom mechanics | Pure-util skeleton A; **nothing renders**, so no jsdom environment, no store reset and no IPC mock are needed — which is the point of the extraction |
| 9 | Test placement | `src/utils/__tests__/` per the placement table |
| 10 | Characterization before refactor | This plan **is** the characterization step the charter's F gate requires. No component is restructured; the tests it lands are the precondition for the decomposition plans that follow |
