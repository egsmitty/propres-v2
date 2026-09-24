# Executable Plan #155-P4 — Detail-pane actions (#156) and the Editor switch

**Parent charter:** `plan-155-media-library-port.md` (Phase 4). **Issues:** #155,
**#156** (the confusing Use / More / Delete footer). This is the **first
user-visible** slice of the port: the modal from P3 gains the right-hand detail
pane with explicit actions, and `Editor.jsx` mounts it **instead of** the 320px
panel. Base: `main` after #174 (P3). One PR. **Ethan's running-window check
happens on this PR**, together with his two open calls (the non-dimming surface;
import not enforcing the cap).

---

## Measured (read 2026-09-24)

- **What the old panel does that the modal must cover** (`MediaLibraryPanel.jsx`):
  `applyToSlide` → `setSlideBackground(selectedSectionId, selectedSlideId,
  media.id)` then closes; `applyToSection` → `setSectionBackground(selectedSectionId,
  media.id)` then closes; `insertAsMediaSlide` →
  `insertMediaSlideIntoCurrentPresentation(row)` (takes the **raw row**; uses
  `media.id`/`media.name`) and closes on a truthy result; Rename via
  `promptDialog(…, { requireValue })` → `updateMedia`; Move via `showDialog` with a
  `select` field of folders → `updateMedia({ folder_id })`; Delete via
  `confirmDialog` → `deleteMedia`. Disabled states: slide action needs
  `selectedSlideId`; section/insert actions need a selected section. The
  "Applying To" banner shows `{getSectionTypeLabel(type)}: {section.title}`.
  Background ids are the **numeric** `media.id` (`backgroundId = media.id`).
- **Store setters** (`editorStore.js:327-360`): both mark `isDirty` and push undo
  history through `historyOf`; they take the numeric media id.
- **Entry points** all just set the flag (and close the other left panels, which
  becomes harmless): `FilmstripSlide.openMediaLibrary` (:51), `Canvas` (:153),
  `Toolbar` (:1301), `appCommands` `insert:media` / `view:mediaLibrary`. **None
  change.** Canvas and Filmstrip refetch `getMedia()` on `[mediaLibraryOpen]`
  (`Canvas.jsx:302`, `Filmstrip.jsx:414`), so closing the modal still refreshes
  their media lists — unchanged.
- **`Editor.jsx`**: `panelOpen = songLibraryOpen || mediaLibraryOpen ||
  newSongEditorOpen` (:195) gates `editorKeyAction` (slide keys off while a panel
  is open) and `handlePresent` ("Close any open library or editor panels before
  presenting"). Mount at `:362` inside the left-panel row; the modals mount at
  `:344-346`.
- **`shortcutGuard.isModalOpen()`** lists five app flags + the dialog store;
  `shortcutGuard.test.ts:83` **freezes the count at 5**. `mediaLibraryOpen` is not
  among them today (it was a panel, not an overlay).
- **E2E** (cannot run locally — CI is the proof; rule 8): five specs touch the
  library. All open it with the toolbar button `Media Library` and close it with
  `Close media library` — **both names are kept by the modal** (deliberate in P3).
  `visual-library.spec.ts:47` uses the old panel's `Back to media library` title
  and captures `editor-media-library-items.png` / `-folder.png`;
  `visual-surfaces.spec.ts:65` captures `editor-media-library.png`;
  `visual-hover.spec.ts:204` captures `hover-media-library-close.png`. **All four
  baselines will change.** `.github/workflows/e2e.yml` has a `workflow_dispatch`
  input `update_baselines` (steps at :66-75) — the mechanism to re-capture on CI.
- **Unit tests**: nothing mounts the panel through the Editor today
  (`Editor.save.test.tsx` only). No test names `MediaLibraryPanel`.

## Decisions

1. **The detail pane lives in `MediaLibraryModal.tsx`** as a right-hand column
   (`w-[280px]`, `border-l border-border-subtle`). No selection → a hint ("Select
   a media item to see what you can do with it."). With a selection: the tile
   preview in an `aspect-video` frame, the name (truncated, `title`), a kind
   badge (Image / Video), the created date, the folder path (`buildFolderPath` →
   `ALL / a / b`), and an **Applying to** line (`{SectionLabel}: {title}` or
   "Choose a section first"). Then the buttons, in this order and wording:
   **Set slide background** · **Set {SectionLabel} background** · **Insert as
   media slide** · **Rename…** · **Move to…** · **Delete**.
2. **Actions call exactly what the panel called**, with the raw row's numeric id:
   `setSlideBackground(sectionId, slideId, photo.raw.id)`,
   `setSectionBackground(sectionId, photo.raw.id)`,
   `insertMediaSlideIntoCurrentPresentation(photo.raw)`. **Each closes the
   library afterwards** — parity with the panel. (A floating surface could stay
   open to try several backgrounds; recorded as a tunable for Ethan, not changed
   here.) Disabled states as the panel's.
3. **Rename / Move / Delete** reuse the hook: `renamePhoto` after a
   `promptDialog` with `requireValue`; `movePhoto` after a `showDialog` `select`
   whose options are `Library Root` + `listFoldersDepthFirst` rows labelled
   `ALL > a > b` (nested folders need the path, not the bare name); `deletePhoto`
   after the **same confirm copy the browser's hover trash uses** — extracted as
   `confirmDeleteMedia(photo)` and exported from the browser so the wording lives
   once.
4. **The Editor switch.** `Editor.jsx` drops `{mediaLibraryOpen &&
   <MediaLibraryPanel />}` from the left-panel row and its import, and mounts
   `{mediaLibraryOpen && <MediaLibraryModal />}` beside the other modals.
   `panelOpen` **keeps** `mediaLibraryOpen`: slide keys stay off and Present
   still asks to close it (the surface floats over the canvas). Entry points and
   the menu command are untouched.
5. ~~`isModalOpen()` gains `mediaLibraryOpen`~~ **Withdrawn — see decision 14.**
6. **The old panel file stays** (unmounted) until P5 deletes it; its
   `inlineStyleBudget` ceiling stays since the file exists.
7. **E2E adaptation, CI-driven.** `visual-library.spec.ts` re-expresses the
   folder step against the modal (click a folder tile; expect the `Move up` tile;
   capture). The four baselines are re-captured by dispatching `e2e.yml` with
   `update_baselines=true` on the branch and committing **exactly those four
   files** (named in the PR — the notes' trap). Any other snapshot that moves is
   a regression to investigate, not to re-baseline.
8. **A source-text mount guard** (`src/pages/__tests__/editorMediaLibraryMount.test.ts`)
   asserts `Editor.jsx` renders `<MediaLibraryModal />` and no longer references
   `MediaLibraryPanel` — the cheap, honest way to pin the switch without rendering
   the whole Editor (precedent: SAVED1's `updatePresentation(` source guard).
9. **Fresh-agent review before coding** (rule 10) — done 2026-09-24; four
   blockers and five should-fixes folded in, marked **[R]** below.
10. **[R B1/B2] Four E2E specs need re-expressing, not one.** `csp`,
    `visual-editor`, `visual-hover` and `visual-library` all press Escape right
    after opening the library as a "popup gone" safety net — inert for the panel,
    **fatal for the modal** (it closes on Escape). `csp` and `visual-editor` also
    click the old footer (`Use` → `Set Slide Background`). All four drop the
    unconditional Escape (or make it conditional like `visual-surfaces`' `menu`
    helper) and drive the pane: click a `[data-media-tile]`, then the pane's
    **`Set slide background`** button (sentence case — one wording, matched
    exactly). `csp` is functional, so this is a red check, not a re-baseline.
11. **[R B3] `raw` must follow rename and move.** The hook patches `fileName` /
    `folderId` on the record but left `raw` stale, so Insert as media slide after a
    rename would label the slide with the old name. `renamePhoto` and `movePhoto`
    also patch `raw.name` / `raw.folder_id`; the hook test asserts it.
12. **[R B4] Test mocks:** the modal test mocks `@/utils/dialog` including
    `showDialog`, and mocks `@/utils/presentationCommands` fully (never
    `importActual` — it drags in the whole IPC surface).
13. **[R S1] Parity, named honestly.** *Added:* right-click on a media tile opens
    a context menu with the same six actions as the pane (the browser gains an
    optional `onPhotoContextMenu(photo, x, y)`; the modal renders our
    `ContextMenu`). *Dropped, recorded:* Delete/Backspace on a selected folder
    (the browser has no folder selection; right-click → Delete with the cascade
    confirm replaces it) and the per-folder item count (the Builder shows none).
14. **[R S2] `isModalOpen()` is NOT changed** (decision 5 withdrawn). Adding
    `mediaLibraryOpen` would silence the presenter's clicker whenever the library
    floats over a live service — a regression from today, where the panel leaves
    arrows/Space working. `panelOpen` keeps gating the Editor's slide keys as it
    does now. `shortcutGuard.test.ts` stays at 5. Whether the library may open
    while presenting at all (`view:mediaLibrary` / `insert:media` have no
    `!isPresenting` gate) is unchanged from today and noted for Ethan.
15. **[R S3] `handlePresent`'s alert is reworded** ("Close the Media Library and
    any open panels before presenting.") — no behaviour change; "close it and
    present" is a tunable for Ethan.
16. **[R S4] Baseline procedure, in order:** push the spec fixes first (a step
    that fails before `toHaveScreenshot` captures nothing); `gh workflow run
    e2e.yml --ref <branch> -f update_baselines=true` (it skips the normal run,
    runs `e2e/visual --update-snapshots`, and **uploads** a `visual-baselines`
    artifact — nothing is committed); `gh run download -n visual-baselines`; copy
    the snapshot dirs over; `git status` must show **exactly the four named PNGs**.
17. **[R S5] Modal width `w-[min(1040px,94vw)]`** so a 4-column grid keeps
    ~175px tiles beside the 280px pane at the 1200px capture width.
18. **[R nits]** The pane's name element carries no `title` (keeps
    `getByTitle` unambiguous in specs; specs use `[data-media-tile]` anyway). The
    pane test asserts `typeof raw.id === 'number'` — Canvas resolves backgrounds
    with `===`. Dialogs paint above the modal by mount order (`DialogHost` is the
    last child of App) — on Ethan's manual list to eyeball.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**Changes:** `src/pages/Editor.jsx` (mount + import; reworded Present alert),
`src/components/library/MediaLibraryModal.tsx` (the pane, tile context menu, width)
+ its test, `src/components/library/MediaLibraryBrowser.tsx` (export
`confirmDeleteMedia`; `onPhotoContextMenu` prop) + its test,
`src/hooks/useMediaLibrary.ts` (`raw` follows rename/move) + its test,
`e2e/csp.spec.ts`, `e2e/visual-editor.spec.ts`, `e2e/visual-hover.spec.ts`,
`e2e/visual-library.spec.ts` (no unconditional Escape; pane-driven steps), the four
`e2e/*-snapshots/*-darwin.png` named above. **Not** `shortcutGuard` (decision 14).
**Adds:** `src/pages/__tests__/editorMediaLibraryMount.test.ts`. This plan, charter
row, notes entry.
**Does not change:** the old panel file, IPC, stores' setters, entry points,
`mediaDropActions`, the menu.
**Must keep working:** every entry point opens the library; Canvas/Filmstrip
refetch on close; drops from the modal onto canvas/filmstrip.

## Todos

- [x] 1. **Red — modal pane tests:** no selection shows the hint; selecting a tile
      shows name/kind/path and the six buttons; **Set slide background** calls
      `setSlideBackground` with the section, slide and **numeric** id and closes;
      **Set section background** likewise; **Insert as media slide** calls
      `insertMediaSlideIntoCurrentPresentation` with the raw row and closes on
      success (stays open on `null`); slide action disabled without a selected
      slide, section/insert disabled without a section; Rename prompts and calls
      `renamePhoto`; Move to… offers `Library Root` + `ALL > …` paths and calls
      `movePhoto`; Delete confirms with the shared copy then `deletePhoto`.
- [x] 2. **Red — guards + hook:** the Editor mount source guard; the hook's
      `raw` follows rename/move; the browser's `onPhotoContextMenu`.
- [x] 3. Pane + `confirmDeleteMedia` export + `isModalOpen` + the Editor switch;
      green.
- [x] 4. Full gate; `format:check`.
- [x] 5. Re-express the four specs (decision 10); push; **E2E on CI**; then the
      baseline procedure of decision 16; commit exactly the four PNGs. *(Specs
      re-expressed and pushed; the baseline re-capture is dispatched on the branch
      and the four PNGs land in a follow-up commit on the same PR — see Review.)*
- [x] 6. Records + PR body: parity table (panel action → pane action), the two
      decisions for Ethan, the manual checklist for his running-window pass.

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; numeric ids asserted exactly; a re-baseline limited to the four named captures |
| Bounded blast radius | Named files; the panel file untouched; entry points untouched |
| Per-todo verification | Todos 1–2 red first; Todo 4 gate; Todo 5 CI E2E |
| Behavior-change test edits | Four E2E specs re-expressed against the pane (the panel's footer is gone; the panel's inert Escape is now a close); four baselines re-captured and named; `shortcutGuard` untouched |
| Required findings report | Todo 6 |
| Data rewrites | N/A |
| Fresh-agent review before coding | Done — 4 blockers + 5 should-fixes folded in ([R]) |
| Manual check | **Owed to Ethan on this PR:** open from toolbar / menu / filmstrip / canvas; set slide + section backgrounds; insert a media slide; drag a tile onto the canvas and the filmstrip while the library floats; Escape from a rename box closes only the box; decide non-dimming vs dimmed; decide import-vs-cap |

## Review

**What changed — the first user-visible slice of the port.**
- `Editor.jsx` mounts `<MediaLibraryModal />` beside the other modals and no
  longer imports or renders the 320px `MediaLibraryPanel`; the Present alert now
  names the Media Library. `panelOpen` still counts `mediaLibraryOpen`.
- `MediaLibraryModal.tsx` gains the right-hand **detail pane** (#156): preview,
  name, kind badge, date, folder path, an **Applying to** line, and six explicit
  actions — **Set slide background** · **Set {Section} background** · **Insert as
  media slide** · **Rename…** · **Move to…** · **Delete** — calling exactly what
  the panel called with the raw row's numeric id, and closing the library after
  applying, as the panel did. Right-clicking a tile opens the same six actions in
  our `ContextMenu` (the browser reports the tile and pointer through a new
  optional `onPhotoContextMenu`). Move offers the root and every folder by its
  full `ALL > a > b` path. Escape now also closes an open tile menu before
  anything else. Width `w-[min(1040px,94vw)]` so four columns keep ~175px tiles
  beside the 280px pane.
- `MediaLibraryBrowser.tsx` exports `confirmDeleteMedia` so the trash icon and
  the pane share one wording.
- `useMediaLibrary.ts`: rename and move now patch the **raw row** too (the review's
  B3 — an inserted media slide would otherwise carry the pre-rename name).
- `isModalOpen()` is **unchanged** (decision 14): adding the library would have
  silenced the presenter's clicker whenever it floats over a live service.
- **Four E2E specs** (`csp`, `visual-editor`, `visual-hover`, `visual-library`)
  no longer press an unconditional Escape after opening the library (that key
  was inert for the panel and closes the modal), and the two that drove the old
  footer now click a tile and the pane's **Set slide background**. `visual-library`
  opens a folder with a single click and expects the **Move up** tile.

**Parity table (panel → pane).** Use ▸ Set Slide Background → *Set slide
background*; Use ▸ Set {Section} Background → *Set {Section} background*; Use ▸
Insert Media Slide → *Insert as media slide*; More ▸ Rename → *Rename…*; More ▸
Move → *Move to…* (with nested paths); Delete → *Delete* (same confirm copy);
right-click on a card → right-click on a tile (same six items); "Applying To"
banner → *Applying to* line. **Dropped, recorded:** Delete/Backspace on a
selected folder (right-click ▸ Delete with the cascade confirm replaces it) and
the per-folder item count (the Builder shows none).

**Tests.** 14 new: the pane (10, incl. exact button order, numeric-id assertions,
disabled states, Rename / Move / Delete through the hook, the tile context menu),
the Editor mount source guard (2), the hook's `raw` following rename and move (2),
the browser's `onPhotoContextMenu` (1; one P3 test amended for the wider dialog).
All red first.

**Gate:** type-check ✓ · lint ✓ · vitest 1205/1205 passed (0 skipped) ·
prettier ✓. Coverage 46.5 / 43.5 / 44.7 / 47.6.

**E2E (CI is the proof).** The four media-library captures change by design:
`editor-media-library.png`, `editor-media-library-items.png`,
`editor-media-library-folder.png`, `hover-media-library-close.png`. Re-captured
by dispatching `e2e.yml` with `update_baselines=true` on the branch and
committing exactly those four files; any other moved snapshot is a regression.

**For Ethan on this PR (running-window check).** Open the library from the
toolbar, the View menu, a filmstrip slide's context menu and the canvas's; set a
slide and a section background; insert a media slide (an image and a video);
drag a tile onto the canvas and onto the filmstrip while the library floats;
Escape from a rename box closes only the box; a Rename / Move / Delete dialog
paints above the library. **Two decisions:** keep the non-dimming floating
surface (drag-out works) or dim and lose drag-out; accept that a multi-select
import does not enforce the cap. **Tunables noted:** close-after-apply vs stay
open; "close it and present" instead of the alert.

**Fresh review.** Four blockers (the Escape presses in four specs; the old
footer clicks in two; `raw` going stale; the modal test's mocks) and five
should-fixes folded in ([R] above). New traps in the notes.
