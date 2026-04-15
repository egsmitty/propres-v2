# PresenterPro Notes

## What's Built
- Phase 1 foundation through editor, song library, presenting, and core polish exists in the Electron/React app.
- Custom "Phase 2" work is complete: presenter flow fixes, formatting toolbar, unsaved warnings, drag reorder, and inline presentation rename.
- Phase 3 bug-fix work completed so far:
  - native Electron menu commands are now wired into renderer behavior
  - custom menu actions now map to real app commands or disable when unavailable
  - Media Library can set slide and presentation backgrounds
  - canvas and output windows render image/video backgrounds
  - Home screen supports recent-card context actions for open, rename, and delete
  - Home recent cards show real first-slide text previews when available
  - filmstrip section and slide context menus were expanded
  - presenter/editor black and logo state sync is improved

## What's Pending
- Audit remaining inline styles against the PDF's design-system guidance.
- Improve background rendering fidelity further in filmstrip/home previews if desired.
- Decide whether "Open…" should stay as a Home/recent-navigation action or grow into a fuller presentation picker/export-import flow.
- Resolve the runtime font warning for `/fonts/Inter-Variable.woff2`.

## Known Issues
- The build succeeds, but Vite still warns that `/fonts/Inter-Variable.woff2` is unresolved at build time.
- Presentation backgrounds are stored in the DB now, but older rows may not have `default_background_id` populated.
- Slide move/context-menu flows currently use simple prompt-based UX for some operations.

## Architectural Decisions
- Renderer command handling is centralized through `src/utils/appCommands.js` so native menu events and custom menu clicks stay consistent.
- Presentation loading/saving/opening helpers live in `src/utils/presentationCommands.js`.
- Background inheritance is normalized through `src/utils/backgrounds.js` so slide, section, and presentation background behavior stays predictable.
- Background rendering is resolved locally in renderer windows rather than requiring every IPC call to carry a full media payload.
