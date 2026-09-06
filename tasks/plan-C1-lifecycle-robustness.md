# Executable Plan C1 — Process lifecycle robustness

**Workstream:** C (Lifecycle & process robustness) · **Depends on:** B1
**Category:** main-process lifecycle (one category).

## The findings, precisely (read on `main` after B1)

| #   | Finding                                                                                                                                                                                                                             | Where                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **No single-instance lock.** Two copies can run on the same profile and SQLite database. On a live machine a double-click opens a second editor; both write the same file.                                                          | `electron/main/index.js` — `app.requestSingleInstanceLock` absent |
| 2   | **`second-instance` unhandled** (follows from 1).                                                                                                                                                                                   | same                                                              |
| 3   | **`child-process-gone` unhandled.** A GPU/utility crash is invisible in logs.                                                                                                                                                       | same                                                              |
| 4   | **Output and stage renderers have no `render-process-gone` handler.** Only the main window has one. If the output renderer crashes mid-service the projector shows a dead white window until someone stops and restarts presenting. | `createOutputWindow`, `createStageDisplayWindow`                  |
| 5   | On re-open of the output window mid-session, or after a reload, main never re-sends the live slide; the renderer comes up blank until the next advance.                                                                             | `output:ready` handler                                            |
| 6   | A replacement character (U+FFFD) sits inside a comment in the close handler ("strand�ed") — mojibake that shipped.                                                                                                                  | `index.js:716`                                                    |
| 7   | **No presenting-flow E2E exists** (recorded as a gap in S1).                                                                                                                                                                        | `e2e/`                                                            |

Verified fine and left alone: `before-quit` deferral, `window-all-closed`,
`activate`, main `render-process-gone` → close controller, `closePreviewWindows`
on main `closed`, `prepareForAppShutdown` (marks quitting, clears the countdown
interval, closes previews), output/stage `closed` handlers reset their state.

## Design

- **Lock** (Electron's documented pattern): `const gotSingleInstanceLock =
app.requestSingleInstanceLock(); if (!gotSingleInstanceLock) { app.quit(); }
else { app.on('second-instance', focusMainWindow); …bootstrap… }`. The lock
  is keyed by the user-data directory, so E2E profiles stay independent.
- **`second-instance`**: restore if minimized, focus the main window.
- **`child-process-gone`**: `console.error` with `type` and `reason`.
- **`recoverPreviewRenderer(kind, win, details)`**: on output/stage
  `render-process-gone` with any reason other than `clean-exit`, log and
  `webContents.reload()`. On `output:ready` (which the reloaded renderer
  calls), re-send the current slide/background and the black/logo/countdown
  state — this is also what fixes finding 5 for a normal mid-session re-open.
- Fix the mojibake comment.

## Rules (tests, written first)

- `lifecycleListeners.test.ts`: `second-instance` and `child-process-gone`
  rows; lock requested and the denied branch quits; `render-process-gone`
  watched on exactly three windows; `recoverPreviewRenderer` defined and used
  twice; no U+FFFD in the source.
- `e2e/lifecycle.spec.ts` (new, 3 specs): second instance on the same profile
  exits 0 within 15 s and the first keeps its one window; presenting opens the
  output window (windowed, primary display) and `stopPresenting` closes it;
  `forcefullyCrashRenderer()` on the output window is followed by a reload —
  the window survives with a live renderer.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

| File                                                 | Action                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `electron/main/index.js`                             | lock + `second-instance` + `child-process-gone`; `recoverPreviewRenderer`; `output:ready` re-sync; comment fix |
| `electron/main/__tests__/lifecycleListeners.test.ts` | rows + 4 cases                                                                                                 |
| `e2e/lifecycle.spec.ts`                              | create                                                                                                         |
| `vitest.config.mjs`                                  | thresholds only                                                                                                |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md`   | record                                                                                                         |

**Do NOT modify:** `closeController.ts`, the IPC contract, any renderer file, other E2E specs.

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Unit guard FAILS (5 new assertions) — paste. E2E spec written.
- [x] 2. Implement; unit green; build; E2E 19/19 ×2.
- [x] 3. Record; PR with findings.

## Compliance Manifest — `writing-executable-plans.mdc`

| Item                | Disposition                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| Assertion weakening | clause verbatim                                                          |
| List sampling       | 7 findings enumerated; all 3 windows counted                             |
| Escape hatch        | none                                                                     |
| Blast radius        | 5-file table                                                             |
| IPC pinning         | `N/A — no channel change` (`output:ready` gains behaviour, same channel) |
| Findings report     | required                                                                 |

## Findings (2026-09-06)

- TDD: six new guard assertions red before the change; `e2e/lifecycle.spec.ts`
  written before the implementation (3 specs).
- Gate 25 files / 231 tests; lint 0 errors / 15 warnings; E2E **19/19 ×2**
  (16 existing + second-instance, presenting open/teardown, output-renderer
  crash → reload).
- Finding 5 (blank output on mid-session re-open) was discovered while
  designing the crash reload and fixed by the same `output:ready` re-sync.
- Tooling hardening that rode along: iCloud/macOS "name 2.ext" duplicates of
  three new test files appeared in the tree mid-plan. They are now excluded
  from Vitest and ESLint by pattern and the prettier ignore uses plain globs
  (prettier does not support POSIX classes, so the earlier rule was inert).
- Coverage 7.38/5.85/6.73/7.76 — `index.js` grew by the new handlers; the
  B1 thresholds (7.2/5.6/6.5/7.5) still hold and are unchanged.
