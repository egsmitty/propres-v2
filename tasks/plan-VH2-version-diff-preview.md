# Executable Plan VH2 — Version History: preview a version against the current document

**Issue:** #160. Builds on VH1 (#161, merged). One PR.

**The user's decision (as a user, on #160):** when deciding whether to restore an
older version, the useful question is *"what will change if I restore this?"* —
so the comparison is the selected version **against the current document**, not
against the version before it. This plan implements exactly that.

---

## Measured (2026-09-16, `main` after #161)

- **Data.** `listVersionSummaries` carries `{ id, saved_at, slide_count }` only.
  The full document is per version via `getVersion(versionId)` →
  `Envelope<VersionRow { id, presentation_id, snapshot: string (JSON), saved_at }>`
  (`ipc.ts`, exported to the renderer; `VersionDeps` in
  `presentationVersionsSync.ts:46`). Snapshots are stored **already normalized**
  and must **not** be re-normalized on read — `hasDiverged` documents why:
  `normalizePresentation` re-mints uuids for id-less slides/text boxes and
  manufactures a difference that is not there. `restoreVersion`'s
  `parseSnapshot` is the existing read guard (rejects non-objects / missing
  `sections`).
- **Document shape** (`sectionTypes.js`): section
  `{ id, title, type, color, collapsed, slides[], backgroundId }`; slide
  `{ id, type, label, body, notes, backgroundId, textStyle, textBox, textBoxes[],
  placeholderText }`. `textBoxes` is the source of truth; legacy `body`/`textBox`
  are synced from it. **`collapsed` and `color` are UI/cosmetic and live in the
  snapshot** — a collapse toggle must not read as a content change.
- **Comparator.** The only equality is whole-document:
  `presentationContentKey` = sorted-key JSON of `CONTENT_FIELDS`, via a
  **private** `canonicalize`. Nothing compares per section or per slide.
- **The modal after VH1.** Rows with `Restore`; newest = Current when clean;
  `w-[560px]`; `restoreVersion(id)` is the single restore path. The **live**
  document is `useEditorStore.presentation` and includes unsaved edits — that is
  "what I'm doing right now."
- **E2E.** `e2e/versionHistory.spec.ts` selects `[data-version-row]` and the
  `Restore` buttons (row buttons and the confirm share the label; the spec
  filters by the dialog title). No version-history screenshot baseline exists.
- **VH1 review finding to fold in:** `versionCount` is refreshed only on open and
  after a save, so after a restore it is stale-low (harmless for the `> 1` gate,
  but wrong). The modal's `load()` already fetches the fresh list.

## Decisions

1. **Direction.** `diffPresentationStructure(current, version)` — baseline is the
   **live** document (unsaved edits included), target is the version. Every
   status reads as the *consequence of restoring*: `added` = a section/slide you
   would get back (in the version, not in current); `removed` = one you would
   **lose** (in current, not in the version); `changed` = same id, different
   content; `same`.
2. **Pure module `src/utils/versionDiff.ts`.** Match sections by `id`, then
   slides by `id` within matched sections. Content keys per node use the one
   canonical sorted-key serializer — **export `canonicalize` from
   `presentationVersions.ts` (as `canonicalJson`)** rather than writing a second
   sorter that could drift.
   - Slide key over `{ label, body, notes, backgroundId, textStyle, textBoxes }`
     (`body` kept so a legacy body-only snapshot still compares against a
     text-boxes document). Section key over `{ title, type, backgroundId }` plus
     its ordered slide-id list — reordering slides is a real change (V1's rule).
   - **Excluded from keys:** `collapsed`, `color`, `placeholderText`, `textBox`
     (the legacy mirror of `textBoxes`).
   - Also `titleChanged` and `aspectChanged` (aspectRatio / custom dims).
   - Output `{ summary: { slidesAdded, slidesRemoved, slidesChanged,
     sectionsAdded, sectionsRemoved, titleChanged, aspectChanged },
     tree: DiffSection[] }`. `tree` is the **version's** structure (what you are
     heading into) annotated per node, with **removed** sections and slides
     listed in place (struck) so losses are visible, not hidden. Slide display
     name = `label`, else the first line of `body` trimmed to 40 chars, else
     "Untitled slide". Pure; no I/O; no store.
3. **UI.** A **Preview** button (`data-version-preview={id}`) on every
   non-Current row, next to Restore. Click → `getVersion(id)` once → parse with
   the same guard as `parseSnapshot` → diff vs the live document → a preview pane
   **inside** the modal (list left, pane right; modal grows to `w-[820px]`).
   Pane: "Restoring this version would:" + summary chips (`+N slides`,
   `−N slides`, `N changed`, `±N sections`, `title changes`) — or "No content
   differences" — then the annotated tree with badges (new / gone / changed).
   A **Restore** in the pane calls the existing `handleRestore(version)`.
   Preview again on the same row closes the pane; **Escape closes the pane
   first**, then the modal (capture phase, consistent with L1). States:
   "Comparing…" while loading; an unreadable or missing version shows an inline
   "This version could not be read." (mirrors `restoreVersion`'s wording), never
   a dialog.
4. **Fold in the VH1 finding:** `load()` calls `setVersionCount(data.length)`,
   so the gate's count is accurate after a restore too.
5. **Not in scope:** word-level text diffs; rendered/thumbnail previews; diff vs
   the previous version; any change to restore/capture semantics or retention.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Diff results are asserted as whole objects with `toEqual`, never sampled.

## Blast radius

**May change:** `src/utils/versionDiff.ts` (new),
`src/utils/__tests__/versionDiff.test.ts` (new), `src/utils/presentationVersions.ts`
(export the canonicalizer only — `presentationContentKey` behaviour unchanged),
`src/components/editor/VersionHistoryModal.jsx` and
`src/components/editor/__tests__/VersionHistoryModal.test.tsx`. This plan.

**May not change:** `restoreVersion` / `captureVersion` / `revertToLatestVersion`;
the `versions` DB queries; retention; VH1's Current-marker rule; the existing
E2E selectors (`[data-version-row]`, the `Restore` buttons, the confirm dialog
title) — `e2e/versionHistory.spec.ts` must pass **unchanged**; `getVersion`'s
contract.

## Todos (red first)

- [x] 1. **Red:** `versionDiff.test.ts`, exhaustive small cases, whole-object
      `toEqual`: identical → every node `same`, all counts 0 · slide added ·
      slide removed · slide `changed` by body / by `textBoxes` / by `notes` ·
      slides reordered → section `changed`, slides `same` · section added ·
      section removed (its slides listed as removed) · `collapsed` and `color`
      toggled → **not** changed · `titleChanged` · legacy body-only snapshot vs
      a `textBoxes` document compares by `body`.
- [x] 2. `versionDiff.ts` + export `canonicalJson`. Green on Todo 1; the
      existing `presentationVersions.test.ts` passes unchanged.
- [x] 3. **Red:** modal tests — Preview appears on non-Current rows only (0 on
      the Current row); clicking it calls `getVersion(id)` exactly once and
      renders the summary (e.g. `+1 slide`) and one badge per node; an
      unreadable snapshot renders the inline message; Restore from the pane
      calls `restoreVersion(id)`; a second click closes the pane; `load()` sets
      `versionCount` to the list length.
- [x] 4. Modal implementation, `w-[820px]`, Escape-closes-pane-first.
- [x] 5. `npm run gate` (report passed/total, coverage) + `npm run format:check`.
      No baseline is touched; confirm `versionHistory.spec.ts` selectors are
      untouched by grep.
- [x] 6. PR body: findings; the named export addition; **manual check owed** (no
      app launched): on a real three-version document, open Preview on the
      oldest row and confirm the "would remove" list matches exactly what
      Restore then drops.

## Compliance Manifest

### writing-executable-plans.mdc

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; whole-object `toEqual` on every diff result |
| List sampling designed against | Todo 1 enumerates every status transition, not a sample |
| Sanctioned escape hatch | None; the excluded fields are a fixed, justified list in Decision 2 |
| Bounded blast radius | Named files; may-not-change list incl. E2E selectors |
| File-specific pitfall notes | Never re-normalize a snapshot (Measured); `body` kept in the slide key for legacy snapshots; `collapsed`/`color` excluded |
| Per-todo verification | Todos 1–3 name their suites; gate at Todo 5 |
| Snapshot policy | N/A — no visual baseline exists or is added |
| IPC contract pinning | `getVersion` unchanged; no new channel |
| Manual verification steps | Todo 6 (owed, not run) |
| Required findings report | Todo 6 |
| Data rewrites | N/A — read-only; no row or snapshot is written |

### testing-standards.mdc

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todos 1→2, 3→4 |
| 2 | Behaviour-change test edits | None to existing assertions; only additions |
| 3 | No weakened assertions | Clause verbatim |
| 4 | Coverage floor | Todo 1 covers every branch of the pure module |
| 8 | Vitest/jsdom | Node env for `versionDiff`; jsdom + mocked `@/utils/ipc` for the modal, as its existing test does |
| 10 | Characterization before refactor | N/A — additive feature; VH1's tests are the modal's characterization |

---

## VH3 follow-up (issue #163, from Ethan's live review of #160) — 2026-09-16

**Feedback:** the summary read as bare counts ("1 changed") with no subject, and a
changed slide said only "changed" instead of showing what it is now vs. what it
would become.

**Changes (same blast radius as VH2; `versionDiff.ts`, the modal, their tests):**
- `DiffSummary` gains `backgroundsChanged`, `titleBefore`, `titleAfter`; the
  modal renders verb-first lines with the values in — *Change 2 slides · Remove
  1 slide · Change 1 background · Rename "Sunday" to "Easter" · Change the
  aspect ratio* — or "No content differences".
- `DiffSlide` gains `changes` (which aspects: text / formatting / label / notes /
  background / layout, fixed order), `before` (the text now) and `after` (the
  text after restoring), capped at 160 chars; `added` carries `after`,
  `removed` carries `before`. `DiffSection` gains `changes` (title / type /
  background / order — `order` only when it is the same set of slides in a new
  sequence). The bare "changed" badge is gone; a changed slide shows its aspects
  and **Now: … / After restore: …**; a slide named from its own body skips the
  redundant name line.
- Named test change: VH2's chip assertion `−1 slide` → `Remove 1 slide`.

**Deferred (maybe, per Ethan):** a rendered thumbnail of the old slide via
`SlideRender`.
