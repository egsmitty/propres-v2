# Executable Plan D3 — song edits can't vanish on quit or on a stale lyrics box

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 2 plan **D3**
(song editor data safety): **SAVE-A1** quit with the song editor open and dirty
loses the edits silently · **SONG-2** focusing Raw Lyrics shows mount-time text,
so one keystroke + Save wipes slide edits. (UX §2.10's part-name refill landed in
plan G3; SAVE-A2 = SONG-1 is in plan D1.)

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`359d37f`.

---

## Measured

| Item | Code | What happened |
|---|---|---|
| SAVE-A1 | `appCommands.js` `window:requestClose`, `file:close`, `file:new`, `file:open` consult only `useEditorStore` (`resolveUnsavedChanges`); `SongEditorModal.jsx` `isDirty` is modal-local state | Quitting (or Close / New / Open from the native menu) with the song editor open and edited unmounted it with no prompt. The modal overlay covers the in-app title bar, so the native menu is the only path. |
| SONG-2 | `SongEditorModal.jsx`: `lyricsShown = rawLyricsFocused \|\| rawLyricsDirty ? lyrics : groupsToLyrics(groups)`; `lyrics` is set at mount, on raw-lyrics change and on Parse only | Edit a slide on the right, focus Raw Lyrics → the mount-time text appears. One keystroke sets `rawLyricsDirty` and clears `structureTouchedSinceRawEditRef`, so Save re-parses the stale text without asking (G3's question needs structure touched *after* the raw edit) and the slide edit is gone. |

## Decisions

1. **A registry, not a store flag.** New `src/utils/blockingEditors.ts`:
   `registerBlockingEditor(id, { isDirty, resolve })` returns an unregister that
   only removes its own handlers (a remount may have registered newer ones);
   `resolveBlockingEditors()` asks each dirty editor in turn, false at the first
   that declines or throws. The song modal is the only registrant today.
2. **The modal resolves through its existing close flow.** `handleRequestClose`
   now returns whether it closed (Discard → true; Save → the save result; a
   dismissed dialog → false; mid-save → false). Registration uses `useLatest`
   so the effect subscribes once and always calls the current handler.
3. **Asked first on quit** — before the "Still Presenting" guard, so a declined
   song dialog never follows a service that has already been stopped. A
   declined quit still answers main's close handshake
   (`resolveWindowCloseRequest`), or the window wedges.
4. **Close / New / Open** ask the registry before anything else and return
   `false` when declined.
5. **SONG-2:** on focus, untouched raw lyrics (`!rawLyricsDirty`) are refreshed
   from the current groups. Once the user has typed in the box, its text is
   theirs and is left alone. The UX §2.2 import-only model stays a later plan.
6. **Not in this plan:** song autosave (UX §2.9), Home-tab navigation while the
   modal is open (unreachable: the overlay covers the title bar), SONG-19
   (Esc / ⌘S in the song editor).

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: exact call counts, exact booleans, exact view/tab values; SONG-2
checks the edited body is present **and** the stale body is absent.

## Blast radius

May create: `src/utils/blockingEditors.ts`, its test
`src/utils/__tests__/blockingEditors.test.ts`,
`src/utils/__tests__/appCommands.blockingEditors.test.ts`,
`src/components/library/__tests__/SongEditorModal.dataSafety.test.tsx`, this
plan. May change: `src/utils/appCommands.js` (four cases + one import),
`src/components/library/SongEditorModal.jsx` (`handleRequestClose` return value,
registration effect, raw-lyrics `onFocus`), the charter row, the notes entry.
**May not** change any existing test.

## Todos

- [x] 1. **Red** — 20 new cases, 18 fail on the old code:
  `blockingEditors.test.ts` (7; module missing) ·
  `appCommands.blockingEditors.test.ts` (6; all fail) ·
  `SongEditorModal.dataSafety.test.tsx` (7; 5 fail — the "nothing edited" and
  "modal unmounted" controls pass). The SONG-2 pair was re-proved red by
  reverting only the `onFocus` line after an initial selector error (the slide
  text is in two textareas): "expected 'Verse 1\n\nAmazing grace how sweet th…'
  to contain 'Amazing grace EDITED ON THE RIGHT'".
- [x] 2. Implement Decisions 1–5.
- [x] 3. New files plus `SongEditorModal.test.tsx`, `appCommands.closeGuard.test.ts`,
  `appCommands.present.test.ts` → all green, unchanged.
- [ ] 4. `npm run gate` and `npm run format:check`.
- [ ] 5. Manual verification (owed to Ethan): open a song, edit its title, ⌘Q →
  "Unsaved Changes" for the song; dismiss → the app stays open with the edit;
  Discard → the app quits (after the presentation prompt, if any). Repeat with
  File ▸ Close and File ▸ New. Edit a slide on the right, click Raw Lyrics →
  the edit is there; type a space, Save to Library, reopen → the edit is kept.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact counts; SONG-2 asserts presence and absence |
| List sampling designed against | Each of the four commands has its own case |
| Quantifier erosion designed against | "every exit path" = the four commands found by grep in `appCommands.js` that leave the editor or window (Measured) |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Decision 3 (quit ordering, handshake); Todo 1 (duplicate slide text needs a scoped selector) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots; no captured screen changes (the dialog only appears on quit/close with a dirty song) |
| Preconditions for conditional UI | The song must be edited (dirty) before the registry asks; the slide editor renders only with a selected slide (the fixture selects `s1`) |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel or payload changed |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |
| Data rewrites state their backup and rollback | N/A — no stored rows are rewritten |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test edited |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Registry: empty, clean, resolve, decline, unregister, stale unregister, throw; each command; each dialog outcome |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | `@/utils/ipc` and `@/utils/dialog` mocked; stores reset per test; registry unregistered in `afterEach`; `act` around registry calls that update modal state |
| 9 | Test placement | `src/utils/__tests__/`, `src/components/library/__tests__/` |
| 10 | Characterization before refactor | N/A — bug fixes; the existing song editor and close-guard suites pass unchanged |
