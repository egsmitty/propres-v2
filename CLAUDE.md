# CLAUDE.md — PresenterPro

## Start here

Governance for this repo lives in dedicated files. **Read them instead of
relying on this one**; this file only carries project state.

| Question | File |
|---|---|
| How do agents and I work together? | [`AGENTS.md`](AGENTS.md) |
| What are the roles, stages, and the Self-Review gate? | [`AI_OPERATING_MANUAL.md`](AI_OPERATING_MANUAL.md) |
| What is the testing policy and completion gate? | [`.cursor/rules/testing-standards.mdc`](.cursor/rules/testing-standards.mdc) |
| How do I actually write a test here? | [`.cursor/rules/writing-tests.mdc`](.cursor/rules/writing-tests.mdc) |
| How do I write a plan another agent will execute? | [`.cursor/rules/writing-executable-plans.mdc`](.cursor/rules/writing-executable-plans.mdc) |
| How do branches, PRs, and releases work? | [`.github/BRANCHING.md`](.github/BRANCHING.md) |

When this file and a rule file disagree, **the rule file wins**.

## Workflow (summary — the manual is authoritative)

1. **Think first, then plan.** Read the relevant code and write a plan to
   `tasks/todo.md` before doing anything else. The plan must follow
   `writing-executable-plans.mdc` and end with a complete Compliance Manifest.
2. **Use a checklist.** The plan is a list of items that can be checked off.
3. **Check in before starting.** Confirm the plan with Ethan before any work.
4. **Work through the checklist**, marking each item `- [x]` as you go.
5. **High-level explanations only** after each step — plain English, no deep
   technical detail unless asked.
6. **Keep changes small and simple.** Every change touches as little code as
   necessary. Simplicity above all.
7. **Add a review section.** When all items are complete, append `## Review` to
   `tasks/todo.md` summarizing what changed and any notes.
8. **Run the gate.** `npm run gate` from `presenter-pro/` before calling anything
   done, and verify user-facing changes in a running window.

Completed plans are archived in `tasks/` as `<phase-or-session>-<name>.md`.

---

# PresenterPro Notes

Local-first Electron desktop app for worship presentations — a simpler,
PowerPoint-style alternative to ProPresenter.

**Stack:** Electron 29 + React 18 + Zustand + Tailwind, built by `electron-vite`;
`better-sqlite3` for persistence.

## What's Built

- Phase 1 foundation through editor, song library, presenting, and core polish.
- Phase 2: presenter flow fixes, formatting toolbar, unsaved warnings, drag
  reorder, inline presentation rename.
- Phase 3 bug-fix work:
  - native Electron menu commands wired into renderer behavior
  - custom menu actions map to real app commands or disable when unavailable
  - Media Library can set slide and section backgrounds
  - canvas and output windows render image/video backgrounds
  - Home screen recent-card context actions (open, rename, delete) with real
    first-slide text previews
  - filmstrip section and slide context menus expanded
  - presenter/editor black and logo state sync improved
  - song section labels expanded to 9 types with color badges and custom labels
  - presenter panel moved to an in-editor right sidebar (300px, collapsible);
    the separate presenter-window code was deleted in plan S1
  - slide rendering scales from presentation-native dimensions
  - newline preservation normalized across canvas, filmstrip, presenter
    previews, and output rendering
  - presentation aspect ratio saved per presentation, including custom sizes
  - blank presentations start with a starter slide; new slides show a
    `Click to edit` placeholder that clears on first input
  - Delete/Backspace removes the selected slide when focus is outside a text field
  - spacebar advancement hardened for the in-editor presenter sidebar
  - filmstrip drag targets animate open; filmstrip and presenter widths persist
    in localStorage with tightened resize caps
  - Insert Image / Insert Video use native Electron file pickers
  - center-canvas slide context menu supports set background, copy, paste,
    clear, and delete
  - slide text lives in a real draggable/resizable text box with center snapping
    and persisted geometry; fill, font, size, B/I/U, color, alignment, and
    line-height controls in the toolbar
  - song editor has a draggable Song Order panel, respected on insert
  - Output Settings detects displays, assigns Main Output vs Stage Display, and
    saves a basic Stage Display theme; separate Stage Display window shows large
    lyric text with a next-slide preview
  - Output Settings includes a UI stub for SMPTE / Blackmagic video output
- Phase 4: Home redesign (`Home / New / Recent / Open` rail, template cards).
- Phase 5: section-based background model, reusable Media Library, continuous
  background playback, countdown overlay, media slides in the flow.
- Session 9: floating contextual text box toolbar.

## In Progress

**The Fable pass** (`tasks/fable-pass-plan.md`, status table at the bottom;
narrative in `tasks/fable-notes.md`). Phase 6's engineering system is done and
every charter workstream has landed except workstream F (structure), which stays
blocked until the six large files have characterization tests under them.
Start a fresh session from `tasks/HANDOFF-2026-09-09.md`.

## What's Pending

- Audit remaining inline styles against the PDF's design-system guidance.
- Improve background rendering fidelity in filmstrip/home previews.
- Decide whether "Open…" stays a Home/recent-navigation action or grows into a
  fuller presentation picker / export-import flow.
- Full manual runtime verification on both macOS and Windows hardware,
  especially multi-display output assignment and native presentation behavior.

## Known Issues

- `default_background_id` is effectively dead: `normalizePresentation` hard-nulls
  both of its spellings on every path, so every save clears it. That — not a
  missing backfill — is why older rows have no value. Decide whether to drop the
  column or stop nulling it.
- Some slide move / context-menu flows still use prompt-based UX.
- `.git` is ~49M because test media was committed as raw blobs. History is
  intentionally left alone; `test-media/` is ignored going forward.

## Architectural Decisions

- Renderer command handling is centralized in `src/utils/appCommands.js` so
  native menu events and custom menu clicks stay consistent.
- Presentation load/save/open helpers live in `src/utils/presentationCommands.js`.
- Background inheritance is normalized through `src/utils/backgrounds.js`.
- Background rendering resolves locally in renderer windows rather than making
  every IPC call carry a full media payload.
- Section background is the primary background model; it persists under text
  across slide changes within a section until changed.
- Renderer talks to main only through `src/utils/ipc.js`, which returns a
  `{ success, data, error }` envelope. Do not call `window.electronAPI` directly
  from components.
- **Save model (plan A5).** Edits autosave to the presentation's own row a
  couple of seconds after typing stops. `isDirty` means "the live row differs
  from the newest restore point", so autosave never clears it — only Save (which
  appends to `presentation_versions`) and Revert do. `File ▸ Revert to Last Save`
  puts the row back; Discard in the Unsaved Changes dialog does the same. The
  crash-recovery journal from plan A2 is no longer written: autosave bumps
  `updated_at`, which would make every journal row stale before it was read.
  Its table and startup drain remain for profiles written by older builds.
