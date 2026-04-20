# Session 9 — Floating Contextual Text Box Toolbar

Replace the multi-row docked FormattingToolbar with a single-row floating toolbar that appears near the selected text box.

## Checklist

- [x] **1. Rewrite FormattingToolbar.jsx as a floating toolbar**
  Completely replace the file. New component:
  - Accepts `sectionId`, `slideId`, `selectedTextBoxIds`, `primaryTextBox`, `canvasRef`, `scale`
  - Uses `position: fixed`; position is computed from `canvasRef.current.getBoundingClientRect()` + `primaryTextBox.{x,y,width,height}` × `scale`
  - Appears above the text box (8px gap), flips below if near top of canvas
  - Left-aligned to the text box, clamped to viewport
  - Single row (~36px tall): `[Font Family] [Size] | [B][I][U][S] | [TextColor][Highlight] | [AlignL][AlignC][AlignR] | [Line Spacing▾] | [Fill][Outline] | [⋮ More]`
  - `|` are `Sep` dividers (1px rule)
  - Color buttons show a swatch; clicking opens a small popover with preset colors + native `<input type="color">` at bottom
  - Line spacing button shows current value; clicking opens a popover with 1× 1.15× 1.3× 1.5× 2× presets + custom input
  - ⋮ More button opens a dropdown panel positioned above-right of the button containing:
    vertical align, justify, paragraph before/after, bullets/numbering, indent ±, opacity,
    autofit, wrap, text direction, rotation, shadow, --- divider ---, z-order (forward/front/backward/back),
    duplicate, case change, clear formatting, delete box (danger)
  - All interactive elements carry `data-editor-toolbar="true"` (prevents blur on SlideTextEditor)
  - Popover close-on-outside-click uses a `mousedown` document listener that ignores the trigger button

- [x] **2. Update Canvas.jsx**
  - Pass `canvasRef={canvasRef}` and `scale={scale}` to `<FormattingToolbar>` (same import name)
  - Remove the surrounding `!!selectedTextBoxIds.length && !mediaOnlySlide` conditional guard (FloatingToolbar renders null when no box is selected, handling this internally)
  - The canvas flex column no longer reserves vertical space for a toolbar row — the canvas gets all the height

- [x] **3. Update Toolbar.jsx**
  - Subscribe to `selectedSectionId`, `selectedSlideId`, `addSlideTextBox` from `useEditorStore`
  - Add a `Type` icon button labeled "Add Text Box" after the Delete Slide button (before the first Separator)
  - Disabled when `!hasSlide || panelOpen`
  - Calls `addSlideTextBox(selectedSectionId, selectedSlideId)`

---

## Files to touch
- `presenter-pro/src/components/editor/FormattingToolbar.jsx` (full rewrite)
- `presenter-pro/src/components/editor/Canvas.jsx` (small prop additions + remove conditional)
- `presenter-pro/src/components/layout/Toolbar.jsx` (add one button)

## Review

All three items complete.

- **FormattingToolbar.jsx** — fully rewritten as a `position: fixed` floating toolbar. Computes screen position from `canvasRef.getBoundingClientRect()` + box coordinates × scale. Single row with font, size, bold/italic/underline/strikethrough, text/highlight color popovers, alignment, line spacing popover, fill/outline color, and a ⋮ More panel for secondary controls. Returns `null` when no box is selected or position can't be computed, so no external guard is needed.

- **Canvas.jsx** — removed the `!!selectedTextBoxIds.length && !mediaOnlySlide` conditional wrapper around `<FormattingToolbar>` and added `canvasRef={canvasRef}` and `scale={scale}` props. The toolbar now floats outside the canvas DOM flow so no vertical space is reserved.

- **Toolbar.jsx** — added `Type` icon import, subscribed to `selectedSectionId` and `addSlideTextBox` from the store, and added an "Add Text Box" button after Delete Slide. Disabled when no slide is selected or a panel is open.
