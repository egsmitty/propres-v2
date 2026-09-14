# Executable Plan L3 — the output window stays safe in front of the room

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 1 plan **L3**:
**LIVE-A1** closing Output Settings closes the live projector · **LIVE-A2** an
edit un-blacks the projector · **LIVE-A8** (partly) the on-projector "Close
Preview" pill · **LIVE-A13** the output's resize observer never attaches ·
**LIVE-A14** the output window flashes the light app colour · **LIVE-A15** no
sleep prevention while presenting · **LIVE-C4** the pointer stays on the
projector.

Written per `.cursor/rules/writing-executable-plans.mdc`. Stacked on L2
(`plan-L2-shortcut-guard-and-keymap.md`). L0's, L1's and L2's tests, and
`OutputRenderer.test.tsx` (plan D1), must pass unchanged.

---

## Measured (2026-09-13, branch base `fix/l2-shortcut-guard`)

- **A1.** `OutputSettingsModal.jsx` `handleClose` (Cancel, Save, Escape, backdrop) calls `closeOutputWindow()` / `closeStageDisplayWindow()` whenever `getPreviewWindowState()` reports them open. Main's answer (`index.js` `getPreviewWindowState`) is "is a BrowserWindow alive" — it cannot tell a preview from the live output. `output:close` sends no `presenter:stop`, so the editor still says LIVE while every later advance is dropped.
- **A2.** `OutputRenderer.jsx` `onOutputUpdate` runs `setIsBlack(false); setIsLogo(false)` on **every** update. Main's `output:sendSlide` already calls `resetOutputState()` and `syncOutputState()`, which broadcasts `output:black {active:false}` / `output:logo {active:false}` for a new slide; `output:refreshSlide` — sent for every edit to the live slide — deliberately leaves them. So the renderer's own clear was redundant for a new slide and wrong for a refresh. **No IPC change needed.**
- **A8.** `PreviewCloseButton` renders whenever `isPreviewWindow` (the window is not fullscreen), including while a slide is live.
- **A13.** The resize observer effect has deps `[]` and returns early when `viewportRef.current` is null — which it always is at mount (the ref exists only in the slide branch).
- **A14.** `createOutputWindow` sets no `backgroundColor`; the stage window sets `'#000000'`.
- **A15.** No `powerSaveBlocker` anywhere in `electron/main`.
- **C4.** No `cursor: none` in the output renderer.

## Decisions

1. **A1:** the sheet records which preview windows **it** opened (`openedBySheetRef`) and closes only those. Both preview toggles are disabled while presenting.
2. **A2:** remove the two lines. Main owns black/logo.
3. **A8 (partial):** the pill shows only while no slide is live (`isPreviewWindow && !slide`). Alt+F4 / a main-side close guard is **not** in this plan.
4. **A13:** the observer effect depends on `showingStage` (a slide is live and not black/logo), so it re-attaches whenever the stage mounts.
5. **C4:** `cursor: none` on every fullscreen output root (style value in existing style objects, a class on the placeholder — no new `style={}` prop, so the inline-style budget is unchanged).
6. **A14 + A15:** a pure, tested `electron/main/presentationWindows.ts` — `outputWindowOptions()` (black background, same options otherwise) and `createDisplaySleepBlocker(powerSaveBlocker)`, idempotent: started by every live slide, stopped by `output:stop`, the output window's `closed`, and `prepareForAppShutdown`. New Rollup input `main/presentationWindows`.
7. **Deferred, recorded:** A9 (auto-pick a display) and C9 (Stop → black) wait on Ethan's decision #8; A10 (display hot-plug) waits for L6's injectable `screen` seam; B1 (black restarts the background video) is a separate renderer restructure.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: window options compared whole (`toEqual`); IPC call counts exact;
cursor values exact; the observer is asserted on **the stage root element
itself** (identity), with an exact observe count.

## Blast radius

May create: `electron/main/presentationWindows.ts` and its test,
`src/components/editor/__tests__/OutputSettingsModal.live.test.tsx`,
`src/components/presenter/__tests__/OutputRenderer.safety.test.tsx`. May change:
`src/components/presenter/OutputRenderer.jsx`,
`src/components/editor/OutputSettingsModal.jsx`, `electron/main/index.js` (the
electron import, one require, the blocker instance, the output window options,
four blocker calls), `electron.vite.config.js` (one input), this plan, the
charter row, the notes entry. **May not** change `OutputRenderer.test.tsx`,
`settingsModalsEscape.test.tsx`, or any L0–L2 test.

## Todos

- [x] 1. **Red:** `presentationWindows.test.ts` (5) fails — module missing.
  `OutputSettingsModal.live.test.tsx` (4): Cancel and Escape close live windows
  and the toggles are enabled while presenting → **3 fail**; "a preview the sheet
  opened itself is closed on Cancel" passes (it pins the behaviour to keep).
  `OutputRenderer.safety.test.tsx` (5): un-black, pill and cursor → **3 fail**;
  "a preview window keeps its pointer" passes (characterization).
- [x] 1a. **A test that passed for the wrong reason, corrected.** The first
  observer test asserted "something was observed" and passed on the old code —
  `ScaledSlideText` runs its own ResizeObserver on the text layer. It now asserts
  the stage **root** is observed, by identity and count. A second first-draft
  premise was also wrong: blacking out does not remount the root `<div>` (React
  reuses the node across branches); the ref is cleared and the effect cleaned
  up, so the correct assertion is that the same root is observed **again**
  (count 1 → 2). On the old code it is observed 0 times.
- [x] 2. Implement Decisions 1–6 (anchored, exact-once replacements).
- [ ] 3. The three new files green; `OutputRenderer.test.tsx`,
  `settingsModalsEscape.test.tsx`, `escapeConsumed.test.tsx`,
  `inlineStyleBudget.test.ts` unchanged and green.
- [ ] 4. `npm run gate` (coverage-enforced) + `npm run format:check`.
- [ ] 5. Manual verification — **packaged or dev build, two displays** (owed to
  Ethan, standing rule 7): (a) present, open Output Settings, Cancel / Save /
  Esc → the projector stays up and the editor stays LIVE; (b) the preview
  toggles are greyed while presenting; (c) press B, then edit the live slide's
  text → the projector stays black; (d) the output window never flashes white
  on open; (e) the pointer does not show on the projector; (f) leave a
  presentation on a slide for longer than the display-sleep timeout → the
  display stays on; after Stop, it sleeps normally; (g) open the main output
  preview in a window (no display assigned) → "Close Preview" shows, start
  presenting → it disappears.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; Todo 1a records the corrected assertions — both became **stricter** (identity + exact count) |
| List sampling designed against | Each file's case count stated (5 / 4 / 5); window options compared whole |
| Quantifier erosion designed against | "every stop path releases the blocker" is four named call sites in Decision 6 |
| Sanctioned escape hatch | N/A — no allowlist; deferred items named in Decision 7 |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | Todo 1a (`ScaledSlideText`'s own observer; React reusing the root node); Decision 6 (Rollup input or launch crash); Decision 5 (inline-style budget) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | The modal tests wait for the sheet to report the windows open before acting; the renderer tests await the view-state promise before asserting cursor/pill |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel added or changed (A2 relies on main's existing `output:black` broadcast; Measured) |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test modified (Todo 1a edits a test written in this plan, before implementation landed) |
| 3 | No weakened assertions | Clause verbatim; Todo 1a |
| 4 | Coverage floor | Every decision has at least one case |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom header; app / presenter stores reset; `@/utils/ipc` mocked; `ResizeObserver` stubbed as a measurement seam; `presentationWindows.ts` is electron-free so no `electron` import in tests |
| 9 | Test placement | `electron/main/__tests__/`, `src/components/editor/__tests__/`, `src/components/presenter/__tests__/` |
| 10 | Characterization before refactor | `OutputRenderer.test.tsx` and `settingsModalsEscape.test.tsx` unchanged; the two "keeps" cases in Todo 1 pin behaviour that must survive |
