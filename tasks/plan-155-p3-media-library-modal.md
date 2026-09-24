# Executable Plan #155-P3 — The ported media-library browser, its hook, and the modal

**Parent charter:** `plan-155-media-library-port.md` (Phase 3). **Issue:** #155.
Port the Builder's `MediaLibraryBrowser` onto PresenterPro — our tokens, our
dialogs and context menu, our `presenterpro-media://` assets, our drag MIME —
backed by a new `useMediaLibrary` hook that implements the Builder's
`MediaLibraryProp` contract over `@/utils/ipc`, hosted in a new
`MediaLibraryModal`. Base: `main` @ `43f5e09` (#173 / P2 merged — this consumes
`src/utils/mediaFolders.ts` and `dragAutoScroll.ts`). One PR.

**Sequencing:** P3 lands the modal, browser, hook and adapter as **fully tested
components that `Editor.jsx` does not mount yet.** The old 320px panel stays the
live surface. **P4** adds the detail-pane actions (#156) and the Canvas/Filmstrip
drag parity, then **swaps the mount** — one small switch made only when
everything the panel does today is covered. **P5** deletes the panel. `main`
never loses a capability between PRs; Ethan verifies the new surface in a
running window on P4.

A fresh-agent review of the first draft of this plan (2026-09-24) found five
blockers and nine should-fixes; every one is folded in below and marked **[R]**.

---

## Measured (read 2026-09-24)

**Builder** (read-only): `MediaLibraryBrowser.tsx` (1032 lines), one component
over the `MediaLibraryProp` seam (`MediaPicker.tsx:53-69`); portals for the
folder context menu, create/rename modal and cascade confirm; a two-way surface
class fork; `mediaDragTypes` MIME types; RAF edge auto-scroll; a root
`<div onClick={() => setContextMenu(null)}>`; "+ Folder" title and blocked-hint
hardcode "3 levels"; the dropdown closes only via `navigateTo`.

**Ours:** `MediaLibraryPanel.jsx` (662 lines) — see the charter §B. Drag MIME
`application/presenterpro-media-id` carries the numeric id as a string; the
consumers parse it with `Number(...)` + `isFinite` (`Canvas.jsx:1066`,
`Filmstrip.jsx:717`). Dialogs: `confirmDialog / promptDialog(message, default,
{ requireValue, placeholder }) / alertDialog` over `useDialogStore` (`dialog`
non-null while one is open). `ContextMenu({ x, y, items, onClose })` closes
itself on document mousedown and on Escape. Escape contract (plan L1,
`escapeKey.ts`): overlays register a **window capture-phase** keydown listener and
call **`preventDefault()` only** — never `stopPropagation` — so the Editor's
listener sees `defaultPrevented`. `VersionHistoryModal.jsx:173-188` chains
"preview pane first, then the modal" through a ref.

**Guards that matter [R]:**
- `AGENTS.md:57` — **every new file is TypeScript** (`.ts`/`.tsx`). There are no
  `.tsx` components yet.
- `src/__tests__/keyboardReachability.test.ts:25` walks **`.jsx` only**; a `.tsx`
  component would escape its mouse-only-div rule.
- `eslint.config.mjs:43` — the raw-hex-colour rule is `files: ['src/**/*.jsx']`.
- `src/components/shared/__tests__/escapeConsumed.test.tsx:175` — **frozen table
  of 7 overlays** that handle Escape; its length is asserted.
- `inlineStyleBudget.test.ts` and `importCycles.test.ts` already include `.tsx`;
  unlisted files have an inline-style ceiling of 0.
- `tsconfig.json`: `jsx: react-jsx`, `include: src/**/*`, `allowJs` — `.tsx`
  components need no config.

## Decisions

1. **All new files are TypeScript [R B1].** `src/utils/mediaLibraryAdapter.ts`,
   `src/hooks/useMediaLibrary.ts`, `src/components/library/MediaTilePreview.tsx`,
   `MediaLibraryBrowser.tsx`, `MediaLibraryModal.tsx`, and `.tsx`/`.ts` tests.
2. **Widen the two `.jsx`-only guards to `.tsx` in this PR [R B2]:**
   `keyboardReachability.test.ts` extensions → `['.jsx', '.tsx']`; the eslint
   hex-colour rule → `src/**/*.{jsx,tsx}`. The browser's root has **no
   `onClick`** (our `ContextMenu` closes itself); the modal has **no click-outside
   backdrop** (decision 9), so nothing needs `data-backdrop`.
3. **Adapter + our own contract types [R S1, S2].** `mediaLibraryAdapter.ts`
   declares `MediaKind = 'image' | 'video'`, `LibraryMedia` (our photo type: the
   Builder's fields the browser reads — `mediaId`, `fileName`, `urls`, `altText?`,
   `folderId` — plus `mediaType: MediaKind`, `fileExists`, `createdAt`, `raw`) and
   `MediaLibraryProp` (the seam, with our `importMedia(folderId)` and
   `renamePhoto` in place of the Builder's `uploadFiles`/`pendingUploads`).
   `toLibraryPhoto(row)`: `mediaId = String(id)`, `fileName = name`, `mediaType =
   type`, `urls.small = getMediaAssetUrl(row, { preferThumbnail: true })`,
   `urls.large = urls.original = getMediaAssetUrl(row)`, `urls.medium =
   preview_url ?? large`, `folderId = folder_id == null ? null : String(folder_id)`,
   `createdAt = created_at ? ISO(created_at * 1000) : ''`, `fileExists =
   file_exists !== false`. `toLibraryFolder(row)` likewise with `parentId`.
   **`toDbId(s)` accepts only `/^\d+$/`** (`Number('')` is 0 and finite), else
   `null`. Drag MIME payload is `photo.mediaId` itself, never `String(toDbId())`.
4. **Hook `useMediaLibrary()`** implements `MediaLibraryProp` over `@/utils/ipc`:
   `fetchPhotos` (getMedia + getMediaFolders in parallel → adapt); **`loading` is
   true only until the first fetch resolves [R S3]** so refetches never unmount
   the grid; `createFolder` → `createMediaFolder({ name, parentId })` guarded by
   `canCreateFolderIn`; `renameFolder`; `moveFolder` → `updateMediaFolder(id,
   { parent_id })` **guarded by `canMoveFolder` in the hook too [R S7]** (the data
   layer refuses self/subtree; depth is a UI rule, and P4's "Move…" must not
   bypass it); `deleteFolder` → `deleteMediaFolder` then refetch (the cascade is
   the truth); `movePhoto` → `updateMedia(id, { folder_id })`; `deletePhoto`;
   `renamePhoto`; `importMedia(folderId)` → `importMedia({ folderId })`, refetch
   **only when `data.length`** (cancel returns an empty array) [R S6];
   `totalCount`/`atCap` from `countLibraryItems`/`LIBRARY_ITEM_CAP`. **Every
   `success:false` envelope refetches and `alertDialog`s the error**; a hook-side
   guard refusal alerts with the reason and makes no IPC call.
5. **Import, not upload.** Media is registered by path through the native picker;
   Electron 44 has no `File.path`. The Builder's `uploadFiles`/OS-file-drop/
   `pendingUploads` do not port (follow-up: preload `webUtils.getPathForFile` +
   a `media:register` channel — charter addendum). **The cap is not enforced
   inside a multi-select import [R S6]**: at 990/1000 a 50-file import lands 1040
   and further imports are then blocked. Accepted for a generous local cap and
   recorded; the counter turns red. `fileDropNavGuard` is skipped (SEC1 #139
   already allow-lists navigation).
6. **Reskin to tokens; drop the surface fork.** Chips `rounded-md border
   border-border-default bg-bg-app text-text-primary hover:bg-bg-hover
   disabled:opacity-50`; crumb bar `rounded-full border border-border-default
   bg-bg-app`; tiles `border-border-default hover:border-accent`; drop target
   `border-accent bg-accent/12`; blocked hint + near-cap counter `text-danger`.
   lucide `Folder`, `FolderUp`, `Trash2`, `Search`, `ChevronDown`,
   **`TriangleAlert`** (not `AlertTriangle`) [R nit]. Depth copy derives from
   `MAX_FOLDER_PATH_DEPTH` [R nit]. **Zero inline `style={{}}`** in new files.
7. **Our dialogs and menu for the Builder's portals [R S5].** Folder right-click →
   `ContextMenu` (Open / Rename / Delete). Create/rename → `promptDialog` with
   `requireValue`; an over-length name → `alertDialog` then **re-prompt seeded
   with the typed value** (a loop, mirroring `requireValue`), so text is never
   lost. Cascade delete → `confirmDialog` stating the exact counts from
   `collectCascadeDescendants` (media + subfolders) and that files on disk are not
   deleted. Media delete → `confirmDialog` (danger). The Explorer-style dropdown
   stays; **closing it on outside click and Escape is our addition**, not the
   Builder's [R nit].
8. **Unified grid + type filter (charter D.2), video in P3 [R S9].** Chips All /
   Images / Videos filter media and search results; folders always show. Tiles are
   `aspect-video` (our 16:9 backgrounds; recorded deviation from `aspect-square`).
   `MediaTilePreview`: `<img>`; **`<video preload="metadata" muted playsInline
   poster={thumbnail}>` that plays on hover and pauses on leave** — not autoplay,
   so a 4-column modal never decodes every visible video at once; "Missing File"
   keyed on `file_exists === false`. Default `columns = 4`. Selection clears when
   its item disappears (`useClearWhenMissing`).
9. **A floating, non-dimming surface — so drag-to-canvas survives [R B5].**
   Charter D.5 (Ethan's call) keeps dragging a tile onto the canvas/filmstrip; a
   `fixed inset-0 bg-black/60` backdrop would make that impossible. The modal is a
   centered `role="dialog"` panel (`w-[min(920px,92vw)] max-h-[85vh]`, elevated
   shadow) inside a **`pointer-events-none` wrapper**, the panel itself
   `pointer-events-auto`; **no dimming, no click-outside close** — it closes on
   its X or Escape. The filmstrip and the canvas edges stay reachable behind it.
   **Flagged for Ethan on the P4 PR**: if he prefers a dimmed, blocking modal,
   drag-out goes and D.5 is revised.
10. **Escape chain [R B3, B4].** The modal registers a **window capture** keydown
    listener that calls **`preventDefault()` only** (no `stopPropagation`, or the
    search box and `ContextMenu` inside it would never see the key). Chain:
    **a dialog is open (`useDialogStore.getState().dialog`) → return without
    touching the event** (the dialog owns it; otherwise Escape in a rename box
    would close the whole library); else the browser's `consumeEscape()` (via
    `useImperativeHandle`) closes the dropdown, then the context menu, then
    clears search — returning `true` if it did; else close the modal. The
    **`escapeConsumed` table grows to 8** with a `Media Library` row.
11. **Selection, not action, in P3.** `onPhotoClick` reports the pick; the
    browser highlights `selectedMediaId`. The detail pane is P4.
12. **Text:** "photos" → "media", "Upload" → "Import".

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius [R S8]

**Adds:** `src/utils/mediaLibraryAdapter.ts`, `src/hooks/useMediaLibrary.ts`,
`src/components/library/MediaTilePreview.tsx`, `MediaLibraryBrowser.tsx`,
`MediaLibraryModal.tsx`, and tests `src/utils/__tests__/mediaLibraryAdapter.test.ts`,
`src/hooks/__tests__/useMediaLibrary.test.tsx`,
`src/components/library/__tests__/MediaLibraryBrowser.test.tsx`,
`MediaLibraryModal.test.tsx`.
**Changes (guards only):** `src/__tests__/keyboardReachability.test.ts` (walk
`.tsx` too), `eslint.config.mjs` (hex rule covers `.tsx`),
`src/components/shared/__tests__/escapeConsumed.test.tsx` (7 → 8 overlays, a
`Media Library` case). This plan, a charter addendum, the notes entry.
**Does not change:** `Editor.jsx`, `appStore`, the panel, IPC. **Corrected while
coding:** `inlineStyleBudget.test.ts` *does* change — not its inline-style ceilings
(the new files sit at 0) but its `HOVER_HANDLER_BUDGET`, which counts every
`onMouseEnter` regardless of purpose; the video tile's play-on-hover is behaviour,
not a painted look, and gets a one-handler entry with that reason. The eslint hex
rule, once widened to `.tsx`, also reached test fixtures for the first time; it is
scoped to components with an `ignores` for tests.
**Must keep working:** Canvas/Filmstrip drops (`application/presenterpro-media-id`
= the numeric id string), `presenterpro-media://` resolution.
**Not testable in jsdom, said plainly:** edge auto-scroll and drop-target
geometry (`getBoundingClientRect` is zeros); hover-to-play video (`play()` is a
no-op in jsdom — the handler wiring is asserted, not playback).

## Todos

- [x] 1. **Red — adapter:** ids stringified; `null` folder/parent preserved;
      `urls` via `getMediaAssetUrl` (thumbnail-first `small`); `createdAt` ISO
      from seconds, `''` when null; `fileExists` false only when the row says so;
      `toDbId` → `null` for `''`, `' '`, `'1e3'`, `'0x10'`, `'abc'`, `null`.
- [x] 2. **Red — hook** (`@/utils/ipc` + `@/utils/dialog` mocked): fetch adapts
      both lists; `loading` true only until the first fetch; `createFolder` sends
      a numeric `parentId` (or `null`) and refuses at max depth with an alert and
      no call; `moveFolder` sends `parent_id` numeric/`null` and refuses
      self/subtree/over-depth with an alert and no call; `movePhoto` sends
      `folder_id`; `deleteFolder` refetches; `deletePhoto` drops locally;
      `importMedia` refetches only when items came back; a `success:false`
      envelope alerts the error and refetches; `totalCount`/`atCap` derive from
      `LIBRARY_ITEM_CAP`.
- [x] 3. **Red — guards:** `escapeConsumed` gains the `Media Library` case (count
      → 8); `keyboardReachability` walks `.tsx`; eslint hex rule covers `.tsx`.
- [x] 4. **Red — browser:** root shows folders name-sorted then media tiles;
      clicking a folder navigates (breadcrumb `ALL > name`, Move-up tile);
      breadcrumb `ALL` returns; **dropdown rows show `ALL > a > b` paths**; type
      filter hides videos / images; search is recursive with the folder-path
      caption; counter `n / LIBRARY_ITEM_CAP`, **red at cap−10 and the at-cap
      banner at the cap**; "+ Folder" disabled at max depth with a
      constant-derived title; **cascade delete on a nested fixture** (folder →
      subfolder → media) confirms with both counts and only then calls
      `deleteFolder`; media drag sets our MIME to the exact id string; a video row
      renders `<video>` with `preload="metadata"` and no `autoPlay`;
      `file_exists:false` → "Missing File"; selected tile carries the ring class;
      Escape in the search box clears it; `consumeEscape()` returns true while the
      dropdown is open and false when nothing is open.
- [x] 5. **Red — modal:** renders the dialog with the browser; X sets
      `mediaLibraryOpen` false; Escape closes and is consumed; **Escape while a
      dialog is open does not close the library**; Escape with the dropdown open
      closes the dropdown and keeps the library open.
- [x] 6. Adapter → hook → `MediaTilePreview` → browser → modal; green.
- [x] 7. Full gate; `format:check`; `inlineStyleBudget` untouched (new files at 0);
      re-measure coverage.
- [x] 8. Records: this plan's Review; charter addendum (upload follow-up, the
      P3→P4 mount sequencing, the non-dimming surface, `aspect-video`, video in
      P3); notes entry. PR body with the fidelity-deviations table and the two
      items flagged for Ethan (non-dimming surface; import ignores the cap).

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact strings/arrays; ids asserted as the exact numeric strings; nested cascade fixture so the count cannot pass by accident |
| Bounded blast radius | New files + three guard files; must-keep-working list |
| Per-todo verification | Todos 1–5 red first; Todo 7 full gate + ratchets |
| Behavior-change test edits | `escapeConsumed` 7 → 8 (a new overlay, not a loosening); `keyboardReachability` and the eslint glob widen their scope — both only tighten |
| Required findings report | Todo 8 |
| Data rewrites | N/A |
| Fresh-agent review before coding | Done; 5 blockers + 9 should-fixes folded in (marked [R]) |
| Third-party code | Ported from the Builder (Ethan's repo), reformatted; provenance docblocks; Builder untouched |
| Manual check | None owed in P3 (unmounted); owed on P4's mount PR, where the non-dimming surface is Ethan's to confirm |

## Review

**What changed.** Five new TypeScript files and three guard edits; nothing the
user can reach yet (the Editor still mounts the old panel — the switch is P4).
- `src/utils/mediaLibraryAdapter.ts` — our contract types (`LibraryMedia`,
  `MediaLibraryProp`) and the row adapters; `toDbId` accepts digits only.
- `src/hooks/useMediaLibrary.ts` — the Builder's hook over `@/utils/ipc`:
  first-fetch-only `loading`, hook-level `canCreateFolderIn`/`canMoveFolder`
  guards, refetch + `alertDialog` on every failed envelope, import via the native
  picker with a refetch only when files came back.
- `src/components/library/MediaTilePreview.tsx` — thumbnail-first image; video
  as `preload="metadata"` + poster, play on hover, pause on leave; "Missing File"
  keyed on `file_exists === false`.
- `src/components/library/MediaLibraryBrowser.tsx` — the Builder's browser,
  reskinned to tokens: breadcrumb + Explorer dropdown (closes on outside click and
  Escape — our addition), recursive search with path captions, All / Images /
  Videos filter, cap counter (red within 10, banner at the cap), Import / Folder
  chips, `aspect-video` tiles, our drag MIME with the exact id string, folder
  drag with `canMoveFolder` + the always-mounted blocked hint + edge auto-scroll,
  `ContextMenu` for folder actions, `promptDialog` loop that never loses an
  over-length name, cascade delete confirmed with exact media + subfolder counts,
  `consumeEscape()` for the host's Escape chain. Depth copy derives from the
  constant. No root click handler; zero inline styles.
- `src/components/library/MediaLibraryModal.tsx` — a floating, **non-dimming**
  `role="dialog"` (pointer-events pass through around it) so a tile can still be
  dragged onto the canvas or filmstrip (charter D.5); X or Escape closes it.
  Escape: window capture, `preventDefault()` only; an open dialog owns the key;
  then the browser's popovers; then close.
- Guards: `keyboardReachability` walks `.tsx`; the eslint hex rule covers `.tsx`
  components (and now explicitly skips tests); `escapeConsumed` table 7 → 8 with
  a `Media Library` row; `HOVER_HANDLER_BUDGET` gains `MediaTilePreview.tsx: 1`.

**Fidelity vs the Builder (recorded deviations).** Upload / OS-file drop /
optimistic tiles → native Import (no `File.path` in Electron 44; follow-up in the
charter). `fileDropNavGuard` skipped (SEC1 allow-lists navigation). Surface fork
→ one token set. Portals → our `ContextMenu` + dialogs. `aspect-square` →
`aspect-video`. FontAwesome/inline SVG glyphs → lucide. Dimming modal → floating
non-dimming surface (for D.5). Dropdown outside-click/Escape close added.
Photos → media, Upload → Import. Video autoplay → hover-to-play.

**Tests.** 58 new: adapter (8), hook (14), browser (24), modal (5), plus the
Escape-table row; the widened `keyboardReachability` and the hex rule now cover
the new components. All red first (unresolved imports), then green. Not claimed:
edge auto-scroll and drop-target geometry (jsdom has no layout); hover-to-play
asserts the element's attributes, not playback.

**Gate:** type-check ✓ · lint ✓ · vitest 1191/1191 passed (0 skipped) ·
prettier ✓. Coverage rose to 46.1 / 43.2 / 44.0 / 47.2.

**Two things flagged for Ethan (decide on P4, where the surface first appears):**
the non-dimming floating surface (vs a dimmed modal that would end drag-out),
and a multi-select import not enforcing the cap (accepted for a generous 1000).

**Fresh review.** Five blockers and nine should-fixes from the pre-coding review
are all in (marked [R] above). Three more traps surfaced while coding and are in
the notes: a widened `.jsx` lint rule reaching test fixtures; the
set-state-in-effect rule wanting the inner-async-function shape; the hover
ratchet counting every `onMouseEnter`.
