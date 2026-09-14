# Executable Plan ED36 — one slide renderer

**Audit item:** ED-36 · P1 · [F] — "One slide renderer. Canvas, `ScaledSlideText`
(thumb/Home/presenter/output) and `SlideTextEditor` each implement
shadow/outline/padding/scaling and already disagree." Also closes the audit's
UX §1 follow-through (`SlideAspectBox`), the render half of FS-38, LIVE-E3, and
CLAUDE.md's "improve background rendering fidelity in filmstrip/home previews".

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`a18458f`. Three slices, three PRs, in the audit's order: previews → output →
canvas. Each slice lands green on its own; the fidelity E2E (Todo 4) is the
proof and tightens as each slice lands.

---

## Measured (read on 2026-09-14, `main` @ `a18458f`)

Six places draw a slide. Four of them go through `ScaledSlideText`.

| Site                               | Component                                                                      | Scale method                                                                                                                     | Text-shadow                                                                                                                                                                                   | User "Shadow" setting drawn as                                       | Padding floor (screen px) | Media overlay                         |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| Editor canvas                      | `Canvas.jsx:1128-1141` stage, `renderTextBox` `:940-1000`                      | native 1920×1080 stage, **one** `transform: scale(s)`                                                                            | always `0 2px 16px rgba(0,0,0,0.5)` (`:987`)                                                                                                                                                  | **box-shadow** `renderShadow(box)` (`:991`, `canvasTextStyle.ts:57`) | none — native padding     | `rgba(0,0,0,0.18)` (`:1148`)          |
| Projector                          | `OutputRenderer.jsx:297-303` → `ScaledSlideText`                               | every px value × scale; `scaleInlineHtml` regex-rewrites `font-size`/`line-height` inside the HTML (`ScaledSlideText.jsx:77-95`) | `0 2px 16px rgba(0,0,0,0.9)` **unless** the user's shadow is on — then **the user's shadow replaces it as a text-shadow** (`renderShadow(box, scale, fallback)` `:28-35`); no box-shadow ever | text-shadow                                                          | 4 / 4                     | `rgba(0,0,0,0.22)` (`:290`)           |
| Filmstrip thumbnail                | `FilmstripSlide.jsx:149` → `SlidePreviewSurface` → `ScaledSlideText`           | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                          | 4 / 4                     | `0.18` (`SlidePreviewSurface.jsx:42`) |
| Filmstrip floating/section preview | `Filmstrip.jsx:290` → `ScaledSlideText`                                        | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                          | 6 / 6                     | none (no background layer at all)     |
| Presenter live preview             | `PresenterPanel.jsx:410` → `SlidePreviewSurface`                               | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                          | 8 / 8                     | `0.18`                                |
| Presenter grid                     | `PresenterPanel.jsx:576` → `SlidePreviewSurface`                               | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                          | 7 / 5                     | `0.18`                                |
| Home recent card                   | `Home.jsx:1107` → `ScaledSlideText` (body cut to 4 lines, legacy `slide.body`) | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                          | 8 / 8                     | none                                  |

Other measured facts the design depends on:

- **Outline floor:** canvas `Math.max(1, width)` at native px; `ScaledSlideText`
  `Math.max(1, width * scale)` — a 1px-native outline is 1 screen px in a
  thumbnail (10× too thick relative to the slide).
- **Shadow blur floor:** canvas 2px native; `ScaledSlideText` `Math.max(4, blur*scale)`.
- **Corner radius:** canvas `box.cornerRadius ?? 14`; `ScaledSlideText` `(box.cornerRadius || 0) * scale`. After `normalizeTextBox` both read the stored value, so no visible difference today; unify anyway.
- **`empty` prop is dead.** `renderBody` passes it as the fallback of
  `resolvePlaceholderText(box.placeholderText, empty)`, but `normalizeTextBox`
  (`textBoxes.js:149`) already stores a resolved placeholder on every box, so the
  fallback never fires. Thumbnails say "Double-click to edit", never "Click to
  edit". Finding, not a fix (Decision 7).
- **`ScaledSlideText` before its first measurement** renders at scale 1
  (`getPresentationScale` returns 1 for a 0×0 container) — a 1920px-wide box
  inside an `overflow-hidden` frame for one frame.
- **Unit-test seams:** `vitest.setup.mjs` has no `ResizeObserver`;
  `OutputRenderer.safety.test.tsx:118-134` stubs one and asserts the **stage
  root** (`container.firstElementChild`) is observed exactly once per showing —
  it explicitly tolerates the text layer observing its own frame. `Home.test.tsx`
  keeps fixtures on the no-slide branch to avoid the renderer.
- **Existing tests touching this code:** `ScaledSlideText.test.tsx` (2 cases:
  `dir="auto"` on `data-testid="scaled-slide-text-box"`),
  `canvasTextStyle.test.ts` (exact strings of `renderOutline`/`renderShadow`/…),
  `OutputRenderer.test.tsx`, `OutputRenderer.safety.test.tsx`,
  `inlineStyleBudget.test.ts` (per-file `style={` counts: `ScaledSlideText.jsx`
  3, `SlidePreviewSurface.jsx` 2, `Canvas.jsx` 19, `OutputRenderer.jsx` 13,
  `Filmstrip.jsx` 17, `PresenterPanel.jsx` 23, `Home.jsx` 9).
- **Screenshot baselines that show slides:** `editor.png`, `editor-textbox-selected.png`,
  `editor-song-order-tray.png`, `editor-missing-background.png`, `editor-presenting.png`,
  `editor-song-library.png`, `editor-media-library.png`, `editor-media-library-items.png`,
  `editor-media-library-folder.png`, `output.png`, `home.png`, `home-recent.png`,
  `home-open.png`, `home-new.png`, `stage-display.png` (stage display does not
  draw slides — must not change), plus the hover clips. The seeded profile has no
  media files, so no baseline shows the media overlay.
- **Seeded content for E2E:** `electron/main/firstRunSeed.ts:79` — "Sunday
  Morning Service", first slide body is four `\n`-separated lines of Amazing
  Grace. It is a song slide: `autoFit: 'shrink'` by default
  (`getDefaultAutoFitMode`), which nothing renders today (finding).

## Decisions

1. **One layout, one transform.** `SlideRender` lays the slide out at the
   presentation's native size (`getPresentationDimensions`) inside a measured
   frame and scales the whole stage with a single `transform: scale(s)`,
   `transform-origin: top left`, centred by a computed offset. This is what the
   canvas already does; the previews and the projector come to it. All px-by-px
   scaling code (`scaleInlineHtml`, `renderOutline(box, scale)`,
   `renderShadow(box, scale, fallback)`, the padding floors) is deleted, not
   kept behind a flag.
2. **The projector is the truth; the editor comes to it.** Where the sites
   disagree, the values the congregation has been seeing win:
   `LEGIBILITY_TEXT_SHADOW = '0 2px 16px rgba(0,0,0,0.9)'` on every text box in
   every mode, and `MEDIA_OVERLAY = 'rgba(0,0,0,0.22)'` over any media
   background. Both are exported constants in one module.
3. **The user's Shadow setting is a box shadow, not a text shadow.** It lives
   in `DEFAULT_TEXT_BOX` beside fill, outline and corner radius — PowerPoint's
   _shape_ effects — and the canvas has always drawn it that way. The projector's
   conversion of it into a text shadow (which also silently removed the
   legibility shadow) was a bug in `ScaledSlideText`. `canvasTextStyle.renderShadow`
   (F1-pinned) stays the single box-shadow source.
4. **One pure style module.** `src/utils/slideRenderStyle.ts` exports
   `textBoxFrameStyle(box)` (position/size/rotation/opacity) and
   `textBoxContentStyle(box, { placeholder })` (padding, font, colour,
   decoration, shadows, fill, outline, radius, writing mode, vertical alignment)
   returning plain style objects in **native px**. Canvas's `renderTextBox`
   spreads these and adds only its interaction overrides (Slice 3). `renderTextBody`
   (highlight span) moves here as `TextBoxBody` in `SlideRender.jsx` and Canvas
   imports it.
5. **Media resolution stays where it is.** `SlideRender` resolves the media slide
   item and effective background from `(presentation, slide, sectionId, mediaLibrary)`
   exactly as `SlidePreviewSurface` does today. The projector keeps `OutputBackground`
   (continuous playback) by passing `renderBackground`; the overlay and the text
   stage are `SlideRender`'s. Slice 2 measures OutputRenderer's own resolution
   before wiring it (Todo 8).
6. **Nothing renders until measured.** The stage is `visibility: hidden` until
   the frame's first `ResizeObserver` callback, so there is no one-frame 1920px
   flash. The frame carries `data-slide-render` and `data-slide-scale="<s>"`; the
   stage `data-slide-stage`; each box `data-textbox-view` — these are the E2E
   seams and are not to be renamed.
7. **Not in this plan, recorded as findings:** the dead `empty` prop (dropped
   without replacement — the placeholder text is the box's own); Home's
   four-line truncation of legacy `slide.body` (kept as is); `autoFit: 'shrink'`
   is stored but never rendered; thumbnails still autoplay `<video>` (FS-31).
   `StageDisplayRenderer` does not draw slides and is out of scope. No change to
   `SlideTextEditor` except that its container now gets its styles from
   `textBoxContentStyle` (Slice 3), so the editor's font/colour/padding cannot
   drift from the rendered box.
8. **Deliberate visual change, recaptured on CI.** Every slice recaptures its
   baselines with `gh workflow run e2e.yml --ref <branch> -f update_baselines=true`
   and commits **only** the files `cmp` reports changed, after the triage in
   `testing-standards.mdc` §"Snapshot failure triage". Expected movers per slice
   are listed in the todos; any other mover is an unintended side effect and
   stops the slice.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Every comparison in this plan is **exact** (strings equal, counts equal) unless
a tolerance is written next to it; where a tolerance is written it is `≤ 1 px`
on native-space geometry and nothing else. Order matters wherever an array is
compared. Counts are asserted with the collected list's `length`, never by
spot-checking the first element.

## Blast radius

**May change (all slices):** `presenter-pro/src/utils/slideRenderStyle.ts` (new),
`src/utils/__tests__/slideRenderStyle.test.ts` (new),
`src/components/shared/SlideRender.jsx` (new),
`src/components/shared/__tests__/SlideRender.test.tsx` (new),
`e2e/renderFidelity.spec.ts` (new), `src/__tests__/inlineStyleBudget.test.ts`
(rows only), `tasks/plan-ED36-slide-render.md`, the ED36 charter row, the notes
entries, and per slice:

- **Slice 1 (previews):** `src/components/shared/ScaledSlideText.jsx` (deleted),
  `src/components/shared/SlidePreviewSurface.jsx` (deleted),
  `src/components/shared/__tests__/ScaledSlideText.test.tsx` (moved into
  `SlideRender.test.tsx`), `FilmstripSlide.jsx:149-158`, `Filmstrip.jsx:8,290-297`,
  `PresenterPanel.jsx:11,410-419,576-584`, `Home.jsx:21,1107-1114`,
  `OutputRenderer.jsx:17,297-303` **import only** — the projector keeps
  `ScaledSlideText`'s behaviour until Slice 2, so Slice 1 renames nothing it
  uses: the old text layer is kept as `src/components/presenter/OutputSlideText.jsx`
  (a verbatim move of `ScaledSlideText.jsx`, deleted in Slice 2).
- **Slice 2 (projector):** `OutputRenderer.jsx` (the stage block `:262-305`),
  `OutputSlideText.jsx` (deleted), `OutputRenderer.test.tsx`/`.safety.test.tsx`
  only where Todo 8 says.
- **Slice 3 (canvas):** `Canvas.jsx` (`renderTextBox` `:934-1000`, `renderTextBody`
  `:83-95`, the overlay `:1148`), `SlideTextEditor.jsx:203-247` (style block
  only), `canvasTextStyle.ts` (nothing removed; `resolveVerticalAlignment` is
  reused).

**May not change:** `canvasTextStyle.ts` exported strings and their tests
(F1 characterization — they DESCRIBE the box-shadow/outline the congregation
sees); `textBoxes.js`; `backgrounds.js`; `presentationSizing.js`;
`slideMarkup.js`; `StageDisplayRenderer.jsx`; any store; any IPC channel; any
E2E spec other than the new one and the baseline files it drives; `playwright.config.ts`.
A test in the may-not-change set that goes red is a suspected regression to
record, not to edit.

## Todos

### Slice 1 — previews (thumbnail, floating preview, presenter live + grid, Home)

- [ ] 1. **Characterize the style module before it exists (red).**
      `src/utils/__tests__/slideRenderStyle.test.ts`: for a box built with
      `createTextBox({ x: 100, y: 50, width: 800, height: 300, rotation: 5, opacity: 0.5, cornerRadius: 9, outlineWidth: 3, outlineColor: '#ff0000', shadowEnabled: true, shadowOffsetY: 4, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.5)', paddingTop: 0, paddingLeft: 7, textStyle: { size: 120, bold: true, italic: true, underline: true, align: 'left', valign: 'bottom', lineHeight: 1.2, color: '#00ff00', fontFamily: 'Georgia' } })`
      assert `textBoxFrameStyle` and `textBoxContentStyle` **as whole objects with
      `toEqual`** (exact keys, exact values, native px numbers): frame `{ position:'absolute', left:100, top:50, width:800, height:300, transform:'rotate(5deg)', transformOrigin:'center center', opacity:0.5 }`; content includes `paddingTop:0, paddingRight:28, paddingBottom:22, paddingLeft:7, fontSize:120, fontWeight:700, fontStyle:'italic', textDecoration:'underline', textAlign:'left', justifyContent:'flex-end', lineHeight:1.2, color:'#00ff00', fontFamily:'Georgia', textShadow: LEGIBILITY_TEXT_SHADOW, boxShadow:'0px 4px 6px rgba(0,0,0,0.5)', border:'3px solid #ff0000', borderRadius:9, background:'transparent', overflow:'hidden', writingMode:'horizontal-tb', wordBreak:'break-word', whiteSpace:'normal', display:'flex', flexDirection:'column' }`.
      Six more cases, this list is exhaustive: (a) default box → `transform:'none'`,
      `boxShadow:'none'`, `border:'none'`, `borderRadius:14`, all four default
      paddings; (b) `{ placeholder: true }` → `color: PLACEHOLDER_TEXT_COLOR`,
      `fontStyle:'italic'` even when the style is not italic; (c) `wrapText:false` →
      `whiteSpace:'nowrap'`, `wordBreak:'normal'`; (d) `textDirection:'vertical'` →
      `writingMode:'vertical-rl'`; (e) `valign:'top'` → `flex-start`, missing →
      `center`; (f) the two constants equal the projector's literal strings above.
      Red: `npx vitest run src/utils/__tests__/slideRenderStyle.test.ts` fails on
      "Cannot find module" — that is **not** the red; write the module as an empty
      export first so the red is `toEqual` on its assertion.
- [ ] 2. Write `src/utils/slideRenderStyle.ts` (Decision 4) reusing
      `resolveTextBoxPadding`, `resolveVerticalAlignment`, `renderOutline`,
      `renderShadow`, `renderTextDecoration` from `canvasTextStyle.ts`. Green on
      Todo 1.
- [ ] 3. **`SlideRender` unit tests (red first).**
      `src/components/shared/__tests__/SlideRender.test.tsx` (`@vitest-environment jsdom`;
      stub `globalThis.ResizeObserver` in `beforeEach` with a class that records the
      observed element and exposes `fire({ width, height })`; restore in `afterEach`).
      This table is exhaustive — all 7:
  1. before `fire`, the stage has `visibility: hidden`; after `fire({1920/4, 1080/4})`
     the frame has `data-slide-scale="0.25"` and the stage `transform: scale(0.25)`,
     `width: 1920px`, `height: 1080px` (exact strings).
  2. a 4:3 presentation with frame `fire({400, 300})` → scale `0.2777…` computed
     via `getPresentationScale`, stage `1440×1080`, and the centring offset is
     `left: 0` / `top: 0`; frame `fire({600, 300})` → offset `left: 100px`.
  3. every text box of a two-box slide renders with `data-textbox-view` in
     `zIndex` order (assert the collected array of `data-text-box-id`, length 2,
     order exact) and each has `dir="auto"` (moved from `ScaledSlideText.test.tsx`,
     including the Hebrew case — those two tests must fail on `ScaledSlideText`
     being gone and pass on `SlideRender`, stated in the commit message).
  4. a media slide renders no `data-textbox-view` and the missing-media label
     when its item is absent from `mediaLibrary`.
  5. a background resolved through `getEffectiveBackgroundId` renders the media
     element **and** an overlay with `background: MEDIA_OVERLAY`; a media slide
     renders no overlay.
  6. `placeholder={false}` renders an empty box (no text) for a body-less box;
     the default renders the box's own placeholder text in italics.
  7. `renderBackground` is called with the resolved media and its element is
     rendered in place of the default one.
- [ ] 4. Write `src/components/shared/SlideRender.jsx` (Decisions 1, 5, 6) and
      `TextBoxBody`. Green on Todo 3. `npx vitest run src/components/shared`.
- [ ] 5. **Fidelity E2E (red on CI).** `e2e/renderFidelity.spec.ts`: launch,
      dismiss tutorial, open "Sunday Morning Service" (keyboard: focus row, Enter,
      wait for `[data-slide-editing]`), then `const opened = app.waitForEvent('window'); await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false })); const output = await opened;` (listener first — plan E2E1), go live on the first slide via `page.keyboard.press('F5')` is **not** used (it opens a second output); instead call `window.electronAPI.setLiveSlide`-equivalent as `presenterPreview.spec.ts` does — read that spec and reuse its helper verbatim. Then in **both** windows collect, for the first slide's thumbnail (`[data-slide-render]` inside the first `[data-textbox-root]`-free filmstrip item — use the first `.mx-2` filmstrip slide's `[data-slide-render]`) and the projector's `[data-slide-render]`:
      `{ scale, boxes: [{ id, nativeRect: rect/scale rounded to 0.1, padding, textShadow, boxShadow, fontSize, lineHeight, lines }] }` where `lines` is the number of distinct `Math.round(top)` values over `document.createRange().selectNodeContents(content).getClientRects()`.
      Assert, in this order: both `boxes.length === 1` (exact); precondition
      `lines >= 2` on the projector (Amazing Grace has 4 lines — an empty artifact
      means the harness failed); then `expect(thumb.boxes).toEqual(output.boxes)`
      for the string fields and `lines`, and `|Δ| ≤ 1` per rect field.
      This fails on `main`: the thumbnail's `padding` is `4px 4px 4px 4px` (floors)
      and its `textShadow` is `none`, the projector's are `22px 28px 22px 28px` and
      `rgba(0, 0, 0, 0.9) 0px 2px 16px`. **In Slice 1 this test is red on the
      projector side by design** (the projector still uses the old layer), so Slice 1
      commits it with the projector half replaced by a second thumbnail — the
      presenter grid's first `[data-slide-render]` — and Slice 2 switches it to the
      projector. Slice 3 adds the canvas's `[data-textbox-root]` as a third member
      with the same fields.
- [ ] 6. Wire the five preview sites, delete `ScaledSlideText.jsx` and
      `SlidePreviewSurface.jsx`, move the projector's copy to `OutputSlideText.jsx`
      (verbatim, import path only), update `inlineStyleBudget.test.ts` rows (remove
      the two deleted files, add `components/shared/SlideRender.jsx` at its exact
      count — the ratchet fails over and under). `npm run gate`, `npm run format:check`.
- [ ] 7. Baselines: dispatch `update_baselines`, download, `cmp`, triage. Expected
      movers (this list is exhaustive for Slice 1): `editor.png`, `editor-textbox-selected.png`,
      `editor-song-order-tray.png`, `editor-missing-background.png`,
      `editor-presenting.png`, `editor-song-library.png`, `editor-media-library.png`,
      `editor-media-library-items.png`, `editor-media-library-folder.png`, `home.png`,
      `home-recent.png`, `home-open.png`, plus hover clips that include a thumbnail
      — thumbnails gain the legibility text-shadow and lose the padding floor.
      `output.png` and `stage-display.png` must **not** move in Slice 1. Commit only
      changed files; name each in the commit message. PR with findings; records.

### Slice 2 — projector

- [ ] 8. **Measure** `OutputRenderer.jsx:1-180`: how `background` and
      `mediaSlideItem` are resolved (its own library copy — FS-36), whether the
      live payload carries `sectionId`/`effectiveBackgroundId`, and what
      `OutputBackground` does for continuity. Write the answers into this plan under
      "Slice 2 measured" before coding. If the payload has no `sectionId`, pass
      `backgroundMedia`/`mediaSlideItem` already resolved instead of `mediaLibrary`
      (add both optional props to `SlideRender`; a unit case for each; Todo 3's count
      becomes 9).
- [ ] 9. Replace the stage's background/overlay/`OutputSlideText` block with
      `<SlideRender … renderBackground={(media) => <OutputBackground media={media} />} placeholder={false}>`;
      delete `OutputSlideText.jsx`. `OutputRenderer.safety.test.tsx` "resize observer
      watches the stage root" must pass **unchanged** (the stage root is still
      observed by `OutputRenderer`'s own observer; `SlideRender` observes its frame).
      `OutputRenderer.test.tsx` media/background cases must pass unchanged.
- [ ] 10. Switch `renderFidelity.spec.ts`'s second member to the projector
      (Todo 5). Baselines: expected movers `output.png` and `editor-presenting.png`
      only (the projector's shadow model changes for boxes with the user's shadow on
      — none in the seed — and its overlay for media — none in the seed; so the
      expectation is **zero pixel change** on `output.png`; if it moves, triage
      before accepting). Gate, PR, records.

### Slice 3 — canvas

- [ ] 11. Characterization (red-then-green is N/A: pin first). A test in
      `src/components/editor/__tests__/Canvas.render.test.tsx` that mounts Canvas
      with a two-box slide (store reset in `beforeEach`, `ResizeObserver` stubbed,
      `src/utils/ipc` mocked) and asserts each `[data-textbox-root]` child's style
      contains the exact `padding*`, `fontSize`, `textShadow`, `boxShadow`, `border`,
      `borderRadius` values `textBoxContentStyle` yields — written **before** Todo 12
      against the current strings, expecting `textShadow: '0 2px 16px rgba(0,0,0,0.5)'`,
      then updated in Todo 12 to `LEGIBILITY_TEXT_SHADOW` with the change named in
      the commit (this is the one behaviour-change edit; it must fail on old code).
- [ ] 12. `renderTextBox` spreads `textBoxFrameStyle`/`textBoxContentStyle` and
      keeps only `cursor`, `userSelect`, `zIndex`, `overflow: 'visible'` on the frame
      and the interaction handlers; `renderTextBody` → `TextBoxBody`; overlay →
      `MEDIA_OVERLAY`; `SlideTextEditor`'s style block reads the same content style
      for font/colour/line-height/family/decoration/align/whiteSpace/wordBreak/writingMode
      (keeps `caretColor`, `userSelect`, `cursor`, `minHeight`). `inlineStyleBudget`
      rows for `Canvas.jsx` and `SlideTextEditor.jsx` updated to exact counts.
- [ ] 13. Fidelity E2E gains the canvas as third member (Todo 5). Baselines:
      expected movers all `editor-*.png` and `editor.png` (canvas text-shadow 0.5 →
      0.9). Gate, PR, records, `## Review` appended to this plan.

### Every slice

- [ ] 14. Findings report in the PR body: suspected regressions, every
      baseline refreshed (by name, with the triage verdict), behaviour-change test
      edits, anything the plan did not anticipate. Manual check owed (listed, not
      run — rule 8 in the handoff): with a media background set, compare the
      thumbnail, presenter preview and projector for one slide; with the user's
      Shadow switched on, confirm the projector shows a box shadow, not a text
      shadow.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against          | Clause verbatim; exactness/order/count stated under Decisions; Todo 1 uses whole-object `toEqual`; Todo 5 names the one tolerance and its unit                                                                                    |
| List sampling designed against                | Todo 1 "six more cases, exhaustive"; Todo 3 "all 7"; Todo 5 asserts `boxes.length`; Todo 7 exhaustive mover list                                                                                                                  |
| Quantifier erosion designed against           | Todo 3.3 collects every `data-textbox-view` and asserts the array; Todo 5 iterates every box of both windows and asserts `boxes.length === 1` before comparing                                                                    |
| Sanctioned escape hatch                       | None needed: no allowlist; a baseline that moves outside the expected list stops the slice (Decision 8)                                                                                                                           |
| Bounded blast radius                          | Blast radius section, per slice, with a may-not-change list                                                                                                                                                                       |
| File-specific pitfall notes                   | Measured: no `ResizeObserver` in jsdom (stub per test); `OutputRenderer.safety` asserts the stage root is observed exactly once; `normalizeTextBox` pre-resolves placeholders (`empty` is dead); scale-1 flash before measurement |
| Exact paths                                   | Blast radius; no new test directories                                                                                                                                                                                             |
| Per-todo verification                         | Each todo names its vitest command; gate at Todos 6, 10, 13                                                                                                                                                                       |
| Snapshot policy inline                        | Decision 8 and Todos 7/10/13: CI recapture, `cmp`, triage, commit only movers, name them in the commit                                                                                                                            |
| Preconditions for conditional UI              | Todo 5: presentation open, output window open, slide live; precondition `lines >= 2` asserted                                                                                                                                     |
| Structural floor under snapshots              | Todo 5 pairs geometry/style equality with the `lines >= 2` floor; baselines are paired with the existing specs' structural asserts (unchanged)                                                                                    |
| IPC contract pinning                          | N/A — no channel touched; the projector's payload is read, not changed (Todo 8 records its shape)                                                                                                                                 |
| Manual verification steps                     | Todo 14 (owed, not run — no local app launches while Ethan is at the machine)                                                                                                                                                     |
| Required findings report                      | Todo 14                                                                                                                                                                                                                           |
| Data rewrites state their backup and rollback | N/A — no row or snapshot is rewritten                                                                                                                                                                                             |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                                                      |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todos 1→2, 3→4, 5 (red on CI) →6, 11→12                                                                                                                                          |
| 2   | Behavior-change test edits       | Todo 3.3 (moved `dir="auto"` tests), Todo 11→12 (canvas text-shadow), each named in its commit and the findings report                                                           |
| 3   | No weakened assertions           | Clause verbatim; whole-object `toEqual`; one named tolerance                                                                                                                     |
| 4   | Coverage floor                   | Todo 1 (every branch of both style functions), Todo 3 (every prop of `SlideRender`)                                                                                              |
| 5   | Lint floor                       | No `.only`/`.skip`; jsdom stubs restored in `afterEach`; `eslint . --max-warnings 0` in the gate                                                                                 |
| 6   | Snapshot discipline              | Decision 8; Todos 7, 10, 13                                                                                                                                                      |
| 7   | Completion gate                  | Todos 6, 10, 13 report type-check, lint, passed/total                                                                                                                            |
| 8   | Vitest / jsdom mechanics         | `@vitest-environment jsdom`; `ResizeObserver` stubbed as a measurement seam, never asserted through jsdom layout; stores reset in `beforeEach` (Todo 11); `src/utils/ipc` mocked |
| 9   | Test placement                   | `src/utils/__tests__/`, `src/components/shared/__tests__/`, `src/components/editor/__tests__/`, `e2e/`                                                                           |
| 10  | Characterization before refactor | Todo 11 pins Canvas before Todo 12; `canvasTextStyle.test.ts` (F1) must pass unchanged in every slice                                                                            |
