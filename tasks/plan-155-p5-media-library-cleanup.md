# Executable Plan #155-P5 — Retire the old panel, tighten the ratchet, refresh the docs

**Parent charter:** `plan-155-media-library-port.md` (Phase 5, the last). **Issue:**
#155. After P4 the 320px `MediaLibraryPanel.jsx` is dead code — nothing imports
it (the Editor mount guard from P4 pins that). This PR deletes it, removes its
inline-style ceiling, makes the ratchet refuse a ceiling for a file that no
longer exists, and brings the docs in line with what shipped. Base: `main` after
#175 (P4). One PR.

---

## Measured (read 2026-09-24, on the P4 head)

- `src/components/library/MediaLibraryPanel.jsx` — 661 lines, one default
  export, **no importers** after P4 (`Editor.jsx` mounts `MediaLibraryModal`;
  `editorMediaLibraryMount.test.ts` asserts the panel is not referenced).
- `src/__tests__/inlineStyleBudget.test.ts:30` — `'components/library/
  MediaLibraryPanel.jsx': 7`, and the test's "every ceiling is exact" case
  compares each ceiling to the file's actual count (0 for a missing file), so a
  stale ceiling already fails.
- `CLAUDE.md:124` — "**Deferred by decision:** redesign-scale UI (the media
  library, #155; …)". Untrue since P4. `What's Built` has no line for the port.
- `README.md` mentions no panel; the layout table needs no change.
- `tasks/TODO.md` (local, untracked) is refreshed outside the PR.

## Decisions

1. **Delete `MediaLibraryPanel.jsx`.** Nothing else moves; `MediaTilePreview.tsx`
   already carries the tile preview the panel's private `MediaPreview` provided.
2. **The ratchet is already the red.** `inlineStyleBudget.test.ts` has "every
   ceiling is exact": a deleted file counts 0 against its ceiling of 7, so the
   moment the panel is gone the test fails on `MediaLibraryPanel.jsx`; removing
   the entry makes it green. No new assertion is needed (the plan's first draft
   proposed one before reading the test to its end).
3. **Docs:** `CLAUDE.md` — drop the media library from "Deferred by decision";
   add a `What's Built` line for the port (the Builder-derived modal library with
   nested folders, recursive search, the cap, drag-and-drop, the detail pane);
   note the two decisions still Ethan's (non-dimming vs dimmed; import vs cap;
   opening while presenting). Nothing else in the repo describes the panel.
4. **No fresh-agent review** (rule 10 targets behaviour changes): a deletion of
   unreachable code, a ratchet that only tightens, and prose. Recorded here.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**Deletes:** `src/components/library/MediaLibraryPanel.jsx`. **Changes:**
`src/__tests__/inlineStyleBudget.test.ts` (one entry removed), `CLAUDE.md`. This plan, the charter's status, the notes entry.
**Does not change:** any component, hook, IPC, store, E2E spec or baseline.

## Todos

- [x] 1. **Red:** delete the panel → "every ceiling is exact" fails on
      `MediaLibraryPanel.jsx` (ceiling 7, actual 0).
- [x] 2. Remove the panel's ceiling → green. Full gate; `format:check`.
- [x] 3. `CLAUDE.md` refresh; charter status row; notes entry; PR body.

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; a ceiling is removed only because its file is gone — the exactness check proved it |
| Bounded blast radius | One deletion, one test, one doc |
| Per-todo verification | Todo 1 red proof; Todo 2 full gate |
| Behavior-change test edits | None — the removed ceiling belongs to a file that no longer exists |
| Required findings report | Todo 3 |
| Data rewrites | N/A |
| Fresh-agent review before coding | Deliberately skipped — no runtime path changes (decision 4) |
| Manual check | None (nothing user-facing changes) |

## Review

**What changed.** `MediaLibraryPanel.jsx` (661 lines) is deleted — nothing
imported it after P4. Its inline-style ceiling is removed from
`inlineStyleBudget.test.ts`; the test's own "every ceiling is exact" case was the
red (ceiling 7, actual 0) and is green again. `CLAUDE.md` no longer calls the
media library deferred, gains a What's Built line for the port and an
Architectural Decisions entry for the modal, browser, hook, adapter and drag
MIME. No component, hook, IPC, store, E2E spec or baseline changes.

**Gate:** see the PR body for the run on the rebased branch. **No fresh review**
(decision 4).
