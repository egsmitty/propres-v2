# Claude Workflow Rules

Follow these rules for every task in this project:

1. **Think first, then plan.** Read the codebase for relevant files and write a plan to `tasks/todo.md` before doing anything else.

2. **Use a checklist.** The plan in `tasks/todo.md` must be a list of todo items that can be checked off as they are completed.

3. **Check in before starting.** After writing the plan, pause and confirm it with Ethan before beginning any work.

4. **Work through the checklist.** Complete todo items one at a time, marking each as done (`- [x]`) as you go.

5. **High-level explanations only.** After each step, give a brief, plain-English summary of what changed — no need for deep technical detail.

6. **Keep changes small and simple.** Every code change should be as minimal as possible. Avoid large or complex edits. Each change should touch as little code as necessary. Simplicity above all.

7. **Add a review section.** When all items are complete, append a `## Review` section to `tasks/todo.md` summarizing what was changed and any other relevant notes.


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
  - Song section labels expanded to 9 types with color badges and custom label input
  - Presenter panel moved to in-editor right sidebar (300px, collapsible); separate presenterWindow code commented out in main.js for rollback
  - slide rendering now scales from presentation-native dimensions instead of fixed preview font sizes
  - newline preservation is normalized across canvas, filmstrip, presenter previews, and output rendering
  - presentation aspect ratio is saved per presentation, including custom width/height values
  - blank presentations now start with a starter slide instead of an empty editor state
  - newly created slides now show a `Click to edit` placeholder that clears on first input
  - Delete/Backspace now remove the selected slide when focus is not in a text field
  - Spacebar advancement in presentation mode was hardened for the in-editor presenter sidebar
  - filmstrip drag targets now animate open to show the drop location more clearly
  - filmstrip and presenter sidebar widths now persist in localStorage
  - sidebar resize caps were tightened further so the filmstrip and presenter preview cannot over-expand
  - Insert Image / Insert Video now use native Electron file pickers and apply imported media to the selected slide
  - center-canvas slide context menu now supports set background, copy, paste, clear, and delete actions
  - slide text now lives in a real draggable/resizable text box on the canvas, with center snapping guides and persisted box geometry
  - text box fill color, font family, font size, bold, italic, underline, text color, alignment, and line-height controls are now available in the editor toolbar
  - scaled slide text rendering now respects text-box position/style in the editor, presenter previews, and output window
  - song editor now includes a draggable Song Order panel, and saved song order is respected when inserting songs into presentations
  - Output Settings now detects desktop displays, assigns Main Output vs Stage Display screens, and saves a basic Stage Display theme
  - a separate Stage Display window now shows large lyric text with a next-slide preview
  - Output Settings now includes a UI stub for SMPTE / Blackmagic video-output architecture distinct from desktop graphics outputs

## What's Pending
- Audit remaining inline styles against the PDF's design-system guidance.
- Improve background rendering fidelity further in filmstrip/home previews if desired.
- Decide whether "Open…" should stay as a Home/recent-navigation action or grow into a fuller presentation picker/export-import flow.
- Resolve the runtime font warning for `/fonts/Inter-Variable.woff2`.
- Full manual runtime verification is still needed on both macOS and Windows hardware, especially for multi-display output assignment and native presentation behavior.

## Known Issues
- The build succeeds, but Vite still warns that `/fonts/Inter-Variable.woff2` is unresolved at build time.
- Presentation backgrounds are stored in the DB now, but older rows may not have `default_background_id` populated.
- Slide move/context-menu flows currently use simple prompt-based UX for some operations.

## Architectural Decisions
- Renderer command handling is centralized through `src/utils/appCommands.js` so native menu events and custom menu clicks stay consistent.
- Presentation loading/saving/opening helpers live in `src/utils/presentationCommands.js`.
- Background inheritance is normalized through `src/utils/backgrounds.js` so slide, section, and presentation background behavior stays predictable.
- Background rendering is resolved locally in renderer windows rather than requiring every IPC call to carry a full media payload.
