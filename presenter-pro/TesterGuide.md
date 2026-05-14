# PresenterPro Tester Guide

Use this guide as the shared checklist for app-wide testing across collaborators. The goal is not only to catch regressions, but also to document what is already working well so future changes do not casually disturb stable behavior.

Check items off as they are verified. Add notes inline or in your PR/issue when something feels broken, unclear, unexpectedly changed, or especially solid and worth preserving.

## Testing Rules

- [ ] Test on both macOS and Windows when possible.
- [ ] Treat behavior differences between Mac and Windows as important unless they are clearly intentional.
- [ ] If something feels better than before, note it so it becomes part of the protected behavior.
- [ ] If something feels worse but still technically works, note it anyway.
- [ ] If a flow is already smooth and understandable, mark it as stable so it is not “cleaned up” later.

## Known Good: Protect These

These are current behaviors that should not be casually broken.

### Home / Recent / Open

- [ ] Home uses `Recent` and `Pinned` segmentation.
- [ ] `Pinned` is separate from `Recent`.
- [ ] `Open` remains the full searchable library.
- [ ] Per-tab selection memory feels independent.
- [ ] Rename from row actions does not mutate persistent row selection.
- [ ] Remove from Recent does not delete or unpin.
- [ ] Remove from Recent appears in `Home > Recent` and `Recent`, not `Open`.
- [ ] Recency still updates on open and close.
- [ ] Search/header behavior in `Open` still feels like the restored improved version.

### Song Editor / Song Order

- [ ] Arrangement edits are presentation-only and do not mutate library songs.
- [ ] Empty arrangement is valid.
- [ ] Available sections and arrangement remain separate concepts.
- [ ] Song arrangement supports beginning, between, and end insertion.
- [ ] Standard section labels are auto-derived.
- [ ] Custom is the only nameable section type.
- [ ] `Blank` is not present in the section type UI.
- [ ] Save with blank title defaults to `Untitled Song`.
- [ ] Unsaved changes warning still exists.

### Editor / Presenter

- [ ] Filmstrip no longer has duplicate bottom labels.
- [ ] Selection styling still avoids the old “double selected” feel.
- [ ] Presenter panel stays open while presenting.
- [ ] Collapsed presenter state stays a docked rail, not a floating overlay button.
- [ ] Presenter auto-follow belongs to presenter panel behavior, not filmstrip behavior.
- [ ] Center canvas/footer flex layout still feels correct.
- [ ] Preview fitting and center-scroll correction still feel correct.

### Presentation Metadata

- [ ] Presentation subtitles remain metadata-based, not raw first-slide text.
- [ ] Empty pinned-state copy and behavior still feel intact.

## Platform Pass: Window And Shell

### Windows

- [ ] Launch the app on Windows and confirm the main window uses native Windows chrome.
- [ ] Confirm there is no duplicate custom Windows title bar inside the app.
- [ ] Confirm minimize, maximize, restore, and close work from native window controls.
- [ ] With unsaved changes, try closing the main window and confirm the unsaved-changes prompt still appears.
- [ ] Confirm the app feels native on Windows rather than “Mac ported into Windows”.

### macOS

- [ ] Launch the app on macOS and confirm the app still feels normal there.
- [ ] Confirm the title/menu shell changes do not make Mac feel less polished.
- [ ] Confirm nothing about the top-level shell now feels clumsy or over-exposed on Mac.

## Home View Rundown

- [ ] Home loads without layout issues.
- [ ] Profile block and left navigation render correctly.
- [ ] Switching between `Home`, `New`, `Recent`, and `Open` works reliably.
- [ ] `Popular Templates` still render correctly on Home.
- [ ] `More templates` still opens the full `New` view.
- [ ] `Home > Recent` still shows the latest recent items.
- [ ] `Home > Pinned` still shows pinned items in the expected order.
- [ ] Empty states still read clearly and feel intentional.

### Home / Recent / Open Row Behavior

- [ ] Single-click a presentation row and confirm it selects only, not opens.
- [ ] Double-click a presentation row and confirm it opens.
- [ ] Context menu still opens correctly from the row.
- [ ] Pin and unpin still work as expected.
- [ ] Rename still works as expected.
- [ ] Delete still works as expected.
- [ ] Selection highlighting still feels correct.
- [ ] Hover behavior still feels correct.
- [ ] Nothing about the restored Open/Pin/selection system feels unintentionally changed.

### Open Search

- [ ] Search by title works.
- [ ] Search by month/date text works.
- [ ] Search results still preserve the restored hierarchy and shell feel.
- [ ] Search does not interfere with row selection or actions.

## New View Rundown

This area is not being redesigned in the current pass, so verify stability only.

- [ ] `New Presentation` screen still renders correctly.
- [ ] Template cards still render correctly.
- [ ] Blank presentation card still renders correctly.
- [ ] Current selection-first flow still works as-is.
- [ ] Bottom `Create / Cancel` bar still behaves as it currently does.

## Editor View Rundown

- [ ] Open an existing presentation and confirm the editor loads cleanly.
- [ ] The editor header shows `Home`, presentation title, `Rename`, and save state clearly.
- [ ] Clicking `Rename` allows title edits without needing double-click.
- [ ] Title changes persist into the editor state.
- [ ] Unsaved state appears after a change.
- [ ] Save clears the unsaved state.
- [ ] Returning Home respects unsaved-changes protection.

### Toolbar / Commands

- [ ] Toolbar layout still feels balanced.
- [ ] `New Slide` still works.
- [ ] `Text Box` still works.
- [ ] Duplicate slide still works.
- [ ] Delete slide still works.
- [ ] Announcement insert still works.
- [ ] Sermon insert still works.
- [ ] Song and Media entry points still work.

### Formatting And Text Editing

- [ ] Double-click to edit slide text still works.
- [ ] Bold works.
- [ ] Italic works.
- [ ] Underline works.
- [ ] Alignment controls work.
- [ ] Text color works.
- [ ] Highlight works.
- [ ] Formatting tooltips show correct shortcut labels for the current platform.

### Filmstrip

- [ ] Filmstrip still renders correctly when visible.
- [ ] Filmstrip selection still behaves correctly.
- [ ] Slide reordering still works.
- [ ] Insert affordances still work.
- [ ] Section grouping still feels intact.
- [ ] Collapse/restore behavior still works.

### Canvas

- [ ] Canvas preview fitting still feels correct.
- [ ] Centering and scroll behavior still feel correct.
- [ ] Selecting and editing text boxes still work.
- [ ] Resizing and moving elements still work.
- [ ] Canvas context menu still works where expected.

## Song Library Rundown

- [ ] Song Library opens correctly.
- [ ] Search songs works by title and artist.
- [ ] Song rows still read clearly.
- [ ] `Insert` is visible and works.
- [ ] `Edit` is visible and works.
- [ ] `More actions` opens correctly.
- [ ] `New Song` still opens the song editor.

### Song Editor

- [ ] Editing an existing song works.
- [ ] Creating a new song works.
- [ ] Raw lyrics editing works.
- [ ] Parsing lyrics works.
- [ ] Slide preview updates correctly.
- [ ] Group type changes work.
- [ ] Custom group naming works.
- [ ] Add slide works.
- [ ] Remove slide works.
- [ ] Add section group works.
- [ ] Remove section group works.
- [ ] Arrangement chips can still be added and reordered.
- [ ] Save to Library works.
- [ ] Raw lyrics save no longer loses edits when saving without pressing `Parse Song` first.

## Media Library Rundown

- [ ] Media Library opens correctly.
- [ ] Search/filter behavior still works.
- [ ] Media folder creation still works.
- [ ] Media import still works.
- [ ] Row/tile actions still work.
- [ ] Insert media into the current presentation still works.

## Presenter And Output Rundown

- [ ] Start presenting works.
- [ ] Stop presenting works.
- [ ] Presenter panel stays open while presenting.
- [ ] Presenter panel selected/live preview behavior still feels correct.
- [ ] Output window opens correctly.
- [ ] Stage display window opens correctly.
- [ ] Black screen works.
- [ ] Logo screen works.
- [ ] Closing presenter/output windows does not destabilize the main editor.

## Shortcuts And Menus

- [ ] In-app menu labels render correctly.
- [ ] Shortcut labels show `⌘` on Mac where appropriate.
- [ ] Shortcut labels show `Ctrl` on Windows where appropriate.
- [ ] Shortcuts overlay matches the same platform-specific labeling.
- [ ] `New Presentation` shortcut works.
- [ ] `Open` shortcut works.
- [ ] `Save` shortcut works.
- [ ] `Save As` shortcut works.
- [ ] `New Slide` shortcut works.
- [ ] Present shortcuts still work.
- [ ] No obvious Mac-only shortcut copy remains on Windows-facing surfaces.

## Regression Notes To Capture

- [ ] Anything broken.
- [ ] Anything different but maybe acceptable.
- [ ] Anything that feels more native on Windows now.
- [ ] Anything that feels worse on Mac now.
- [ ] Anything that is clearly stable and should not be touched again.
- [ ] Any flow that still depends too much on hover to explain itself.
- [ ] Any place where Mac and Windows still feel confusingly different.

## Deferred Follow-Up Areas

These are intentionally not part of the current Windows-first parity pass, but should be brought back up later if they get forgotten.

- [ ] New page should likely move to single-click template open/create and remove the bottom `Create / Cancel` bar for that page.
- [ ] Song editor and main editor still need a stronger clarity pass around source vs arrangement, insertion, identifiers, and click alternatives for drag-heavy flows.
