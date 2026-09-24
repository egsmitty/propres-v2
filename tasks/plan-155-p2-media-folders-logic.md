# Executable Plan #155-P2 — Port the Builder's pure media-folder logic

**Parent charter:** `plan-155-media-library-port.md` (Phase 2). **Issue:** #155.
The Builder's `MediaLibraryBrowser` stands on one pure module,
`mediaFolders.ts` (folder-tree math, cap, recursive search, cascade counts, move
legality), plus a tiny `dragAutoScroll.ts`. This PR ports both into
`src/utils/` as standalone, fully tested TypeScript. **Nothing imports them yet**
— Phase 3 (the browser + modal) is the first consumer. Branch base `main` @
`f1ef16a` (#171 merged). One PR.

Source (read-only, never edited): `/Users/ethansmith/Desktop/ClaudeAccess/builder/
packages/templates/src/editors/mediaFolders.ts` and `dragAutoScroll.ts` (their
#327 rework). The Builder has **no dedicated tests** for either, so the tests
here are written from the functions' documented contracts.

---

## Measured (read 2026-09-24)

- `mediaFolders.ts` (241 lines) is **100% pure, zero imports**: `MediaFolder`
  `{ folderId, name, parentId, createdAt }`, `FolderedPhotoLike`
  `{ mediaId, fileName, altText?, folderId? }`, constants `LIBRARY_ITEM_CAP`
  (500), `MAX_FOLDER_PATH_DEPTH` (3), `FOLDER_NAME_MAX_LENGTH` (20), and
  `countLibraryItems`, `isAtLibraryCap`, `folderLocationDepth` (cycle → fails
  closed at max+1), `subtreeHeight`, `isDescendantOrSelf`, `canCreateFolderIn`,
  `canMoveFolder`, `collectCascadeDescendants` (BFS; folders + photos),
  `buildFolderPath`, `childFoldersOf` (case-insensitive name sort), `photosIn`,
  `listFoldersDepthFirst` (dropdown rows with name paths), `searchLibraryPhotos`
  (recursive; fileName + altText; blank → `[]`), `folderNameValid`.
- `dragAutoScroll.ts`: `AUTO_SCROLL_EDGE_PX` (48), `AUTO_SCROLL_STEP_PX` (9),
  `autoScrollDirection(rectTop, rectBottom, clientY, edge)` → -1 | 0 | 1, zones
  never overlap on short containers (`min(edge, height/2)`).
- Our repo: pure utils live in `src/utils/*.ts` (e.g. `shortcutGuard.ts`), tests
  in `src/utils/__tests__/*.test.ts` (skeleton A, no DOM). No dead-module guard
  exists, so an as-yet-unimported util is fine. Lint runs `eslint . --max-warnings 0`.
- Our ids are `INTEGER`; the Builder's are `string`.

## Decisions

1. **Keep the Builder's shapes and signatures verbatim (string ids).** The
   Phase 3 adapter maps our rows (`mediaId = String(id)`, `folderId =
   String(folder_id)`, `parentId = String(parent_id)`, nulls preserved). This
   keeps `MediaLibraryBrowser` a near-verbatim port; converting the logic to
   numeric ids would touch every call site in the browser for no gain.
2. **Constants — two deliberate deviations, both one-liners:**
   - `LIBRARY_ITEM_CAP = 1000` — Ethan's call (keep a *generous* cap; charter D.3).
   - `FOLDER_NAME_MAX_LENGTH = 40` (Builder: 20). The Builder's 20 is its shared
     editor-field affordance, which we do not have, and our existing folders have
     no limit; 20 would reject ordinary names like "Christmas Backgrounds 2026".
     Applies only to new/renamed names in Phase 3's UI; existing longer names
     still display. **Flagged for Ethan in the PR.**
   - `MAX_FOLDER_PATH_DEPTH = 3` unchanged (charter D.4).
3. **Reformat, don't redesign:** our Prettier config; no non-null assertions
   (the BFS `queue.shift()!` becomes an explicit `undefined` check); a provenance
   docblock naming the Builder source. No behavior differences beyond the two
   constants.
4. **`dragAutoScroll.ts` ports as-is.** The browser's RAF loop that consumes it
   comes with Phase 3.
5. **No fresh-agent review before coding.** Rule 10 applies to plans that change
   behavior; this PR adds two unimported pure modules and changes no runtime
   path. Recorded here so the skip is deliberate.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**Adds:** `src/utils/mediaFolders.ts`, `src/utils/dragAutoScroll.ts`,
`src/utils/__tests__/mediaFolders.test.ts`,
`src/utils/__tests__/dragAutoScroll.test.ts`. This plan, the notes entry.
**Changes nothing else.** No component, store, IPC, schema or existing test.

## Todos

- [x] 1. **Red:** the two test files, written from the contracts (import from the
      not-yet-existing modules fails to resolve — an honest red for a port; the
      assertions then pin every documented behavior, below).
- [x] 2. Port `mediaFolders.ts` and `dragAutoScroll.ts`; green.
- [x] 3. Full gate from `presenter-pro/`; `format:check`.
- [x] 4. PR body: provenance, the two constant deviations flagged, records.

**Behaviors the tests pin** (derived from production constants, never parallel
literals): cap counts photos + folders and trips at `LIBRARY_ITEM_CAP`; depth
root=1/folder=2/subfolder=3 and a cycle → `MAX_FOLDER_PATH_DEPTH + 1`;
`subtreeHeight` leaf=1; `isDescendantOrSelf` self/child/grandchild true, sibling
and unrelated false, cycle-safe; `canCreateFolderIn` allows depth ≤ max, refuses
at max; `canMoveFolder` refuses self, own subtree, and a move that would exceed
max depth, allows a legal reparent and a move to root; `collectCascadeDescendants`
returns the folder + every descendant and every photo in any of them, never a
sibling's; `buildFolderPath` root→folder chain excluding root, `[]` for root,
stops at a broken parent; `childFoldersOf` case-insensitive name order, root =
`parentId ?? null`; `photosIn` treats missing `folderId` as root;
`listFoldersDepthFirst` order + name paths; `searchLibraryPhotos` matches
fileName and altText case-insensitively across folders, blank/whitespace → `[]`;
`folderNameValid` trims, 1..`FOLDER_NAME_MAX_LENGTH`; `autoScrollDirection` -1 /
0 / 1, overshoot keeps steering, short container splits at the midline.

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; expectations derived from the exported constants; exact `toEqual` on arrays, no sorting |
| Bounded blast radius | Four new files; nothing existing changes |
| Per-todo verification | Todo 1 red (unresolved import, then assertions), Todo 3 full gate |
| Behavior-change test edits | None — no existing test touched |
| Required findings report | Todo 4 |
| Data rewrites | N/A |
| Fresh-agent review | Deliberately skipped — no runtime path changes (decision 5) |
| Third-party code | Ported from the Builder (Ethan's own repo), reformatted, provenance in the docblock; Builder untouched |

## Review

**What changed.** Two new pure modules, nothing else: `src/utils/mediaFolders.ts`
(the Builder's folder-tree math, cap, cascade counts, move legality, breadcrumb
path, dropdown rows, recursive search, name validation) and
`src/utils/dragAutoScroll.ts` (edge auto-scroll direction). Both carry a
provenance docblock naming the Builder source. Logic is the Builder's verbatim;
the only edits are formatting, one `queue.shift()!` made an explicit `undefined`
check, and two constants: `LIBRARY_ITEM_CAP = 1000` (Ethan's generous-cap call,
charter D.3) and `FOLDER_NAME_MAX_LENGTH = 40` (the Builder's 20 is its own
editor-field affordance and would reject ordinary names like "Christmas
Backgrounds 2026" — **flagged for Ethan**, one line to change).
`MAX_FOLDER_PATH_DEPTH = 3` is unchanged (D.4).

**Tests.** `mediaFolders.test.ts` (24 cases) and `dragAutoScroll.test.ts` (6
cases), written from the documented contracts because the Builder ships none
for these modules. Red first (unresolved imports), then green. Expectations
derive from the exported constants; arrays are compared exactly, unsorted. The
three product constants are pinned once against the charter's decisions so a
silent change fails loudly.

**Gate:** type-check ✓ · lint ✓ · vitest 1133/1133 passed (0 skipped) ·
prettier ✓. Nothing imports these modules yet; Phase 3 is the first consumer.

**No fresh-agent review**, deliberately: no runtime path changes (decision 5).
