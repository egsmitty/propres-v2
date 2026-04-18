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
