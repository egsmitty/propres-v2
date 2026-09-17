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
   `tasks/plan-<id>-<name>.md` before doing anything else. The plan must follow
   `writing-executable-plans.mdc` and end with a complete Compliance Manifest.
2. **Use a checklist.** The plan is a list of items that can be checked off.
3. **Check in before starting.** Confirm the plan with Ethan before any work.
4. **Work through the checklist**, marking each item `- [x]` as you go.
5. **High-level explanations only** after each step — plain English, no deep
   technical detail unless asked.
6. **Keep changes small and simple.** Every change touches as little code as
   necessary. Simplicity above all.
7. **Add a review section.** When all items are complete, append `## Review` to
   that plan file summarizing what changed and any notes.
8. **Run the gate.** `npm run gate` from `presenter-pro/` before calling anything
   done, and verify user-facing changes in a running window.

Completed plans are archived in `tasks/` as `<phase-or-session>-<name>.md`.

---

# PresenterPro Notes

Local-first Electron desktop app for worship presentations — a simpler,
PowerPoint-style alternative to ProPresenter.

**Stack:** Electron 44 + React 19 + Zustand 5 + Tailwind 4, built by
`electron-vite`; `better-sqlite3` for persistence.

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
  - presenter panel moved to an in-editor right sidebar (320px default, 240px
    minimum, collapsible); the separate presenter-window code was deleted in
    plan S1
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
- September 2026 (the Fable pass and its follow-ups): one slide renderer for
  every preview and the projector (ED36); one command registry driving the
  in-app menu, shortcuts sheet, tooltips and native-menu greying (CMDS1);
  presenting safety — Escape and the menu can't end a service, output-window
  guards, the live slide survives edits (L1–L4); save races and version edges
  (S2, V1); one `presentations` row writer (SAVED1); Version History marks
  Current by identity, greys out with one version, and previews what restoring
  would change against the current document with per-slide before/after
  (VH1–VH3); a public-domain first-run seed (S1); database lifecycle and a
  startup-failure screen (DB1/DB2/MB1); onboarding accuracy (H2); even toolbar
  spacing (#165) and the in-app menu order matching the native bar (#168).

## In Progress

**Where work is tracked (2026-09-16).** Open work lives on the GitHub Project
**ProPres Issue Tracker** (every issue joins it; statuses Backlog → Ready →
In progress → PR made → In review → Done — only Ethan moves a card to Done)
and is summarised in `tasks/TODO.md`, the living checklist. Start a fresh
session from `tasks/TODO.md` plus the newest `tasks/HANDOFF-*.md` on disk
(local, untracked handoffs kept outside git by design; the tracked
`tasks/HANDOFF-2026-09-09.md` is the fallback).

**The Fable pass** (`tasks/fable-pass-plan.md`, status table at the bottom;
narrative and every finding in `tasks/fable-notes.md`). Landed through
2026-09-16: the engineering system (Phase 6), L0–L4 presenting safety, the
save-race and version edges (S2, V1) and SAVED1's one row writer, ED36's one
slide renderer, CMDS1's command registry, and the Version History preview
(VH1–VH3). **Parked:** ED1R (repairing `&amp;`-compounded rows) — nothing
coded, its review unfinished. **Next in order:** the D8 storage migrations
(ED-38, FS-34, MAIN-B17), the split plans (FS-37 first, then ED-35 Canvas,
CMD-S2 Toolbar, FS-38 Filmstrip), then the design docs. The Part 11 decisions
— above all D6, the save model — are Ethan's.

**Deferred by decision:** redesign-scale UI (the media library, #155; Home and
the title/rename header, #167) waits on direction.

## What's Pending

- Audit remaining inline styles against the PDF's design-system guidance
  (E1/E4 moved most to tokens and `hover:` classes; what remains is budgeted
  file-by-file in `src/__tests__/inlineStyleBudget.test.ts`, which only
  tightens).
- Decide whether "Open…" stays a Home/recent-navigation action or grows into a
  fuller presentation picker / export-import flow.
- Manual runtime verification is tracked in issues #101–#107 (crash recovery
  passed on macOS 2026-09-15). **Windows has never been run on real hardware**
  — #107 is the fresh-clone setup guide plus the Windows-only checklist.
  Multi-display needs real hardware and can never be automated.
- The song editor has no autosave or crash recovery (#152).

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
- Renderer talks to main only through `src/utils/ipc.ts`, which returns a
  `{ success, data, error }` envelope over the channels typed in
  `shared/ipcContract.ts`. Do not call `window.electronAPI` directly from
  components.
- **Save model (plan A5).** Edits autosave to the presentation's own row a
  couple of seconds after typing stops. `isDirty` means "the live row differs
  from the newest restore point", so autosave never clears it — only Save (which
  appends to `presentation_versions`) and Revert do. `File ▸ Revert to Last Save`
  puts the row back; Discard in the Unsaved Changes dialog does the same. The
  crash-recovery journal from plan A2 is no longer written: autosave bumps
  `updated_at`, which would make every journal row stale before it was read.
  Its table and startup drain remain for profiles written by older builds.
  Every `presentations` row write goes through
  `src/utils/persistPresentation.ts` (plan SAVED1); callers keep their own
  dialogs and store effects. Opening a presentation flushes any pending
  autosave first (S2). Editors with their own unsaved state — the song editor —
  register with `src/utils/blockingEditors.ts` so quit/Close/New/Open ask first
  (D3). Version History (VH1–VH3): the newest version always equals the
  committed row, so Current is the newest version when the document is clean;
  the command is disabled with one version or none; Preview compares a version
  against the *current* document (unsaved edits included) and shows each
  changed slide's text now vs. after restoring.
