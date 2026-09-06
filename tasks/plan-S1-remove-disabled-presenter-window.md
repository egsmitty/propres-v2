# Executable Plan S1 — Remove the disabled presenter window (phase7 #9) + last lint leftovers

**Category:** dead-code removal (one category; the two one-line lint fixes ride
along because they are the last two entries of the same phase7 sweep and each is
proven by its own test).
**Depends on:** nothing. **Unblocks:** B1 (typed IPC) — the dead channels are
what the drift guard must not have to reason about.

## The finding, precisely

The separate presenter window was disabled in "session 6" (Phase 3) when the
presenter moved into an editor sidebar. What remains:

- `electron/main/index.js`: `let presenterWindow = null` and three related
  flags that are never set non-null; 17 live `if (presenterWindow) …` branches
  that can never execute; a 50-line commented `createPresenterWindow`; a 25-line
  commented block of seven `ipcMain.handle('presenter:*')` registrations.
- `electron/preload/index.js`: nine wrappers for channels that have **no
  handler** (`presenter:open/close/start/updateSlides/waitReady/ready/goToSlide`
  and the events `presenter:start`, `presenter:updateSlides` that nothing emits).
  Invoking any of them rejects with "No handler registered".
- `src/components/presenter/PresenterView.jsx` (409 lines) mounted only for
  `#/presenter`, a hash no window ever loads. It calls the dead wrappers.
- `src/utils/ipc.js`: three exports nobody imports. `src/utils/presenterFlow.js`:
  two "DISABLED" comment stubs.
- The drift guard `ipcChannels.test.ts` passed all along because its regex
  matched the commented-out registrations. That is a bug in the guard.

Still live and kept: `presenter:slideAdvance` and `presenter:stop` (main → the
**main** window; `Editor.jsx` subscribes), `onSlideAdvance`, `onPresenterStop`.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                  | Action                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `electron/main/__tests__/ipcChannels.test.ts`         | strip comments before scanning; new case proving a commented handler does not count                                |
| `electron/main/index.js`                              | delete presenter-window state, branches, and both commented blocks; last empty `catch` becomes a justified handler |
| `electron/preload/index.js`                           | delete the nine dead wrappers                                                                                      |
| `src/utils/ipc.js`                                    | delete `openPresenterView`, `closePresenterView`, `updatePresentationSlides`                                       |
| `src/components/presenter/PresenterView.jsx`          | delete                                                                                                             |
| `src/App.jsx`                                         | delete the `#/presenter` route and import                                                                          |
| `src/utils/presenterFlow.js`                          | delete the two DISABLED comment stubs                                                                              |
| `src/utils/songSections.js` + test                    | phase7 #3 — characterization test first, then the escape                                                           |
| `eslint-suppressions.json`                            | prune (count only goes down)                                                                                       |
| `tasks/phase7-remediation.md`, `tasks/fable-notes.md` | record                                                                                                             |

**Do NOT modify:** `PresenterPanel.jsx` (the live sidebar), `presenterStore.js`,
any output/stage window code, any E2E spec.

### Sanctioned escape hatch — none.

## Proof of no behaviour change

Every deleted main-process branch is guarded by `presenterWindow`, which is
assigned only in commented-out code; every deleted wrapper has no handler. The
E2E suite (launch, quit, unsaved-changes, migrations, recovery, hymns) is the
regression net; a presenting-flow E2E does not exist yet — recorded as a gap
for C1.

## Todos

- [x] 1. Fixed drift guard **fails** on current code, naming the seven channels. Paste.
- [x] 2. `songSections` characterization test pins current matches for `[Verse 1]`, `Verse 1:`, `(Chorus)`; then the escape fix; test still green.
- [x] 3. The empty catch: read it, decide (handler / justified comment / bug), write the decision in the code.
- [x] 4. Deletions. Gate, `format:check`, build, E2E ×1, `--prune-suppressions`.
- [x] 5. Record; PR with findings report.

## Compliance Manifest — `writing-executable-plans.mdc`

| Item                | Disposition                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| Assertion weakening | clause verbatim; the guard gets stricter, never looser                                |
| List sampling       | all nine wrappers, all 17 branches, both comment blocks named                         |
| Escape hatch        | none                                                                                  |
| Blast radius        | 11-file table; do-not-touch                                                           |
| IPC pinning         | the guard itself is the pin; the channel set shrinks by exactly seven invoke channels |
| Findings report     | required                                                                              |

### `testing-standards.mdc`

| #   | Disposition                                                         |
| --- | ------------------------------------------------------------------- |
| 1   | guard test fails first; characterization test before the regex edit |
| 2   | the guard's behaviour change (comment stripping) is stated here     |
| 3   | verbatim                                                            |
| 10  | `N/A` — no existing test pins the dead code                         |

## Findings (2026-09-06)

- Fixed guard on old code: FAIL naming exactly `presenter:close/goToSlide/open/ready/start/updateSlides/waitReady`.
- Characterization: six label shapes pinned before the regex edit; unchanged after.
- Empty catch (seeder): removed the swallow — the JSON was produced by the same
  function three lines earlier, so a parse failure is a seeder bug that must
  surface on first launch, not seed an empty section.
- **My own regression, caught by E2E:** the first deletion pass left
  `isPresenterWindow` referenced in three `App.jsx` effects. Lint flagged three
  `no-undef` errors and the E2E suite failed 5 of 16 (hymns, quit, recovery ×3)
  because the renderer threw inside those effects. Fixed; 16/16 after. This is
  the E2E harness doing its job on a "provably no behaviour change" deletion.
- Gate 205/205; lint 0 errors / 15 warnings (ceiling ratcheted 16 → 15);
  suppressions 61 → 56; E2E 16/16.
