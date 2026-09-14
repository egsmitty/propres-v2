# Executable Plan ED1 — four small, independent editor correctness fixes

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Part 3 — Editor
canvas, text, undo (ED). Items **ED-6** (P1), **ED-11** (P2), **ED-18** (P2),
**ED-30** (P3). Each is a small, self-contained `[S]` fix with no dependency on
the others; this plan does all four in one PR because each is a one- or
two-line production change with its own test, not because they share code.

Written per `.cursor/rules/writing-executable-plans.mdc`.

---

## Measured (2026-09-13, branch `fix/editor-small-correctness` @ `origin/main`)

### ED-6 — Clear Formatting joins selected lines

`src/utils/richTextEditor.js:353-370`, `clearEditorFormatting`:

```js
export function clearEditorFormatting(editor = getCurrentOrSavedSlideTextEditor()) {
  const range = getEditorRange(editor);
  if (!editor || !range || range.collapsed) return false;
  const selection = getSelectionObject();
  const text = selection?.toString() || range.cloneContents().textContent || '';
  const textNode = document.createTextNode(text);
  range.deleteContents();
  range.insertNode(textNode);
  ...
```

It flattens the whole selection into one `Text` node, so any `<br>` (this app's
line-break element — `slideMarkup.js:22` turns `\n` into `<br />`, never a
`<div>` per line) inside the selection is discarded and two lyric lines become
one. Verified empirically in Node/jsdom (no layout involved — this is a DOM
structure question, not a rendering one): given
`<b>Line one</b><br><b>Line two</b>` inside a `contenteditable`, both
`selection.toString()` **and** `range.cloneContents().textContent` return
`"Line oneLine two"` — jsdom's `Selection`/`Range` do no layout, so neither ever
had a `\n` to split on. **The audit's suggested "split text on `\n`" fix cannot
work in this codebase's own test environment**, because jsdom never inserts the
`\n` real browsers add at block boundaries — confirmed by running both against
jsdom before writing any test. The other option the audit names — "unwrap
formatting elements inside the range while keeping block/`<br>` nodes" — does
not depend on `\n` insertion at all, so that is the fix.

### ED-11 — dragging a box wider than the slide clamps to negative x

`src/components/editor/Canvas.jsx:392-393` and `:398-399`, inside the pointer-move
handler's `state.type === 'move'` branch (not the keydown effect):

```js
x: clamp(box.x + pointerX, 0, nativeW - box.width),
y: clamp(box.y + pointerY, 0, nativeH - box.height),
...
x: clamp(box.x + snapped.dx, 0, nativeW - box.width),
y: clamp(box.y + snapped.dy, 0, nativeH - box.height),
```

`clamp(value, min, max) = Math.min(max, Math.max(min, value))` (`canvasGeometry.ts:42`).
When `box.width > nativeW`, `max = nativeW - box.width` is negative while
`min = 0`, so `Math.min(negative, Math.max(0, value))` always returns the
negative `max` — the box jumps to a fixed negative `x` regardless of pointer
position, confirmed by the existing `clamp` characterization test
(`canvasGeometry.test.ts:96`, "lets max win when the bounds are inverted").
`y` has the identical pattern for height/`nativeH`. The four resize clamps
(`Canvas.jsx:443-461`) clamp **size**, not position (`clamp(box.width + pointerX, MIN_TEXT_BOX_WIDTH, nativeW - x)`)
— a different bug shape, not covered by this item, left untouched.

### ED-18 — `||` defaults make an explicit 0 impossible

Padding, `Canvas.jsx:962-965`:

```js
paddingTop: box.paddingTop || DEFAULT_TEXT_BOX.paddingTop,
paddingRight: box.paddingRight || DEFAULT_TEXT_BOX.paddingRight,
paddingBottom: box.paddingBottom || DEFAULT_TEXT_BOX.paddingBottom,
paddingLeft: box.paddingLeft || DEFAULT_TEXT_BOX.paddingLeft,
```

and `ScaledSlideText.jsx:123-126`:

```js
const paddingX = Math.max(minPaddingX, (box.paddingLeft || 28) * scale);
const paddingRight = Math.max(minPaddingX, (box.paddingRight || 28) * scale);
const paddingY = Math.max(minPaddingY, (box.paddingTop || 22) * scale);
const paddingBottom = Math.max(minPaddingY, (box.paddingBottom || 22) * scale);
```

Shadow, `src/utils/canvasTextStyle.ts:57` (F1 already extracted this one; it is
imported by `Canvas.jsx:53-54` and used at `Canvas.jsx:981` — that call site
needs no change, only the helper):

```js
return `${box.shadowOffsetX || 0}px ${box.shadowOffsetY || 10}px ${Math.max(2, box.shadowBlur || 18)}px ${box.shadowColor || 'rgba(0,0,0,0.35)'}`;
```

and `ScaledSlideText.jsx:22-27`, an **unexported, separate** local copy F1 never
touched (F1's slice 1 was `Canvas.jsx`/`Toolbar.jsx` only):

```js
function renderShadow(box, scale, fallbackShadow) {
  if (box.shadowEnabled) {
    return `${(box.shadowOffsetX || 0) * scale}px ${(box.shadowOffsetY || 10) * scale}px ${Math.max(4, (box.shadowBlur || 18) * scale)}px ${box.shadowColor || 'rgba(0,0,0,0.35)'}`;
  }
  return fallbackShadow;
}
```

`box.paddingTop` etc. reach these call sites through
`normalizeTextBox` → `mergeTextBox` (`textBoxes.js:83-85`,
`{ ...DEFAULT_TEXT_BOX, ...frame }`), which preserves an explicit `0` — so a
user-set `0` padding or shadow offset really does arrive as `0` and is then
silently replaced by the default. `shadowColor` stays `||`: it is a string, not
a magnitude, and an explicit falsy value (`''`) is not a meaningful "keep this"
the way `0` is for a number — `??` there would let an empty string through as
invalid CSS. `outlineWidth || 0` (`canvasTextStyle.ts:50`,
`ScaledSlideText.jsx:16`) is not touched: its own fallback is already `0`, so
`||` and `??` agree there is no bug to fix.

### ED-30 — no `dir="auto"` on slide text

`src/components/editor/SlideTextEditor.jsx:151-190` (the `contentEditable` div)
and `src/components/shared/ScaledSlideText.jsx:132-177` (the per-box absolutely
positioned `<div>` that holds each slide text box's rendered body) set no
`dir`. Right-to-left content (Hebrew/Arabic digits and punctuation) reorders
incorrectly without it.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

Applied here: every new test is exact, not "contains" — DOM child-node lists
are compared by tag/content in order (count and order matter: a line collapsing
into one node, or a third node appearing, is exactly the bug), and clamp/shadow/
padding numeric expectations are exact values, never a range or `toBeCloseTo`.
The `clearEditorFormatting` test does not use `selection.toString()` or a `\n`
anywhere — jsdom cannot produce block-boundary `\n`, so an assertion that
depended on it would be testing jsdom's absence of layout, not the fix.

## Decisions

1. **ED-6's fix walks the cloned range's DOM tree, not its stringified text.**
   Rejected: "split `selection.toString()` on `\n`" (the audit's first-listed
   option) — proven not to work under jsdom in this file's own test
   environment (see Measured above), and it would not survive a real browser's
   `<div>`-per-line paste either, since this app's own line encoding is `<br>`,
   not `<div>`. Chosen: unwrap every inline formatting element inside the
   selection (drop the tag, keep its children) while keeping `<br>` and
   block-level elements (`div`, `p`, `li`, `ol`, `ul`, `h1`–`h6`,
   `blockquote`) — stripped of their own attributes, so a pasted
   `<div style="color:red">` loses its color too. This is the audit's
   second-listed option and is the one that is actually true of this
   environment.
2. **`clampBoxPosition` is extracted, not inlined**, per the item's own
   instruction, into `canvasGeometry.ts` next to `clamp` (which it calls) —
   `characterization`-style, matching how F1 already organized this file.
3. **`resolveTextBoxPadding` is a new pure helper in `canvasTextStyle.ts`**,
   used by both `Canvas.jsx` (unscaled) and `ScaledSlideText.jsx` (scaled) —
   the item explicitly allows extracting one when only inline JSX exists, and
   both call sites resolve to the *same* per-axis value (`box.paddingX ?? DEFAULT_TEXT_BOX.paddingX`)
   before their own scale/floor math, so one helper serves both without forcing
   them into an unrelated shared shape.
4. **`ScaledSlideText.jsx`'s local `renderShadow` is fixed in place, not merged
   into `canvasTextStyle.ts`'s `renderShadow`.** The two have different
   signatures (`(box)` vs `(box, scale, fallbackShadow)`) and different minimum
   blur floors (`2` vs `4`) — both real, load-bearing differences, not
   accidental drift. Unifying them is a bigger change than this item asks for;
   noted as a possible future dedup, not done here.
5. **`renderOutline` is not touched anywhere.** Its own `|| 0` fallback already
   equals its default, so `||` and `??` behave identically — nothing to fix.

## Bounded blast radius

| File | Action |
|---|---|
| `presenter-pro/src/utils/richTextEditor.js` | modify — `clearEditorFormatting`, new local helper |
| `presenter-pro/src/utils/__tests__/richTextEditor.test.ts` | create |
| `presenter-pro/src/utils/canvasGeometry.ts` | modify — add `clampBoxPosition` |
| `presenter-pro/src/utils/__tests__/canvasGeometry.test.ts` | modify — add cases, update `EXPECTED_EXPORTS` |
| `presenter-pro/src/components/editor/Canvas.jsx` | modify — drag-move clamp calls (lines ~392-399), padding style (lines ~962-965). **Not** the keydown effect, not the resize clamps |
| `presenter-pro/src/utils/canvasTextStyle.ts` | modify — `renderShadow` `??`, add `resolveTextBoxPadding` |
| `presenter-pro/src/utils/__tests__/canvasTextStyle.test.ts` | modify — add cases, update `EXPECTED_EXPORTS` |
| `presenter-pro/src/components/shared/ScaledSlideText.jsx` | modify — local `renderShadow` `??`, use `resolveTextBoxPadding`, add `dir="auto"` |
| `presenter-pro/src/components/shared/__tests__/ScaledSlideText.test.tsx` | create |
| `presenter-pro/src/components/editor/SlideTextEditor.jsx` | modify — add `dir="auto"` to the `contentEditable` div |
| `presenter-pro/src/components/editor/__tests__/SlideTextEditor.test.tsx` | create |
| `tasks/plan-ED1-editor-small-fixes.md` | this file |
| `tasks/fable-pass-plan.md` | append one status-table row |
| `tasks/fable-notes.md` | append one dated entry at the end |

**Do NOT touch:** the keydown `useEffect` in `Canvas.jsx` (`function handleKeyDown(event)`);
`src/pages/Editor.jsx`; `src/components/presenter/**`; `src/utils/appCommands.js`;
`src/utils/presenterFlow.js`; `src/utils/presentationCommands.js`;
`src/components/layout/**`; `src/components/shared/Dialog.jsx`, `ContextMenu.jsx`,
`ShortcutsOverlay.jsx`; `electron/**`; any `e2e/` spec or screenshot baseline;
the resize-clamp lines in `Canvas.jsx` (443-461); `renderOutline` anywhere.

---

## Todos

- [x] **1. ED-6 red test first.** `src/utils/__tests__/richTextEditor.test.ts`
      (new file, `// @vitest-environment jsdom`). Build a `contentEditable` div
      attached to `document.body`, seed it, select all its contents with a real
      `Range`/`window.getSelection()`, call `clearEditorFormatting(editor)`
      directly (pass the editor explicitly — do not rely on
      `document.activeElement` or the module's saved-selection state). At least
      these cases:
      1. `<b>Line one</b><br><b>Line two</b>` → after the call, `editor.querySelectorAll('b')`
         has length 0 (formatting gone) **and** `editor.querySelectorAll('br')`
         has length 1 (line break survives) **and** `editor.textContent` is
         exactly `'Line oneLine two'` **and** the first and second lines'
         separate text is exactly `'Line one'` / `'Line two'` (read them off
         the `<br>`'s previous/next sibling, not by re-splitting the joined
         string).
      2. `<div><b>Line one</b></div><div><b>Line two</b></div>` (the other line
         shape the audit names) → 0 `<b>`, exactly 2 `<div>` children each
         holding one plain line, in order.
      3. A single-line formatted selection (`<b>only bold</b>`, no break) still
         has its bold removed and its text preserved exactly — the fix must not
         invent a break where there was none.
      4. The function returns `true` on a real selection and `false` when
         `range.collapsed` (no selection) — pin the existing early return.

      *Verify:* `npx vitest run src/utils/__tests__/richTextEditor.test.ts` —
      must FAIL (current code joins the lines: case 1 and 2's `<br>`/`<div>`
      count assertions fail). Paste the failing output in the PR body.

- [x] **2. ED-6 fix.** In `richTextEditor.js`, add a local (non-exported)
      recursive helper that walks a cloned range fragment and rebuilds it: text
      nodes copied as-is; `<br>` kept as `<br>`; block tags (`div`, `p`, `li`,
      `ol`, `ul`, `h1`-`h6`, `blockquote`) kept as a same-tag element with no
      attributes, recursing into their children; every other element (`b`,
      `i`, `span`, `font`, …) unwrapped — recurse into its children and append
      those directly, dropping the wrapper. Rewrite `clearEditorFormatting` to
      build this stripped fragment from `range.cloneContents()`, `deleteContents()`,
      `insertNode` the fragment, then re-select the inserted nodes (track them
      before insertion — a `DocumentFragment` empties itself once inserted, so
      `nextRange` must be built from a captured node list, not from the fragment
      after the fact).
      *Verify:* todo-1's command passes, all 4+ cases. Paste the green output.

- [x] **3. ED-11 red test first.** In `src/utils/__tests__/canvasGeometry.test.ts`,
      add `clampBoxPosition` to the `EXPECTED_EXPORTS` list (fails immediately —
      the module doesn't export it yet) and a `describe('clampBoxPosition')`
      block with the table the item names, exhaustively:
      - fits (`size < extent`): a normal in-range value passes through; a value
        below 0 clamps to 0; a value above `extent - size` clamps to that.
      - exact fit (`size === extent`): both bounds are 0; any input clamps to 0.
      - wider than the slide (`size > extent`): the allowed range is
        `[extent - size, 0]` (negative-to-zero, not "anything negative") — a
        value inside it passes through unchanged, a value below it clamps to
        `extent - size`, a value above 0 clamps to 0. This is the case that
        currently breaks (`clamp`'s inverted-bounds behavior always returns the
        negative bound).
      - taller than the slide: same shape, called with the height/`y` axis's
        numbers, to prove the function is axis-agnostic.
      *Verify:* `npx vitest run src/utils/__tests__/canvasGeometry.test.ts` —
      must FAIL only on the new `clampBoxPosition` cases (existing `clamp`
      cases still pass). Paste the failing output.

- [x] **4. ED-11 fix.** In `canvasGeometry.ts`, add
      `clampBoxPosition(value, size, extent)` returning
      `clamp(value, Math.min(0, extent - size), Math.max(0, extent - size))`.
      In `Canvas.jsx`'s pointer-move `move` branch (lines ~392-393 and
      ~398-399 only), replace the four `clamp(box.x/y + …, 0, nativeW/H - box.width/height)`
      calls with `clampBoxPosition(box.x/y + …, box.width/height, nativeW/H)`.
      Add `clampBoxPosition` to Canvas.jsx's existing `canvasGeometry` import.
      Do not touch the resize-branch clamps (443-461) or the keydown effect.
      *Verify:* todo-3's command passes. Paste the green output.
      `npx tsc --noEmit` (or `npm run type-check`) to confirm `canvasGeometry.ts`
      still type-checks.

- [x] **5. ED-18 red test first.** In `src/utils/__tests__/canvasTextStyle.test.ts`,
      add `resolveTextBoxPadding` to `EXPECTED_EXPORTS` (fails immediately) and:
      - `resolveTextBoxPadding` cases: an explicit `0` on each of the four
        padding fields is kept as `0` (not replaced by the fallback); `undefined`
        and `null` each fall back to the given default; a mix of some explicit,
        some missing, resolves each field independently.
      - extend the existing `renderShadow` describe block with: `shadowOffsetY: 0`
        (with `shadowEnabled: true`) renders `'0px'` for the offset, not the
        `10` fallback; same for `shadowOffsetX: 0` (already correct today —
        this case must stay green, proving no regression) and `shadowBlur: 0`
        (`Math.max(2, 0)` → the blur clamps to `2`, the floor, not the `18`
        fallback — assert `2`, the floor is not part of this bug).
      *Verify:* `npx vitest run src/utils/__tests__/canvasTextStyle.test.ts` —
      must FAIL only on the new/changed cases. Paste the failing output.

- [x] **6. ED-18 fix, part A (shared helpers).** In `canvasTextStyle.ts`:
      add `resolveTextBoxPadding(box, fallback)` returning
      `{ paddingTop: box.paddingTop ?? fallback.paddingTop, ... }` for all four
      sides. Change `renderShadow` to `box.shadowOffsetX ?? 0`,
      `box.shadowOffsetY ?? 10`, `Math.max(2, box.shadowBlur ?? 18)` — leave
      `shadowColor` on `||` (Decision 5's cousin: an explicit `''` is not a
      value worth keeping for a CSS color).
      *Verify:* todo-5's command passes. Paste the green output.

- [x] **7. ED-18 fix, part B (call sites).** In `Canvas.jsx`, replace the four
      `box.paddingX || DEFAULT_TEXT_BOX.paddingX` lines (~962-965) with
      `resolveTextBoxPadding(box, DEFAULT_TEXT_BOX)` and spread its four fields
      into the style object; import `resolveTextBoxPadding` from
      `@/utils/canvasTextStyle` alongside the existing import from that module.
      In `ScaledSlideText.jsx`, fix the local `renderShadow` the same way as
      todo 6 (its own `Math.max(4, …)` floor stays `4`, only the `??` swap
      changes), replace the four inline `box.paddingX || <hardcoded default>`
      lines with `resolveTextBoxPadding(box, DEFAULT_TEXT_BOX)` (import
      `DEFAULT_TEXT_BOX` from `@/utils/textBoxes` alongside the existing
      `DEFAULT_TEXT_STYLE` import, and `resolveTextBoxPadding` from
      `@/utils/canvasTextStyle`) before applying the existing
      `Math.max(minPaddingX/Y, value * scale)` floor per side.
      *Verify:* `npm run type-check` and `npm run lint` on the two files;
      todo-5's test command still green (no behavior change to the tested
      helpers from this call-site wiring).

- [x] **8. ED-30 red test first.** `src/components/shared/__tests__/ScaledSlideText.test.tsx`
      (new, `// @vitest-environment jsdom`, RTL). Stub `ResizeObserver` as a
      no-op class (measurement seam per `testing-standards.mdc` — the same
      pattern as `OutputRenderer.test.tsx`). Render `ScaledSlideText` with a
      minimal `presentation` and a `slide` whose body is a Hebrew string (e.g.
      `'שלום עולם'`). Assert the per-box text container carries
      `dir="auto"` — query it by a stable selector already on that element
      (or add `data-testid="scaled-slide-text-box"` to it as part of the fix,
      since none exists today) and assert `getAttribute('dir')` is `'auto'`.
      Also add a structural floor in the same test: the container actually
      renders the Hebrew text (`toHaveTextContent` or similar), so an empty
      render can't pass. `src/components/editor/__tests__/SlideTextEditor.test.tsx`
      (new, same jsdom setup): render `SlideTextEditor` with a minimal
      `textBox`, query the `contentEditable` element via its existing
      `[data-slide-text-editor="true"]` selector, assert `dir="auto"`.
      *Verify:* both new test files FAIL (attribute absent). Paste the failing
      output.

- [x] **9. ED-30 fix.** Add `dir="auto"` to the `contentEditable` div in
      `SlideTextEditor.jsx` (~line 151) and to the per-box container div in
      `ScaledSlideText.jsx` (~line 133), plus the `data-testid` added in todo 8
      if one was needed.
      *Verify:* todo-8's two commands pass. Paste the green output.

- [x] **10. Gate.** From `presenter-pro/`: `npm run gate && npm run format:check`.
      Report `type-check`, `lint`, and vitest `passed/total`, noting skipped
      counts (must be 0). If coverage thresholds fail, STOP — do not lower
      them — and report which axis and by how much.

- [x] **11. Screenshot-baseline check.** None of the four fixes changes any
      pixel a captured slide could show under existing content: ED-6 only
      changes what a *selection* becomes when the user explicitly clicks Clear
      Formatting (no baseline captures that interaction); ED-11 only changes
      behavior for a box wider than the slide (no existing baseline has one —
      confirm by grep before asserting this); ED-18 only changes rendering when
      a padding/shadow-offset field is stored as literal `0`, which no fixture
      slide used by `visual-editor.spec.ts` / `visual.spec.ts` sets (confirm by
      grep); ED-30 adds a `dir="auto"` attribute, which is inert for
      left-to-right text (the item's own guarantee) and every current baseline
      is left-to-right. State the grep commands run and their results in the
      findings report. Do not run Playwright locally (standing rule).

- [x] **12. Records.** Append one row to the status table at the end of
      `tasks/fable-pass-plan.md` and one `## ED1 — <title> (2026-09-13)` entry
      at the very end of `tasks/fable-notes.md`, preceded by a blank-line-padded
      `---`.

Manual verification: N/A for ED-6/11/18 (behavior only reachable via pointer
drag or the rich-text toolbar, both exercised by the new unit tests; no new
IPC, no new persisted field, nothing else in the render path changes). ED-30 is
user-visible only for RTL content, which requires content this app has no
Hebrew/Arabic fixture data for — if Ethan wants a manual check, it is: open a
song, type Hebrew text into a lyric box, confirm punctuation/numbers keep
reading order.

---

## Required findings report

1. Gate result line and coverage numbers (todo 10).
2. Red-then-green output for each of the four items (todos 1/2, 3/4, 5/6+7, 8/9).
3. The grep commands and results proving no screenshot baseline is affected
   (todo 11).
4. Anything discovered that contradicts this plan's Measured section (e.g. if
   a resize-clamp line turns out to share the drag bug, or if another file has
   its own `renderShadow`/padding copy not listed above).
5. Any file touched outside the blast radius.

---

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Anti-weakening clause verbatim above; exactness (order/count/content) stated per comparison in Todos 1, 3, 5, 8 |
| List sampling designed against | Every todo enumerates its exact case list (4, 4, 3+3, 2 files/cases) rather than a prose count; none says "etc." |
| Quantifier erosion designed against | N/A — no "every X in the codebase" sweep here; each item is a named, bounded call site, already enumerated in Measured/Blast radius |
| Sanctioned escape hatch | N/A — no allowlist needed; any blocker becomes a "suspected regression" note in the findings report (item 4), not a silent skip |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Measured section's jsdom-`\n` finding (ED-6); Decision 3 selector note (ED-18 call sites); `ResizeObserver` stub note (todo 8) |
| Exact paths | Blast radius table, full paths |
| Per-todo verification | Every todo names its exact vitest/tsc/lint command |
| Snapshot policy inline | N/A — no snapshots touched or added |
| Preconditions for conditional UI | N/A — no conditionally-rendered control is asserted; `ScaledSlideText`'s box always renders once `getSlideTextBoxes` returns a box, which a body string guarantees |
| Structural floor under every snapshot | N/A — no snapshots; the equivalent floor (todo 8's "actually renders the Hebrew text" assertion) is stated for the one test that could otherwise pass on an empty render |
| IPC contract pinning | N/A — no `ipcMain`/`ipcRenderer` channel touched |
| Manual verification steps | Stated under Todos, "Manual verification" — N/A for 3 of 4 items with reasons, one optional RTL click-path given for ED-30 |
| Required findings report | "Required findings report" section, 5 items |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todos 1→2 (ED-6), 3→4 (ED-11), 5→6/7 (ED-18), 8→9 (ED-30) — red before green, each verified by its own command |
| 2 | Behavior-change test edits | N/A — no existing test's assertions are changed, only new `describe` blocks and `EXPECTED_EXPORTS` entries added to `canvasGeometry.test.ts` / `canvasTextStyle.test.ts` |
| 3 | No weakened assertions | Anti-weakening clause verbatim; Todos 1/3/5/8 state exact expected values/counts/order, never `toContain` or a sorted compare |
| 4 | Coverage floor | Every new/changed function (`clearEditorFormatting`'s new helper, `clampBoxPosition`, `resolveTextBoxPadding`, both `renderShadow` copies, both `dir="auto"` additions) has at least one dedicated case |
| 5 | Lint floor | No `.only`/`.skip` in any new test; every case asserts; no `expect` inside `if`/`catch` (todo 1's return-value case uses direct `expect(fn()).toBe(...)`, not a try/catch) |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 10 |
| 8 | Vitest / jsdom mechanics | `// @vitest-environment jsdom` on all three new/DOM-touching test files; `ResizeObserver` stubbed (todo 8, same pattern as `OutputRenderer.test.tsx`); no Zustand store involved in any of the four items so none to reset; `@/utils/ipc` not touched; `better-sqlite3` not touched; no timers involved; the one measurement seam present (`ScaledSlideText`'s `ResizeObserver`) is stubbed, not asserted through |
| 9 | Test placement | `src/utils/__tests__/` for the three util test files; `src/components/shared/__tests__/` and `src/components/editor/__tests__/` for the two component test files — all match the table |
| 10 | Characterization before refactor | N/A — no file here is being decomposed/restructured; each change is a same-shape, few-line fix inside an already-extracted helper or an existing component |
