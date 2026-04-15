# PresenterPro — Phase 3

## Goal
Phase 3 is the cleanup pass after our custom "Phase 2" work: bug fixes, PDF alignment, and missing polish items that still block the app from feeling like the spec.

## Phase 3A — Menu And Command Wiring
- [x] Wire the native Electron menu events into the renderer so the native app menu actually works
- [x] Make the custom `MenuBar` match the PDF more closely for `New`, `Open`, `Save As`, `Presenter View`, `Output Window`, and Help actions
- [x] Remove or disable any menu actions that still render but do nothing

## Phase 3B — Media Backgrounds
- [x] Let the Media Library actually set the selected slide background
- [x] Support "Set as Presentation Background" from the Media Library like the PDF describes
- [x] Render image backgrounds on the canvas instead of the current placeholder dark fill
- [x] Render image/video backgrounds in the output window using the background payload already passed through IPC
- [x] Show useful media previews in the Media Library instead of mostly placeholder cards

## Phase 3C — Home Screen And Presentation Management
- [x] Add right-click context menu on recent presentation cards for Open, Rename, and Delete
- [x] Replace the placeholder recent-card thumbnail with a real first-slide preview when possible
- [x] Add inline or modal rename support for presentations from the Home screen
- [x] Add delete presentation flow with confirmation

## Phase 3D — Filmstrip And Context Menu Gaps
- [x] Expand section header context menu to include Edit Section and Change Color, not just Add/Remove
- [x] Expand slide context menu to include Set Background and Move to Section
- [x] Review drag-and-drop behavior for edge cases like dropping to the end of a section or moving the only slide in a section

## Phase 3E — Presenter And Output Polish
- [x] Make Presenter View reflect Logo mode visually, not just Black mode
- [x] Review live-state syncing so editor, presenter view, and output stay consistent after black/logo/stop events
- [x] Verify keyboard shortcuts behave the same from editor, native menu, and Presenter View

## Phase 3F — PDF Alignment And Project Hygiene
- [x] Add a root `CLAUDE.md` notes file as required by the PDF prompt
- [ ] Audit remaining inline styles that should be converted to design-token-driven styling where practical
- [x] Review the remaining PDF acceptance criteria and note any still-missing functionality after the bug-fix pass
