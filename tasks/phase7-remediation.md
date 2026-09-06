# Phase 7 — Remediation Backlog

Findings from the Phase 6 audit. **This file is append-only during 6F.** Fixes
happen in 6G, each with a failing test written first (TDD, see
`.cursor/rules/testing-standards.mdc`).

Priority: **P0** = user-facing crash or data loss · **P1** = broken/wrong
behavior · **P2** = dead code, cleanup, or risk without a known symptom.

---

## P0 — Confirmed runtime crashes

### 0. The app cannot be quit with Cmd+Q — **FIXED** (branch `fix/app-quit-lifecycle`)

- **Where:** `electron/main/index.js` — `close` handler at :664, menu
  `{ role: 'quit' }` at :1442, `window-all-closed` at :1541.
- **What:** there is **no `before-quit` listener** (`grep -c "before-quit"` → 0).
  Cmd+Q asks Electron to quit, Electron tries to close the main window, and the
  `close` handler calls `event.preventDefault()` to hand control to the renderer
  for the unsaved-changes prompt. That preventDefault **cancels the quit**. The
  renderer then replies and calls `window:close`, which closes the *window* —
  but the quit is already aborted, and `window-all-closed` deliberately does not
  quit on darwin. The process stays alive in the dock.
- **Why it was never caught:** `appIsQuitting` is only ever set by
  `prepareForAppShutdown()`, which is called from exactly one place — the
  "PresenterPro Is Not Responding → Force Close" branch at :683. On a healthy
  app nothing sets it.
- **Second failure mode:** if the renderer never replies (crash, or a dialog
  path that never resolves), `mainWindowCloseRequestPending` latches `true` and
  the guard at :692 silently `preventDefault()`s **every** subsequent close with
  no dialog at all — a permanently unquittable window.
- **Aggravating factor (not a code bug):** `~/Desktop/PresenterPro.app` is not a
  packaged bundle. It is a bash script that runs `npm run dev`, so quitting the
  Electron window leaves `npm run dev` and `electron-vite` alive as orphans.
- **Fix:** add a `before-quit` listener that sets the shutdown flag so the close
  handler lets the quit through; give the renderer handshake a hard timeout so
  it cannot latch; handle `render-process-gone` so a dead renderer still allows
  close. **Test first:** assert the close handler does not `preventDefault` once
  the quitting flag is set, and that a handshake that never resolves still
  closes after the timeout.
- **Resolution:** the decision logic was extracted to a pure, tested state
  machine at `electron/main/closeController.ts` (15 tests), `before-quit` and
  `render-process-gone` listeners were added, and the renderer handshake now
  expires after 5s instead of latching. A guard test
  (`lifecycleListeners.test.ts`) fails if the listeners are ever removed or if
  the inline boolean flags return — the mechanical rule, per Phase 8.

---

## P0 — Confirmed runtime crashes (fixed in Phase 6C)

Found by ESLint `no-undef` on the very first lint run (2026-09-05).

### 1. Toolbar "Insert Image" / "Insert Video" throws ReferenceError

- **Where:** `src/components/layout/Toolbar.jsx:1594` and `:1597`
- **What:** Both `MenuOption` handlers call `importMediaToSelectedSlide(...)`,
  but `Toolbar.jsx` never imports it. The function *is* exported from
  `src/utils/presentationCommands.js:334`, and `FilmstripSlide.jsx:10` imports
  it correctly — so the same feature works from the filmstrip context menu and
  crashes from the toolbar.
- **Impact:** Insert → Media → Insert Image / Insert Video is dead from the
  toolbar. `CLAUDE.md` currently claims this feature works.
- **Fix:** add the import. **Test first:** render the Insert menu, click each
  option, assert `importMediaToSelectedSlide` is called with `'image'` /
  `'video'` — the test must fail with a ReferenceError under current code.

### 2. Clearing a media slide throws ReferenceError

- **Where:** `src/utils/presentationCommands.js:402`
- **What:** `placeholderText: slide.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT`
  references a constant that is exported from `src/utils/textBoxes.js` but never
  imported into this file.
- **Impact:** the code path converting a media slide back to a text slide
  (clear / reset) crashes.
- **Fix:** add the import. **Test first:** call the clearing action on a media
  slide and assert the resulting slide's `placeholderText` equals
  `DEFAULT_PLACEHOLDER_TEXT` imported from the production module.

---

## P0 — Confirmed runtime crashes

### 11. Unsaved changes silently vetoed every close — **FIXED**

- **Reported by Ethan during Tier 2 verification.** Two symptoms, one cause:
  (a) editing a presentation then pressing Cmd+Q or clicking the red X did
  *nothing* — no save prompt, window stayed open; (b) Cmd+Q while presenting
  closed the output window but left the app running and still "presenting".
- **Where:** `src/pages/Editor.jsx` — a `beforeunload` listener calling
  `window.confirm()`.
- **What:** Chromium **suppresses `window.confirm()` inside a `beforeunload`
  handler**, so it returned falsy, so the handler called `e.preventDefault()`
  and silently vetoed the close with no dialog ever shown. It was also a
  competing duplicate of the real guard: unsaved changes are owned by the
  main-process handshake (`close` → `window:requestClose` →
  `resolveUnsavedChanges()` → `DialogHost`).
- **Why it produced symptom (b):** Electron fires the BrowserWindow `close`
  event *before* `beforeunload`. So `before-quit` ran `closePreviewWindows()`
  (killing the output window), main allowed the close, and then the renderer
  vetoed it — leaving the app alive with presentation state intact. The failed
  quit also latched the quitting flag, which is why every later close then did
  nothing.
- **Fix:** deleted the `beforeunload` guard. `before-quit` no longer marks
  shutdown immediately — that would discard unsaved work silently — it defers:
  cancels the quit, runs the normal handshake, and re-issues the quit from the
  `closed` handler once the renderer approves. Cancelling the prompt clears the
  deferred quit.
- **Rule added:** `src/pages/__tests__/unsavedChangesGuard.test.ts` fails if any
  renderer page reintroduces a `beforeunload` listener or `window.confirm`.

---

## P1 — Suspicious behavior

### 3. `songSections.js:32` — unnecessary regex escape

- **Where:** `src/utils/songSections.js:32`, `no-useless-escape` on `\[`
- **Why it matters:** this regex parses song section labels. A stray escape in a
  character class is a common source of a pattern that silently matches the
  wrong thing. **Verify what it currently matches before changing it** — write
  a characterization test first, then fix only if behavior is genuinely wrong.

### 3b. `.mov` video imports render upside down

- **Reported by Ethan during Tier 1 verification.** Importing a `.mov` displayed
  it flipped vertically; `.mp4` files were fine.
- **Likely cause:** QuickTime `.mov` files (especially from iPhones) carry a
  rotation/orientation matrix in their metadata. Chromium honors it
  inconsistently depending on how the video element is sized and transformed —
  and this app applies its own CSS transforms for slide scaling, which can
  compose badly with the container's display matrix.
- **Where to look:** `src/components/presenter/OutputRenderer.jsx` and
  `src/components/shared/SlidePreviewSurface.jsx` (the video render paths), plus
  any `transform: scale(...)` applied to the video element rather than a wrapper.
- **Investigate first:** confirm whether the source `.mov` actually carries a
  90/180° rotation matrix (`ffprobe -show_streams` → `side_data` / `rotation`)
  before changing render code. If it does, the fix is to read the orientation
  and normalize it, not to blanket-flip `.mov`.
- **Not yet reproduced by a test.** Needs a sample file committed as a fixture.

### 4. 17 × `react-hooks/set-state-in-effect`

Calling `setState` synchronously in an effect body causes cascading renders.
Concentrated in `Home.jsx` and the editor panels. Each needs individual triage —
some are legitimate sync-with-external-store patterns, some are real perf bugs.
Do **not** bulk-fix; convert to `useSyncExternalStore` or derived state
case-by-case.

### 5. 4 × `react-hooks/immutability` + 1 × `preserve-manual-memoization`

Direct mutation of values React expects to be immutable. Real correctness risk
under concurrent rendering.

---

## P2 — Cleanup

### 6. 36 × `no-unused-vars`

Includes `ensureGroup` (`songSections.js:81`) and `alertDialog`
(`presentationCommands.js:24`) — dead imports/functions. Each removal should be
checked for a *missing call site* rather than assumed dead: an unused import is
sometimes the visible half of a feature that was never wired up (see P0 #1,
which is the same class of mistake in the opposite direction).

### 7. 11 × `no-empty`

Empty catch blocks swallowing errors. Each one hides a failure mode. Replace
with either a real handler or an explicit comment justifying the swallow.

### 8. 16 × `react-hooks/exhaustive-deps` (warnings)

Missing effect dependencies. Classic source of stale-closure bugs.

### 9. Commented-out `presenterWindow` code in `electron/main/index.js`

Kept for rollback when the presenter moved to an in-editor sidebar (Phase 3).
That decision has held for several phases — delete it, since git history is the
real rollback mechanism.

### 10. `/fonts/Inter-Variable.woff2` unresolved at build time

Known Vite warning, carried in `CLAUDE.md` "Known Issues" for multiple phases.

---

## Counts at audit time (2026-09-05, pre-format)

`npx eslint .` → **90 problems (74 errors, 16 warnings)** across:

| Count | Rule | Severity |
|---|---|---|
| 36 | `no-unused-vars` | error |
| 17 | `react-hooks/set-state-in-effect` | error |
| 16 | `react-hooks/exhaustive-deps` | warn |
| 11 | `no-empty` | error |
| 4 | `react-hooks/immutability` | error |
| 3 | `no-undef` | error |
| 1 | `react/no-unescaped-entities` | error |
| 1 | `react-hooks/preserve-manual-memoization` | error |
| 1 | `no-useless-escape` | error |

This table is the **ratchet baseline**. The count must only ever go down.
