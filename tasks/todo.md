# PresenterPro — Phase 2

## Phase 2A — Fix Core Presenter Flow
- [x] Pass full slide list to Presenter View via IPC on present start
- [x] Prev/Next buttons actually navigate through slides
- [x] Output window receives its own `output:update` IPC channel (not presenter's channel)
- [x] Clicking a slide in editor while presenting sends it to output

## Phase 2B — Text Formatting Toolbar
- [x] Show formatting bar above canvas in edit mode
- [x] Font size input, Bold toggle, Align left/center/right, Color picker
- [x] Changes save into slide.textStyle and re-render thumbnail

## Phase 2C — Unsaved Changes Warning
- [x] Warn when clicking Back to Home with unsaved changes
- [x] Warn on window close with unsaved changes (beforeunload)

## Phase 2D — Drag to Reorder
- [x] Drag slides within a section to reorder
- [x] Drag sections to reorder

## Phase 2E — Presentation Rename
- [x] Double-click presentation title in TitleBar to rename inline
