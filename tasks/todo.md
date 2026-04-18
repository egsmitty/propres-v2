# Remove Notes Pane & Zoom Controls

## Plan
- [x] Delete `NotesPane.jsx` file
- [x] Remove NotesPane import and usage from `Canvas.jsx`
- [x] Remove `ZoomControls` component and all zoom-related code from `Canvas.jsx`
- [x] Remove `zoom`, `setZoom`, and `updateSlideNotes` from `editorStore.js`
- [x] Remove `view:zoomIn` / `view:zoomOut` cases from `appCommands.js`
- [x] Revert canvas div styling back to pre-notes/zoom layout
- [x] Update CLAUDE.md to remove notes pane mention from "What's Built"

## Review
- Deleted `NotesPane.jsx` entirely.
- Removed `updateSlideNotes`, `zoom`, and `setZoom` from `editorStore.js`.
- Removed the `ZoomControls` component and all zoom/notes references from `Canvas.jsx`; reverted canvas wrapper classes/styles to the pre-notes layout.
- Removed `view:zoomIn` and `view:zoomOut` cases from `appCommands.js`.
- Updated `CLAUDE.md` to reflect the removal.
