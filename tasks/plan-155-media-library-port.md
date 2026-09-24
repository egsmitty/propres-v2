# Executable Plan #155 — Port the Builder media-library UX onto sqlite + IPC

**Issues:** #155 (reimagine the media/image library), #156 (the confusing
Use/More/Insert/Select buttons). Ethan's directive: bring Motion-Worship
**Builder**'s media-library *system* into PresenterPro — copy its UX, do **not**
touch the Builder repo, and reformat it to our systems (local sqlite + IPC,
Tailwind 4 tokens, our media protocol, our background / media-slide model).

This is redesign-scale and spans several PRs. This file is the charter for the
whole port; each phase below becomes its own plan + PR. **Nothing here is coded
until Ethan confirms the open decisions (Part D) and a fresh-agent review of the
concrete Phase 1 plan has run (governance rule 10).**

Branch base `main` @ `748d8f5` (#169).

---

## A. What the Builder gives us (source: /Users/ethansmith/Desktop/ClaudeAccess/builder)

Read-only reference. The real UX is one shared component plus pure logic:

- **`packages/templates/src/editors/MediaLibraryBrowser.tsx`** (~1032 lines) — the
  whole library UX: folder grid, "move up" tile, breadcrumb pill bar, an
  explorer-style folder dropdown, recursive search, native HTML5 drag-and-drop
  (photo→folder, folder→folder, drop-to-canvas), a 500-item cap with a live
  counter, hover-trash photo delete with inline confirm, cascade folder delete
  with exact counts, optimistic upload spinner tiles, and surface-aware chrome.
  It depends on **only one data contract**, `MediaLibraryProp`.
- **`packages/templates/src/editors/mediaFolders.ts`** (~241 lines) — **100% pure,
  zero imports.** Folder-tree math: `countLibraryItems`, `isAtLibraryCap`,
  `folderLocationDepth` (cycle-safe), `canCreateFolderIn`, `canMoveFolder`,
  `collectCascadeDescendants`, `buildFolderPath`, `childFoldersOf` (name-sorted),
  `photosIn`, `listFoldersDepthFirst`, `searchLibraryPhotos` (recursive, matches
  fileName + altText), `folderNameValid`. Constants: `LIBRARY_ITEM_CAP=500`,
  `MAX_FOLDER_PATH_DEPTH=3`, `FOLDER_NAME_MAX_LENGTH=20`.
- **`dragAutoScroll.ts`**, **`blocks/mediaDragTypes.ts`** — pure DnD helpers.
- Types (`MediaPicker.tsx`): `MediaFolder { folderId, name, parentId, createdAt }`,
  `MediaLibraryPhoto { mediaId, fileName, mediaType, urls{original,large,medium,small},
  altText?, folderId?, createdAt }`, and the seam **`MediaLibraryProp`**
  (photos, loading, fetchPhotos, deletePhoto, folders?, totalCount?, atCap?,
  createFolder?, renameFolder?, moveFolder?, deleteFolder?, movePhoto?,
  uploadFiles?, pendingUploads?).

**Cloud-only, we do NOT port:** `useMediaLibrary.ts` (rewritten against our IPC),
`mediaFolderStore.ts` (DynamoDB), `uploadMediaPresigned.ts` (S3), `ImageUploader`
(presigned + CloudFront lag), `app/media/page.tsx` ("Coming Soon" placeholder).
**External deps to swap:** `TrashIcon` (FontAwesome) → lucide `Trash2`;
`FormComponents.Input` → our labeled input; `EDITOR_FIELD_LIMITS.folderName:20` →
one local constant; `EditorSurfaceContext` → a plain `surface` prop or our
tokens; Tailwind v3 gray/indigo/red/amber classes → our Tailwind-4 token classes.

## B. What we already have (target: presenter-pro/)

- **`src/components/library/MediaLibraryPanel.jsx`** (662 lines) — a fixed **320px
  left side panel** with images/videos tabs, a **flat** folder grid, Import / New
  Folder / Search, a 2-col media grid with drag-drop, and the **Use / More (…) /
  Delete** footer that #156 calls confusing. Opened via `appStore.mediaLibraryOpen`
  (rendered `Editor.jsx:362`, mutually exclusive with the song/new-song panels).
- **Data model already has folders** (`electron/db/migrationList.ts`): `media`
  (id, name, type `image|video`, file_path, canonical_path, thumbnail_path,
  duration, tags, created_at, **folder_id**), and `media_folders` (id, name,
  created_at) — **flat, no `parent_id`, no nesting, no cap.** `media.folder_id`
  has no FK; folder delete cascades its media in a transaction.
- **Files are referenced in place** (absolute `file_path`), never copied to
  userData; served to the renderer via the privileged **`presenterpro-media://`**
  protocol. `serializeMediaRecord` adds `file_exists`, `file_url`,
  `thumbnail_url`, `preview_url`.
- **IPC** (`shared/ipcContract.ts` + `electron/main/index.js` + `src/utils/ipc.ts`,
  envelope `{success,data|error}`): `getMedia`, `getMediaFolders`,
  `createMediaFolder`, `createMedia`, `updateMediaFolder(id,{name})`,
  `deleteMediaFolder(id)`, `importMedia({folderId})`, `pickMedia({kind})`,
  `updateMedia(id,fields)`, `deleteMedia(id)`. Query layer: `electron/db/queries/media.js`.
- **Consumption:** a slide/section `backgroundId = media.id`, resolved lazily by
  `SlideRender`/`OutputRenderer`/`Canvas` against a `mediaLibrary` array
  (`backgrounds.js`); media slides via `sectionTypes.isMediaSlide` +
  `presentationCommands.insertMediaSlideIntoCurrentPresentation`. Drag-drop uses
  MIME **`application/presenterpro-media-id`** consumed by `mediaDropActions.js`
  (Canvas, Filmstrip) — **the port must keep setting this MIME** or those drops
  break.
- **Conventions:** renderer talks to main only through `src/utils/ipc.ts`; new
  channels need the 3-part trio (contract row + handler + wrapper), enforced by
  `ipcChannels`/`ipcRegistry` tests; schema changes are new numbered migrations
  via `addColumnIfMissing`, never edits to `baselineSchema`; JS + JSDoc + `tsc`;
  Vitest colocated in `__tests__/`; Tailwind-4 tokens (`bg-bg-surface`,
  `border-border-default`, `text-text-primary`, `var(--accent)`); dialogs via
  `src/utils/dialog.js`; the **inline-style ratchet** caps `MediaLibraryPanel.jsx`
  at 7 (`src/__tests__/inlineStyleBudget.test.ts`) and fails in both directions.

## C. Port strategy — the seam

`MediaLibraryBrowser` depends only on `MediaLibraryProp`. So the port is:
1. **Port the pure logic + the browser component** (reskinned), keeping the
   `MediaLibraryProp` contract as the boundary.
2. **Write our own `useMediaLibrary` hook** implementing that contract over our
   IPC. An **adapter** maps our serialized `MediaRecord` → `MediaLibraryPhoto`
   (`mediaId=String(id)`, `fileName=name`, `urls.small=thumbnail_url||file_url`,
   `urls.large/original=file_url`, `folderId=folder_id`, `mediaType` from our
   `type`) and our folder row → `MediaFolder` (`parentId` from the new column).
3. **Nest folders**: a migration adds `parent_id` to `media_folders`; new/extended
   IPC lets a folder be created under a parent and moved; cascade delete uses the
   ported `collectCascadeDescendants`.

## D. Decisions (confirmed by Ethan, 2026-09-23)

1. **Modal, replacing the panel.** Retire the 320px left side panel; the media
   library becomes a centered **pop-up modal** opened from the same entry points
   (toolbar, filmstrip, canvas "Set Background").
2. **One unified grid + type filter.** Images and videos share folders; a filter
   toggles All / Images / Videos. Video tiles keep today's muted autoplay
   thumbnail.
3. **Keep a generous cap.** Adopt the Builder's cap machinery with the live
   counter and at-cap warning, but a generous local limit — `LIBRARY_ITEM_CAP =
   1000` (tunable one-liner). Folders and media both count, matching the Builder.
4. **Nested folders, 3 levels** (ALL > folder > subfolder), matching the Builder
   (`MAX_FOLDER_PATH_DEPTH = 3`).
5. **Detail pane + explicit buttons + drag (#156).** Selecting a tile opens a
   right-hand preview with explicit buttons — **Set slide background**, **Set
   section background**, **Insert as media slide**, plus **Rename** / **Delete** —
   and a tile can still be dragged onto the canvas/filmstrip (our existing
   `application/presenterpro-media-id` MIME + `mediaDropActions`). This replaces
   the ambiguous Use / More / Delete footer.

## E. Phased delivery (each = one plan + PR)

- **Phase 1 — data-layer foundation (decision-light).** A new numbered migration
  adds `media_folders.parent_id INTEGER` (nullable; existing folders stay root).
  `queries/media.js` gains: `createMediaFolder(name, parentId)`,
  `updateMediaFolder(id, { name?, parent_id? })`, and a recursive
  `getMediaFolderDescendants(id)` (folders + media) for cascade delete and
  move-legality. IPC trio updated for the new args (contract + handler + wrapper).
  Query + migration tests (`electron/db/__tests__/`). No UI change. **This PR.**
- **Phase 2 — pure logic port.** Port `mediaFolders.ts` (folder-tree math, cap,
  recursive search, cascade, move legality; `LIBRARY_ITEM_CAP=1000`,
  `MAX_FOLDER_PATH_DEPTH=3`) and `dragAutoScroll.ts` into `src/utils/`, keeping
  the Builder's shapes (`MediaFolder`, `FolderedPhotoLike`) so the browser ports
  cleanly; full unit tests. Standalone, no wiring.
- **Phase 3 — the browser + modal + hook (landed unmounted; the Editor switch is
  Phase 4).** **Hard requirement carried from the P1 review:** the folder-delete confirm must state the *cascade* counts (every
  descendant folder + every media row in the subtree, via the ported
  `collectCascadeDescendants`) — the old panel counts direct children only and
  is wrong the moment nesting is exposed. Port `MediaLibraryBrowser` reskinned
  to our tokens (drop `EditorSurfaceContext`, swap TrashIcon → lucide, Input →
  ours, use `dialog.js` + `ContextMenu`). Write `useMediaLibrary` over our IPC +
  an adapter (our `MediaRecord` ↔ `MediaLibraryPhoto`/`MediaFolder`). Mount in a
  modal driven by `mediaLibraryOpen`, with the unified grid + type filter and the
  cap counter. Component test.
- **Phase 4 — actions (#156) + the Editor switch (landed; the modal is live).** Add the Part-D.5 detail pane
  (Set slide bg / Set section bg / Insert as media slide / Rename / Move / Delete),
  confirm Canvas/Filmstrip drops still work from the new surface, then **swap the
  mount in `Editor.jsx`** from the panel to the modal — the first user-visible
  change, and Ethan's running-window check. (Video tiles shipped in P3.)
- **Phase 5 — cleanup (landed).** The old panel deleted; its inline-style ceiling
  removed (the ratchet's exactness check was the red); `CLAUDE.md` refreshed. The
  port is complete; the open product calls are listed in §H.

## F. Blast radius (whole port; each phase names its own slice)

**Will add:** `src/utils/mediaFolders.js` (+test), drag helpers, `src/hooks/useMediaLibrary`
(or `src/utils/`), `src/utils/mediaLibraryAdapter`, a new
`MediaLibraryModal`/`MediaLibraryBrowser` under `src/components/library/`, a new
migration in `electron/db/migrationList.ts`, a recursive-descendants query in
`electron/db/queries/media.js`, one IPC extension (parent_id on updateMediaFolder;
possibly a `moveMediaFolder`). **Will change:** `Editor.jsx` (render the modal),
`appStore` only if a new open-state is needed, `inlineStyleBudget.test.ts`.
**Must NOT break:** the `presenterpro-media://` protocol, `mediaDropActions.js`
consumers (Canvas, Filmstrip), background/media-slide resolution in `SlideRender`,
existing media rows and folders. **Must NOT touch:** the Builder repo (read-only).

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## G. Compliance Manifest (writing-executable-plans.mdc) — charter level

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; each phase's tests pin behavior, no loosening |
| Bounded blast radius | Part F; each phase re-scopes to its slice |
| Per-todo verification | Each phase plan lists suites + a gate |
| Behavior-change test edits | Phase 4 retunes the inline-style ratchet; named there |
| Required findings report | Each phase PR body |
| Data rewrites | Phase 1 migration only *adds* a nullable column; no row rewrite |
| Fresh-agent review before coding | Required on the concrete Phase 1 plan (rule 10) |
| Third-party code | Builder repo is read-only reference; ported files are re-authored to our conventions, not imported |

## Review

_(appended when the port completes)_

## H. Addenda from the port so far (2026-09-24)

- **Mount sequencing.** P3 landed the modal, browser, hook and adapter with
  `Editor.jsx` still mounting the old panel; P4 swaps the mount once the detail
  pane gives feature parity; P5 deletes the panel. `main` never loses a
  capability between PRs.
- **A floating, non-dimming surface, not a dimmed modal.** D.1 (modal) and D.5
  (drag a tile onto the canvas/filmstrip) conflict under a blocking backdrop, so
  the library is a centred `role="dialog"` panel with pointer events passing
  through around it, closed by X or Escape. **Ethan decides on P4** whether to
  keep drag-out or dim.
- **Import, not upload.** Media is registered by path via the native picker;
  Electron 44 has no `File.path`. OS-file drop onto the grid and optimistic
  upload tiles need a preload `webUtils.getPathForFile` plus a `media:register`
  channel — a follow-up, not in P3–P5. A multi-select import does not enforce the
  cap (accepted for a generous 1000; the counter turns red).
- **Tiles are `aspect-video`** (16:9 backgrounds), not the Builder's square.
- **Video tiles** ship in P3 as `preload="metadata"` + poster, play on hover —
  not autoplay — so a four-column library never decodes every visible video.
- **Constants:** `LIBRARY_ITEM_CAP = 1000` (D.3); `FOLDER_NAME_MAX_LENGTH = 40`
  (the Builder's 20 is its editor-field affordance) — one line to change.
- **Guards widened for `.tsx` components** (P3): `keyboardReachability` walks
  `.tsx`; the eslint hex rule covers `.tsx` components and skips tests; the
  `escapeConsumed` overlay table is 8; `HOVER_HANDLER_BUDGET` lists the video
  tile's play-on-hover as behaviour.
- **P4 findings.** Four E2E specs pressed an unconditional Escape after opening
  the library as a "menu gone" safety net — inert for the panel, a close for the
  modal; they now press it only if the View menu's entry lingers. The library is
  deliberately **not** added to `shortcutGuard.isModalOpen()`: it would silence
  the presenter's clicker whenever the library floats over a live service, a
  regression from today. Whether the library may open at all while presenting
  (`view:mediaLibrary` / `insert:media` carry no `!isPresenting` gate) is
  unchanged and Ethan's to decide.
