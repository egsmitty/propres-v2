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

Seven sites draw a slide. Six of them reach `ScaledSlideText` — three directly
(`OutputRenderer.jsx:299`, `Filmstrip.jsx:290`, `Home.jsx:1107`) and three via
`SlidePreviewSurface.jsx:80`.

| Site                               | Component                                                                                  | Scale method                                                                                                                     | Text-shadow                                                                                                                                                                                   | User "Shadow" setting drawn as                                          | Padding floor (screen px) | Media overlay                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| Editor canvas                      | `Canvas.jsx:1128-1141` stage, `renderTextBox` `:935-1000`                                  | native 1920×1080 stage, **one** `transform: scale(s)`                                                                            | always `0 2px 16px rgba(0,0,0,0.5)` (`:987`)                                                                                                                                                  | **box-shadow** `renderShadow(box)` (`:991`, `canvasTextStyle.ts:55-62`) | none — native padding     | `rgba(0,0,0,0.18)` (`:1146`)          |
| Projector                          | `OutputRenderer.jsx:299-305` → `ScaledSlideText`, with **`presentation={slide}`** (`:300`) | every px value × scale; `scaleInlineHtml` regex-rewrites `font-size`/`line-height` inside the HTML (`ScaledSlideText.jsx:77-95`) | `0 2px 16px rgba(0,0,0,0.9)` **unless** the user's shadow is on — then **the user's shadow replaces it as a text-shadow** (`renderShadow(box, scale, fallback)` `:28-35`); no box-shadow ever | text-shadow                                                             | 4 / 4                     | `rgba(0,0,0,0.22)` (`:290`)           |
| Filmstrip thumbnail                | `FilmstripSlide.jsx:149` → `SlidePreviewSurface` → `ScaledSlideText`                       | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                             | 4 / 4                     | `0.18` (`SlidePreviewSurface.jsx:42`) |
| Filmstrip floating/section preview | `Filmstrip.jsx:290` → `ScaledSlideText`                                                    | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                             | 6 / 6                     | none (no background layer at all)     |
| Presenter live preview             | `PresenterPanel.jsx:410` → `SlidePreviewSurface`                                           | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                             | 8 / 8                     | `0.18`                                |
| Presenter grid                     | `PresenterPanel.jsx:576` → `SlidePreviewSurface`                                           | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                             | 7 / 5                     | `0.18`                                |
| Home recent card                   | `Home.jsx:1107` → `ScaledSlideText` (body cut to 4 lines, legacy `slide.body`)             | as projector                                                                                                                     | `none`                                                                                                                                                                                        | text-shadow                                                             | 8 / 8                     | none                                  |

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
  `OutputRenderer.safety.test.tsx:79-88` stubs one that records every observed
  element and **never fires**, and `:118-135` asserts the **viewport root**
  (`container.firstElementChild`) is observed exactly once per showing — it
  explicitly tolerates the text layer observing its own frame. The same file's
  `:94` asserts `container.textContent` under that never-firing stub, so a
  renderer must render-and-hide, never return nothing while unmeasured.
  `OutputRenderer.test.tsx:31-35` replaces the **whole** `@/utils/backgrounds`
  module with `{ getMediaAssetUrl, isVideoMedia }` — any new import from that
  module is `undefined` there. `Home.test.tsx` keeps fixtures on the no-slide
  branch to avoid the renderer.
- **The projector has no presentation.** `output:update` carries
  `{ slide, background }` (`electron/main/index.js:1219,1246,1257`); `background`
  is `null` at every call site (`presenterFlow.js:106,131,157`). The slide is
  flattened by `withEffectiveBackground` (`backgrounds.js:45-53` → `sectionId`,
  `effectiveBackgroundId`) and `withPresentationMeta` (`presenterFlow.js:16-25`
  → `aspectRatio`, `customAspectWidth/Height`), which is why `presentation={slide}`
  works. There is no `sections` array, so `getEffectiveBackgroundId(slide, slide.sectionId, slide)`
  returns `slide.effectiveBackgroundId`. `OutputRenderer` resolves the item from
  its own `getMedia()` copy and owns **video continuity** through the
  `backgroundIdRef` early return (`:145-147`): the same background id never
  re-sets state, so the `<video>` element survives slide changes within a
  section. `OutputBackground` (`:345-395`) is a plain uncontrolled element.
- **Nothing in the app sets `shadowEnabled`.** `grep -rn shadowEnabled src`
  finds only the default (`textBoxes.js:48`), the two renderers, and copy/paste
  plumbing in `Filmstrip.jsx`; `Toolbar.jsx` has no shadow control. Decision 3
  contradicts no UI copy and affects no stored row today; a manual check of it
  is impossible (finding).
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
6. **Nothing shows until measured.** The stage is `visibility: hidden` until
   the frame's first `ResizeObserver` callback, so there is no one-frame 1920px
   flash. Pitfalls, each pinned by a unit case: render-and-hide, never return
   nothing (the safety test reads `textContent` under a stub that never fires);
   a missing global `ResizeObserver` leaves the frame hidden instead of throwing;
   the projector must not give `SlideRender` a per-slide `key`, or it re-hides
   on every advance. The frame carries `data-slide-render="<site>"` and
   `data-slide-scale="<s>"` (empty until measured); the stage `data-slide-stage`;
   each box `data-textbox-view` — these are the E2E seams and are not to be
   renamed. A media slide whose file is gone draws `missingMediaLabel` in the
   previews and **nothing** on the projector (`missingMediaLabel={null}`), as
   today.
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
  `src/pages/__tests__/Home.test.tsx:14` (a stale comment naming `ScaledSlideText`),
  `OutputRenderer.jsx:17,299-305` **import only** — the projector keeps
  `ScaledSlideText`'s behaviour until Slice 2, so Slice 1 renames nothing it
  uses: the old text layer is kept as `src/components/presenter/OutputSlideText.jsx`
  (a verbatim move of `ScaledSlideText.jsx`, deleted in Slice 2).
- **Slice 2 (projector):** `OutputRenderer.jsx` (the stage block `:272-305`),
  `OutputSlideText.jsx` (deleted), `OutputRenderer.test.tsx:31-35` (the
  `backgrounds` module mock gains `getEffectiveBackgroundId` — a mock extension,
  not a behaviour change; every existing assertion stays), `.safety.test.tsx`
  (nothing).
- **Slice 3 (canvas):** `Canvas.jsx` (`renderTextBox` `:935-1000`, `renderTextBody`
  `:82-94`, the overlay `:1146`), `SlideTextEditor.jsx:203-247` (style block
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

_Todos 1–4 were written before the fresh-agent review and revised after it
(cases (g)–(h) and 8–10 added, the never-throw guard, the nullable label)._

- [x] 1. **Characterize the style module before it exists (red).**
      `src/utils/__tests__/slideRenderStyle.test.ts`: for a box built with
      `createTextBox({ x: 100, y: 50, width: 800, height: 300, rotation: 5, opacity: 0.5, cornerRadius: 9, outlineWidth: 3, outlineColor: '#ff0000', shadowEnabled: true, shadowOffsetY: 4, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.5)', paddingTop: 0, paddingLeft: 7, textStyle: { size: 120, bold: true, italic: true, underline: true, align: 'left', valign: 'bottom', lineHeight: 1.2, color: '#00ff00', fontFamily: 'Georgia' } })`
      assert `textBoxFrameStyle` and `textBoxContentStyle` **as whole objects with
      `toEqual`** (exact keys, exact values, native px numbers): frame `{ position:'absolute', left:100, top:50, width:800, height:300, transform:'rotate(5deg)', transformOrigin:'center center', opacity:0.5 }`; content includes `paddingTop:0, paddingRight:28, paddingBottom:22, paddingLeft:7, fontSize:120, fontWeight:700, fontStyle:'italic', textDecoration:'underline', textAlign:'left', justifyContent:'flex-end', lineHeight:1.2, color:'#00ff00', fontFamily:'Georgia', textShadow: LEGIBILITY_TEXT_SHADOW, boxShadow:'0px 4px 6px rgba(0,0,0,0.5)', border:'3px solid #ff0000', borderRadius:9, background:'transparent', overflow:'hidden', writingMode:'horizontal-tb', wordBreak:'break-word', whiteSpace:'normal', display:'flex', flexDirection:'column' }`.
      Eight more cases, this list is exhaustive — (a)–(h): (a) default box → `transform:'none'`,
      `boxShadow:'none'`, `border:'none'`, `borderRadius:14`, all four default
      paddings; (b) `{ placeholder: true }` → `color: PLACEHOLDER_TEXT_COLOR`,
      `fontStyle:'italic'` even when the style is not italic; (c) `wrapText:false` →
      `whiteSpace:'nowrap'`, `wordBreak:'normal'`; (d) `textDirection:'vertical'` →
      `writingMode:'vertical-rl'`; (e) `valign:'top'` → `flex-start`, missing →
      `center`; (f) an explicit `backgroundColor` is the fill; (g) a `transparent`
      outline draws no border whatever its width; (h) a shadow switched on with
      no colour uses the default colour and blur. Plus the two constants equal the
      projector's literal strings above.
      Red: `npx vitest run src/utils/__tests__/slideRenderStyle.test.ts` fails on
      "Cannot find module" — that is **not** the red; write the module as an empty
      export first so the red is `toEqual` on its assertion. _Done: 10 failed on
      `toEqual`/`toBe` against the stub._
- [x] 2. Write `src/utils/slideRenderStyle.ts` (Decision 4) reusing
      `resolveTextBoxPadding`, `resolveVerticalAlignment`, `renderOutline`,
      `renderShadow`, `renderTextDecoration` from `canvasTextStyle.ts`. Green on
      Todo 1: `npx vitest run src/utils/__tests__/slideRenderStyle.test.ts`.
- [x] 3. **`SlideRender` unit tests (red first).**
      `src/components/shared/__tests__/SlideRender.test.tsx` (`@vitest-environment jsdom`;
      stub `globalThis.ResizeObserver` in `beforeEach` with a class that records the
      observed element and exposes `fire({ width, height })`; restore in `afterEach`).
      Red: run against a stub component that renders only the frame and stage —
      every case must fail on its assertion (_done: 7 failed on `toEqual`/`toBe`_).
      Verify: `npx vitest run src/components/shared/__tests__/SlideRender.test.tsx`.
      This table is exhaustive — all 10:
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
  7. `renderBackground` is called with the resolved media (every call — React
     renders more than once) and its element is rendered in place of the default.
  8. `missingMediaLabel={null}` draws nothing for a missing media slide
     (`container.textContent === ''`).
  9. a `highlightColor` style wraps the body in a `<span>` with that background
     (`TextBoxBody`'s branch).
  10. with no global `ResizeObserver` the frame renders hidden and does not throw.
- [x] 4. Write `src/components/shared/SlideRender.jsx` (Decisions 1, 5, 6) and
      `TextBoxBody`. Green on Todo 3. `npx vitest run src/components/shared`.
- [x] 5. **Fidelity E2E — lands green; its red is analytical.** `e2e/renderFidelity.spec.ts`
      cannot run against `main`: `[data-slide-render]`, `data-slide-scale` and
      `[data-textbox-view]` did not exist, so on `main` it would fail as a locator
      timeout, which is a harness failure and **not** a red. The red is the
      Measured table: on `main` the filmstrip thumbnail's computed padding was
      `4px 4px 4px 4px` (`FilmstripSlide.jsx:149`, floors 4/4) and the presenter
      grid's `5px 7px 5px 7px` (`PresenterPanel.jsx:582-583`, floors 7/5), with
      `fontSize` differing by rounding; `textShadow` was `none` at both. The
      spec's header states this.
      Flow: launch, dismiss tutorial, open "Sunday Morning Service" (focus row,
      Enter, wait for `[data-slide-editing]`), `showPresenterPanel(page)` —
      **precondition:** the live preview and the grid exist only with the panel
      shown. No output window in Slice 1. For each site in
      `['thumbnail', 'presenter-live', 'presenter-grid']` take the first
      `[data-slide-render="<site>"]`, wait for `data-slide-scale` to match
      `/^[0-9.]+$/`, and collect `{ scale, boxes: [{ id, x, y, w, h, padding, textShadow, boxShadow, fontSize, lineHeight, fontFamily, lines }] }`
      where `x/y/w/h` are the box's screen rect relative to the stage's rect
      divided by `scale` (rounded to 0.1), the strings are `getComputedStyle` of
      the box's first child (the content div), and `lines` counts clusters of
      `getClientRects()` tops over the content's range with a gap threshold of
      half a screen line (`lineHeight × scale / 2`).
      Assert, in this order: reference `scale > 0`; `boxes.length === 1` (exact);
      precondition `lines >= 2` (Amazing Grace has 4 — an empty measurement means
      the harness failed); then, per other site, `toEqual` on the style fields and
      `lines` (whole array, order exact) and `|Δ| ≤ 1` per geometry field.
      Slice 2 adds `'output'` (the projector window) to `SITES`; Slice 3 adds the
      canvas's `[data-textbox-root]` with the same fields.
- [x] 6. Wire the five preview sites, delete `ScaledSlideText.jsx` and
      `SlidePreviewSurface.jsx`, move the projector's copy to `OutputSlideText.jsx`
      (verbatim, import path only), update `inlineStyleBudget.test.ts` rows: remove
      `ScaledSlideText.jsx` (3) and `SlidePreviewSurface.jsx` (2); add
      `components/presenter/OutputSlideText.jsx: 3` (the verbatim copy — removed
      again in Slice 2) and `components/shared/SlideRender.jsx` at its exact count
      (8); `FilmstripSlide.jsx: 2` and `SlideTextEditor.jsx: 2` are unchanged.
      The ratchet fails over and under. `npm run gate`, `npm run format:check`.
      _Done: gate green, 112 files / 919 tests._
- [ ] 7. Baselines: dispatch `update_baselines`, download, `cmp`, triage. Expected
      movers — this list is exhaustive for Slice 1, each with its reason (a mover
      outside it is an unintended side effect and stops the slice): every capture
      that shows a thumbnail, a presenter preview or a Home card gains the
      legibility text-shadow and loses the padding floor — `editor.png`,
      `editor-textbox-selected.png`, `editor-song-order-tray.png`,
      `editor-missing-background.png`, `editor-presenting.png`,
      `editor-song-library.png`, `editor-media-library.png`,
      `editor-media-library-items.png`, `editor-media-library-folder.png`
      (editor + filmstrip + presenter panel); `presentation-settings.png`,
      `output-settings.png`, `shortcuts-overlay.png`, `song-editor-modal.png`,
      `dialog-unsaved-changes.png` (full-page captures over the open editor);
      `home.png`, `home-recent.png`, `home-open.png`, `home-new.png`,
      `home-context-menu.png`, `tutorial.png` (full-page captures over Home's
      cards); and the hover clips whose clip includes a thumbnail. Must **not**
      move: `output.png`, `stage-display.png`, `home-open-empty.png`. All files are
      `*-darwin.png`. Commit only changed files; name each in the commit message.
      PR with findings; records.

### Slice 2 — projector

- [ ] 8. **Measured (see "The projector has no presentation" above).** The
      payload carries `sectionId` and `effectiveBackgroundId` but no `sections`,
      and `OutputRenderer` owns continuity via `backgroundIdRef`. So the projector
      passes what it already resolved: add optional `backgroundMedia` and
      `mediaSlideItem` props to `SlideRender` that, when given, replace the
      library lookup (two unit cases: each prop wins over `mediaLibrary`; Todo 3's
      count becomes 12). `renderBackground={(media) => <OutputBackground media={media} />}`
      keeps the uncontrolled element; a unit case in `OutputRenderer.test.tsx`
      asserts the `<video>` **node identity** survives a second `output:update`
      with a different slide and the same background id (the `backgroundIdRef`
      early return). `missingMediaLabel={null}`, `placeholder={false}`,
      `site="output"`, and no per-slide `key`.
- [ ] 9. Replace the stage's background/overlay/`OutputSlideText` block
      (`:272-305`) with `SlideRender`; delete `OutputSlideText.jsx` and its
      `inlineStyleBudget` row; lower `OutputRenderer.jsx`'s row to its exact count.
      `OutputRenderer.safety.test.tsx` must pass **unchanged** (its stub records
      every observed element and filters on the viewport root, which
      `OutputRenderer`'s own observer still watches; `SlideRender` observes a
      different node). `OutputRenderer.test.tsx:31-35`'s `backgrounds` mock gains
      `getEffectiveBackgroundId` (pre-authorized — a mock extension, not a
      behaviour change; every existing assertion stays as written). Verify:
      `npx vitest run src/components/presenter`.
- [ ] 10. Add `'output'` to `renderFidelity.spec.ts`'s `SITES`: open the output
      window with the listener registered first (`const opened = app.waitForEvent('window'); await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false })); const output = await opened;` — `visual.spec.ts:38-46`), go live on the first slide the way `visual-surfaces.spec.ts:88-97` does (F5 from the editor, wait for the `Presenting` banner), then measure `[data-slide-render="output"]` in the output page. Baselines: expected movers `output.png` only, and only if a
      seeded box has the user's shadow on or a media background — the seed has
      neither, so the expectation is **zero pixel change**; if it moves, triage
      before accepting. `editor-presenting.png` must not move (the editor is
      unchanged in this slice). Gate, PR, records.

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
      thumbnail, presenter preview and projector for one slide at native and at
      windowed output sizes. The user's Shadow cannot be checked by hand — no UI
      sets `shadowEnabled` (Measured); the box-shadow reading is pinned by Todo 1
      case (h) and `canvasTextStyle.test.ts`, and "no UI sets `shadowEnabled`" is
      reported as a finding.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against          | Clause verbatim; exactness/order/count stated under Decisions; Todo 1 uses whole-object `toEqual`; Todo 5 names the one tolerance and its unit                                                                                    |
| List sampling designed against                | Todo 1 "eight more cases (a)–(h), exhaustive"; Todo 3 "all 10"; Todo 5 asserts `boxes.length`; Todo 7's mover list is exhaustive with a reason per group                                                                          |
| Quantifier erosion designed against           | Todo 3.3 collects every `data-textbox-view` and asserts the array; Todo 5 iterates every box of both windows and asserts `boxes.length === 1` before comparing                                                                    |
| Sanctioned escape hatch                       | None needed: no allowlist; a baseline that moves outside the expected list stops the slice (Decision 8)                                                                                                                           |
| Bounded blast radius                          | Blast radius section, per slice, with a may-not-change list                                                                                                                                                                       |
| File-specific pitfall notes                   | Measured: no `ResizeObserver` in jsdom (stub per test); `OutputRenderer.safety` asserts the stage root is observed exactly once; `normalizeTextBox` pre-resolves placeholders (`empty` is dead); scale-1 flash before measurement |
| Exact paths                                   | Blast radius; no new test directories                                                                                                                                                                                             |
| Per-todo verification                         | Todos 1–4 name `npx vitest run <file>`; Todo 5 is verified by CI's `E2E (macOS)`; Todo 9 `npx vitest run src/components/presenter`; Todo 11 its own file; gate at Todos 6, 10, 13                                                 |
| Snapshot policy inline                        | Decision 8 and Todos 7/10/13: CI recapture, `cmp`, triage, commit only movers, name them in the commit                                                                                                                            |
| Preconditions for conditional UI              | Todo 5: presentation open with slide 1 selected and the presenter panel shown (the live preview and grid exist only then); Todo 10 adds the output window and a live slide; `lines >= 2` asserted                                 |
| Structural floor under snapshots              | Todo 5 pairs geometry/style equality with the `lines >= 2` floor; baselines are paired with the existing specs' structural asserts (unchanged)                                                                                    |
| IPC contract pinning                          | N/A — no channel touched; the projector's payload is read, not changed (Todo 8 records its shape)                                                                                                                                 |
| Manual verification steps                     | Todo 14 (owed, not run — no local app launches while Ethan is at the machine)                                                                                                                                                     |
| Required findings report                      | Todo 14                                                                                                                                                                                                                           |
| Data rewrites state their backup and rollback | N/A — no row or snapshot is rewritten                                                                                                                                                                                             |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todos 1→2, 3→4 (both red against a stub, on their assertions), 11→12; Todo 5 lands green with its red stated analytically (its seams did not exist on `main`)                                                                                                                                                       |
| 2   | Behavior-change test edits       | Todo 3.3 (moved `dir="auto"` tests), Todo 11→12 (canvas text-shadow), each named in its commit and the findings report                                                                                                                                                                                              |
| 3   | No weakened assertions           | Clause verbatim; whole-object `toEqual`; one named tolerance                                                                                                                                                                                                                                                        |
| 4   | Coverage floor                   | Todo 1 (every branch of both style functions incl. transparent outline and the shadow-colour fallback), Todo 3 (every prop of `SlideRender` incl. the highlight span and the no-observer path)                                                                                                                      |
| 5   | Lint floor                       | No `.only`/`.skip`; jsdom stubs restored in `afterEach`; `eslint . --max-warnings 0` in the gate                                                                                                                                                                                                                    |
| 6   | Snapshot discipline              | Decision 8; Todos 7, 10, 13                                                                                                                                                                                                                                                                                         |
| 7   | Completion gate                  | Todos 6, 10, 13 report type-check, lint, passed/total                                                                                                                                                                                                                                                               |
| 8   | Vitest / jsdom mechanics         | `@vitest-environment jsdom`; `ResizeObserver` stubbed as a measurement seam, never asserted through jsdom layout; stores reset in `beforeEach` (Todo 11); `src/utils/ipc` mocked                                                                                                                                    |
| 9   | Test placement                   | `src/utils/__tests__/`, `src/components/shared/__tests__/`, `src/components/editor/__tests__/`, `e2e/`                                                                                                                                                                                                              |
| 10  | Characterization before refactor | Todo 11 pins Canvas before Todo 12; `canvasTextStyle.test.ts` (F1) must pass unchanged in every slice. Slice 1's edits to `Filmstrip.jsx`/`Home.jsx`/`PresenterPanel.jsx` are import swaps of one element each, pinned by `SlideRender.test.tsx` and the recaptured baselines — N/A for a new characterization file |
