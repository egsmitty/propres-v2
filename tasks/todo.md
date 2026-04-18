# Session 7 — WYSIWYG Scaling + Rich Text + Aspect Ratio

## Root cause analysis

### Text scaling / editor jump
Canvas preview renders text at `size * 0.5` (hardcoded approximation).
SlideTextEditor renders at raw `size` with no scale factor at all.
Neither adjusts when the canvas div resizes → both are wrong.

Fix: treat the canvas as always 1920×1080 internally (or the native resolution
for the chosen aspect ratio). Wrap all slide content in a div that is literally
`nativeW × nativeH`, then apply `transform: scale(measuredWidth / nativeW)` to it.
Since `transform` doesn't affect layout, the outer div keeps its aspect-ratio sizing
and clips via `overflow: hidden`. Both preview AND editor live inside this same
scaled container → they are automatically identical.

### Why text jumps on edit
SlideTextEditor has `h-full` which fills the full slide height and naturally
top-aligns its content. The preview div has no explicit height so it sizes to
content, letting the parent flex container center it vertically. Once both live
inside the native-size inner container the parent flex handles centering for
both → jump is eliminated.

### Rich text
Editor saves `innerText` (strips markup). Fix: save `innerHTML`.
Render body with `dangerouslySetInnerHTML` everywhere. Add italic,
underline, highlight to FormattingToolbar via `document.execCommand`.
Plain text bodies are valid HTML so all existing slides keep working.

### Aspect ratio
Each presentation needs a stored aspect ratio (default 16:9). The native canvas
dimensions are derived from it: 16:9 → 1920×1080, 4:3 → 1440×1080,
16:10 → 1920×1200, 1:1 → 1080×1080, custom → user-specified width×height.
Canvas and OutputRenderer both use these native dims for their scale/layout.

## Files to touch
- `electron/db/migrations.js` — add aspect_ratio column (ALTER TABLE with try/catch)
- `electron/db/queries/presentations.js` — read/write aspect_ratio field
- `electron/main/index.js` — no change needed (queries handle it)
- `Canvas.jsx` — ResizeObserver, native-size inner container, remove `* 0.5` hack
- `SlideTextEditor.jsx` — remove `h-full`, save `innerHTML`, use native sizes
- `FormattingToolbar.jsx` — add Italic, Underline, Highlight, per-selection color
- `OutputRenderer.jsx` — render body as HTML, fix hardcoded 64px, respect aspect ratio
- `PresenterPanel.jsx` — thumbnails render body as HTML (dangerouslySetInnerHTML)
- `FilmstripSlide.jsx` — check if it renders body text, fix if so
- `PresentationSettingsModal.jsx` — NEW: aspect ratio picker dialog
- `appCommands.js` — wire Edit → Presentation Settings to open modal
- `editorStore.js` — expose helper to get/set aspect ratio on presentation

## Plan

### Part A — WYSIWYG scale (do first, lowest risk)
- [x] `Canvas.jsx` — add `useRef` + `ResizeObserver` to measure width; add native-size inner container (`nativeW × nativeH`) with `transform: scale(measuredWidth / nativeW) transformOrigin: top left`; set outer div `aspectRatio: nativeW/nativeH` and `overflow: hidden`; remove the `* 0.5` font-size hack; read native dims from `presentation.aspectRatio` (default `'16:9'`)
- [x] `SlideTextEditor.jsx` — remove `h-full`; use raw `size` (container handles scaling); save `innerHTML` on blur/escape instead of `innerText`
- [x] `OutputRenderer.jsx` — render `slide.body` as HTML; use `slide.textStyle.size` directly

### Part B — Rich text toolbar
- [x] `FormattingToolbar.jsx` — add Italic (I), Underline (U), Highlight color picker buttons using `document.execCommand`
- [x] `Canvas.jsx` (preview) — render body with `dangerouslySetInnerHTML` instead of `{slide.body}`
- [x] `PresenterPanel.jsx` + `FilmstripSlide.jsx` — render thumbnails with `dangerouslySetInnerHTML` (body is HTML)
- [x] `PresenterPanel.jsx` (grid) — derive `cols` from `presenterPanelWidth` (2 cols < 380px, 3 cols < 520px, 4 cols ≥ 520px); apply via `gridTemplateColumns: repeat(${cols}, 1fr)`

### Part C — Aspect ratio settings
- [x] `electron/db/migrations.js` — add `try/catch` ALTER TABLE for `aspect_ratio TEXT DEFAULT '16:9'`
- [x] `electron/db/queries/presentations.js` — include `aspect_ratio` in `createPresentation`, `updatePresentation`, and `parse()`
- [x] `PresentationSettingsModal.jsx` — NEW modal: radio for 16:9, 4:3, 16:10, 1:1, Custom; custom shows width×height inputs; saves via `updatePresentationAspectRatio`
- [x] `editorStore.js` — add `updatePresentationAspectRatio(ratio, customW, customH)` action
- [x] `appCommands.js` — `edit:presentationSettings` → opens modal via appStore flag
- [x] `appStore.js` — add `presentationSettingsOpen` boolean + setter
- [x] `Editor.jsx` — render `<PresentationSettingsModal />` when `presentationSettingsOpen`
- [x] `electron/main/index.js` — add "Presentation Settings…" item to Edit menu

## Commit message
"feat: WYSIWYG scale via CSS transform, rich text editing, aspect ratio settings (session 7)"

## Review

### What changed
- **Canvas.jsx**: Added `ResizeObserver` to measure the outer canvas div width. All slide content now lives inside a native-resolution inner div (1920×1080 by default) that is scaled down via `transform: scale(measuredWidth / nativeW)`. Removed the `* 0.5` font-size hack — the container handles all scaling now. Preview text and editor text are both inside this same container so they are always 1:1.
- **SlideTextEditor.jsx**: Removed `h-full` (was causing top-align jump). Now initializes with `innerHTML` and saves `innerHTML` on blur/Escape so rich text formatting is preserved.
- **OutputRenderer.jsx**: Renders body via `dangerouslySetInnerHTML`. Uses `slide.textStyle.size` directly (was hardcoded 64).
- **FormattingToolbar.jsx**: Added Italic (I) and Underline (U) buttons via `document.execCommand`. Added Highlight color picker via `execCommand('hiliteColor', ...)`.
- **PresenterPanel.jsx**: Preview and slide grid thumbnails use `dangerouslySetInnerHTML`. Grid auto-switches from 2→3→4 columns based on panel width.
- **FilmstripSlide.jsx**: Strips HTML tags before splitting body into preview lines.
- **DB (migrations + queries)**: Added `aspect_ratio` column to `presentations` table. `parse()`, `create`, and `update` all handle it.
- **PresentationSettingsModal.jsx**: New modal (Edit → Presentation Settings) with 16:9 / 4:3 / 16:10 / 1:1 / Custom radio options. Custom exposes width × height inputs.
- **appStore + editorStore**: `presentationSettingsOpen` flag and `updatePresentationAspectRatio` action added.
- **appCommands + main/index.js**: `edit:presentationSettings` command wired in renderer and native Edit menu.
