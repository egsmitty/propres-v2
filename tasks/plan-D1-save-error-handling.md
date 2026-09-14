# Executable Plan D1 — a save that did not happen is never reported as one

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 2 plan **D1**,
the decision-free part (independent of Ethan's D6 save-model decision):
**SAVE-A2** (= SONG-1) song Save ignores failures and closes · **SAVE-A7**
(= MAIN-B9, renderer side) a save to a deleted presentation reports "Saved" ·
**SAVE-A8** ⌘S / File ▸ Save failures are silent · **SAVE-A9** `captureVersion`'s
result ignored · **SAVE-A10** autosave alerts once per document, ever ·
**SAVE-A11** a rejected write escapes autosave's failure count · **SAVE-B4** a
null envelope counts as a recorded restore point. Also the gate half of
**SAVE-A6** (orphan version written for a vanished presentation).

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`51006e5`.

---

## Measured

| Item | Code | What happened |
|---|---|---|
| SAVE-A2 | `SongEditorModal.jsx` `handleSave`: `await updateSong(song.id, data)` / `await createSong(data)`, then `onSave(); onClose()` | IPC returns `{ success: false }` (never throws), so a failed save closed the editor as if saved; the `catch` was dead. Songs have no autosave. |
| SAVE-A8 | `saveCurrentPresentation` has two callers: `appCommands` `file:save` (drops the result) and `editorSave.js` (alerts) | Menu and ⌘S failures said nothing. |
| SAVE-A7 | `saveCurrentPresentation`: `else if (result?.success) { setDirty(false) … }` | `{ success: true, data: null }` (row deleted) marked the document saved. |
| SAVE-A9 | Save cleared dirty in `syncSavedPresentation`, then `await captureVersion(...)` ignored; same in `unsavedChanges.js`, `renamePresentationById`, and the closing captures of `restoreVersion` / `revertToLatestVersion` | A failed restore point showed "Saved" while the newest version lagged the row (THE INVARIANT). |
| SAVE-A6 (gate) | `unsavedChanges.js`: `captureVersion(normalizePresentation(saveResult?.data ?? presentation))` | With no row back, the in-memory copy was captured — an orphan version — and the window closed. |
| SAVE-A10 | `autosaveSync.ts`: `failures = 0` on success, `alerted` never reset | A second run of failures later in the session was silent. |
| SAVE-A11 | `autosaveSync.ts` `write()`: `await deps.updatePresentation(...)`, no try/catch | A rejected IPC call was an unhandled rejection and never counted. |
| SAVE-B4 | `captureVersion`: `return result?.success !== false` | `null` / `{}` counted as success. |

## Decisions

1. **`saveCurrentPresentation` owns the failure alert**, for every caller. `saveFromEditor` stops alerting (one alert per failure). That changes one existing characterization case in `src/pages/__tests__/Editor.save.test.tsx` — **the only existing test edited**; it fails on the old code (one alert) and passes on the new (none), and it says so in the file.
2. Three outcomes, each visible: write failed → "Save Failed", dirty kept · no row came back → "Save Failed" (no longer exists), dirty kept, no version written · restore point failed → "Restore Point Not Saved", dirty set back to true (the row is written but not committed).
3. The Unsaved Changes gate refuses to let you leave on a missing row or a failed restore point. It checks `captured === false` — `captureVersion` always returns a boolean, and the existing gate tests mock it without a value.
4. Home rename and the closing captures of restore / revert alert "Restore Point Not Saved" but still report success: the operation happened, only its record did not.
5. `captureVersion` counts only `success === true`.
6. Autosave counts a rejected write as a failure and re-arms its alert after a success.
7. Song Save treats `!success` and `data == null` as failures, keeps the editor open, alerts, and returns `false`. The existing song tests mock the IPC without values and assert only the calls and payloads, so they are unchanged.
8. **No IPC or main-process change** (MAIN-B9's main-side `.changes === 0` is left alone: the audit's verification pass showed it would make autosave's "Presentation Deleted" branch unreachable). **No stored rows are rewritten**, so the backup/rollback rule does not apply.
9. **Not in this plan:** SAVE-A1 (quit with a dirty song editor), SAVE-A3, SAVE-A4, SAVE-A5, SAVE-A6's Home-delete store clearing, SAVE-B3 — each is its own change, and several depend on D6.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: alert calls compared as exact `[message, options]` pairs or exact
title lists; call counts exact; `isDirty` exact.

## Blast radius

May create: the five new test files listed in Todo 1 and this plan. May change:
`src/utils/presentationCommands.js` (`saveCurrentPresentation`,
`renamePresentationById`), `src/pages/editorSave.js`,
`src/pages/__tests__/Editor.save.test.tsx` (one case, Decision 1),
`src/utils/unsavedChanges.js` (the Save branch), `src/utils/autosaveSync.ts`
(`write`), `src/utils/presentationVersionsSync.ts` (`captureVersion`, the two
closing captures), `src/components/library/SongEditorModal.jsx` (`handleSave`),
the charter row, the notes entry. **May not** change any other existing test.

## Todos

- [x] 1. **Red** — 18 new cases, 15 fail on the old code:
  `presentationCommands.saveErrors.test.ts` (5; 4 fail, "a save that works" passes) ·
  `unsavedChanges.captureFailure.test.ts` (2 fail) · `autosaveSync.failures.test.ts`
  (2 fail) · `presentationVersionsSync.captureResult.test.ts` (5; 4 fail, "true on
  success" passes) · `SongEditorModal.saveFailure.test.tsx` (4; 3 fail, "a save that
  works closes" passes).
- [x] 2. Implement Decisions 1–7 (anchored, exact-once replacements) and the one
  behaviour-change edit to `Editor.save.test.tsx`.
- [x] 3. The five new files plus `presentationCommands`, `unsavedChanges`,
  `autosaveSync`, `presentationVersionsSync`, `SongEditorModal` and `Editor.save`
  suites → 99 / 99.
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 590/590 passed (0 skipped)`; `format:check` ✓.
- [ ] 5. Manual verification (owed to Ethan): make the database read-only (or
  fill the disk) and (a) press ⌘S → "Save Failed", the title bar still says
  unsaved; (b) edit a song and Save to Library → "Save Failed", the editor stays
  open with the edits; (c) type for a while → after three failed autosaves
  "Could Not Save"; fix the disk, type, break it again → it alerts again.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact alert pairs and counts |
| List sampling designed against | Each capture site (save, gate, rename, restore, revert) has its own case |
| Quantifier erosion designed against | "every caller of saveCurrentPresentation" is the two callers found by grep (Measured) |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 3 (`captured === false` vs the gate tests' valueless mock); Decision 7 (song tests' valueless IPC mocks); Decision 8 (why MAIN-B9 main-side is left) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | Song editor: the title is typed before Save for a new song (Save refuses an empty title) |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed (Decision 8) |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — no stored rows or snapshots are rewritten (Decision 8) |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | `Editor.save.test.tsx`, one case — fails under old code, passes under new, stated in the file and here (Decision 1) |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Each outcome of each changed function has a case |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | Editor store reset; `@/utils/ipc` and `@/utils/dialog` mocked; fake timers for autosave; jsdom only for the song editor |
| 9 | Test placement | `src/utils/__tests__/`, `src/components/library/__tests__/` |
| 10 | Characterization before refactor | N/A — bug fixes, not a refactor; existing suites (Todo 3) pass unchanged except the one Decision 1 case |
