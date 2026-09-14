# Executable Plan S2 — typing no longer disappears during a save or a reopen

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Part 2 data-loss
bugs **SAVE-A3** (P1, [O]) — an edit made while ⌘S is in flight is overwritten
by the saved copy — and **SAVE-A4** (P1, [O]) — reopening the same presentation
within the autosave window cancels the pending write. For SAVE-A4 only the
audit's corrected **safe half** is in scope.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`11b7f4e`.

---

## Measured

| Item | Code | What happened |
|---|---|---|
| SAVE-A3 | `presentationCommands.js` `saveCurrentPresentation`: `const presentation = state.presentation` → `await updatePresentation(...)` → `state.syncSavedPresentation(result.data)` | `syncSavedPresentation` replaces the store's presentation with the saved row and clears `isDirty`. Anything typed during the await was overwritten by the older copy, and the document showed "Saved". Reproduced: store body `'Saved text'` where `'Typed while saving'` was typed mid-save. |
| SAVE-A4 | `presentationCommands.js` `openPresentationInEditor`: `touchPresentation` → `getPresentation` → `loadPresentationIntoEditor` (`setPresentation`, `isDirty` false) | With a change scheduled but not written, the read returns the older row; `setPresentation` flips `isDirty` from true to false, and `autosaveSync.ts`'s subscription treats that as "saved or reverted" and cancels the timer. Up to `AUTOSAVE_MAX_WAIT_MS` of typing is gone. Reproduced: the pending write never happens. |
| SAVE-A4 hazard | `presentationVersionsSync.ts` `applyRestored` does a same-id `setPresentation` right after writing a restored snapshot | Why the audit's first-draft fix — flushing inside the subscription — would overwrite a restore with pre-restore content. |
| Tests | Four test files mock `@/utils/autosaveSync`; none loads `presentationCommands` | The new import cannot break them. |

## Decisions

1. **`flushPendingAutosave()`** (exported from `autosaveSync.ts`): waits for a write
   already on its way, then writes a still-scheduled change immediately, applying
   the same guards the timer applies at fire time (still dirty, same id, not
   exempt, not already written, row not deleted). A cancelled change (Discard,
   Revert) has no timer and is not brought back. A no-op when autosave is not
   running.
2. **Writes on their way are tracked** (`trackWrite`) — including the background
   write of the previous document on a document switch, so reopening it right
   after switching away also waits.
3. **`openPresentationInEditor` awaits the flush before any read.** The flush is
   **not** added to the store subscription (Measured: the restore hazard).
4. **`saveCurrentPresentation` syncs only if the store still holds the object it
   sent.** Otherwise the newer edit stays in the editor, `requiresInitialSave`
   becomes false (the row now exists as a save), `isDirty` stays true (the row
   and its restore point hold the sent content, not the newer edit), and the
   restore point is captured from the normalized saved row. Autosave then writes
   the newer edit, which it had already scheduled when it was typed.
5. **Not in this plan:** SAVE-A5 (Home rename of the open presentation), SAVE-B5
   (Save As flushing the original), the D6 save-model decision.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: slide bodies compared exactly; write-before-read proven with
`mock.invocationCallOrder`; call counts exact; the restore point's snapshot
parsed and its body compared exactly.

## Blast radius

May create: `src/utils/__tests__/autosaveSync.flushPending.test.ts`,
`src/utils/__tests__/presentationCommands.saveRaces.test.ts`, this plan. May
change: `src/utils/autosaveSync.ts` (`Controller.flushNow`, `trackWrite`,
`flushNow`, `flushPendingAutosave`, the switch-time write), 
`src/utils/presentationCommands.js` (one import, the first line of
`openPresentationInEditor`, the sync block of `saveCurrentPresentation`), the
charter row, the notes entry. **May not** change any existing test.

## Todos

- [x] 1. **Red** — 11 new cases, 8 fail on the old code:
  `autosaveSync.flushPending.test.ts` (6; all fail with "flushPendingAutosave is
  not a function" — the export does not exist, so these are not assertion-level
  reds) · `presentationCommands.saveRaces.test.ts` (5; **2 fail on their
  assertions**: SAVE-A3 keeps the typed edit — `expected 'Saved text' to be
  'Typed while saving'`; SAVE-A4 writes before reading — `expected "vi.fn()" to be
  called 1 times, but got 0 times`. 3 pass before and after: the restore point
  records the sent content, and the two controls).
  **Setup correction, recorded:** the first red run set `presentationId` and
  `isDirty` in ONE `setState`, which autosave's subscription reads as a document
  switch and schedules nothing — so the SAVE-A4 case and the in-flight flush case
  failed for the wrong reason. Both files now open the presentation clean, then
  edit it (how the editor actually becomes dirty), and the red was re-run.
- [x] 2. Implement Decisions 1–4.
- [x] 3. The two new files plus `autosaveSync.test.ts`,
  `autosaveSync.failures.test.ts`, `presentationCommands.test.ts`,
  `presentationCommands.saveErrors.test.ts`, `presentationVersionsSync*`,
  `unsavedChanges*`, `importCycles` green and unchanged → 93 / 93 across 12 files.
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 674/674 passed`;
  `format:check` ✓. The first gate run failed type-check in the two NEW test
  files only (a deferred promise typed narrower than the mocked envelope); cast
  at the three `mockReturnValueOnce` sites, no assertion changed, re-run clean.
- [ ] 5. Manual verification (owed to Ethan): (a) type a sentence and press ⌘S,
  then immediately keep typing — the words typed after ⌘S stay on the slide and
  the title bar still says unsaved; (b) type a sentence, within two seconds click
  Back to Home and reopen the same presentation — the sentence is there;
  (c) restore an older version from Version History — the restored content
  stays (no flush undoes it).
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact comparisons and call order |
| List sampling designed against | Each flush state (scheduled, in flight, nothing, cancelled, not running) and each save outcome (edited during save, not edited) has its own case |
| Quantifier erosion designed against | "every read of the row on open" = the single `getPresentation` in `openPresentationInEditor` (Measured) |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 3 (never flush in the subscription — restore hazard); Todo 1 (one `setState` switching id and dirty is a document switch) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots; no captured screen changes |
| Preconditions for conditional UI | N/A — no UI |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — no stored rows are rewritten beyond the normal autosave and save writes |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test edited (Measured: the autosaveSync mocks do not load the changed module) |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Every guard in `flushNow`; both branches of the save sync |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | Node environment; fake timers with `advanceTimersByTimeAsync`; the real editor store reset per test; autosave stopped and cancelled in `afterEach`; deferred promises for in-flight writes |
| 9 | Test placement | `src/utils/__tests__/` |
| 10 | Characterization before refactor | N/A — bug fixes; the existing autosave and save suites pass unchanged |
