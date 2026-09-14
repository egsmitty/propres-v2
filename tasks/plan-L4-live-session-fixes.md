# Executable Plan L4 — the small fixes that keep the right slide on the projector

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked), Wave 1 plan **L4**,
as rewritten by the audit's verification pass (the "presenter session owned by
main" rewrite was **deferred**; each of these has a small fix):
**LIVE-A6** leaving the deck while presenting · **LIVE-A4** (= FS-2 / FS-3) the
live slide moved or deleted · **LIVE-A3** advance / refresh race · **LIVE-A7**
double-tap advances once.

Written per `.cursor/rules/writing-executable-plans.mdc`. Stacked on L3. L0–L3's
tests must pass unchanged.

---

## Measured (branch base `fix/l3-output-safety`)

- **A6.** `appCommands.js` `file:open` flips `currentView` to Home; `file:new` loads a new deck; `file:close` runs only the unsaved-changes gate; `TitleBar.jsx` `handleBack` likewise. None checks `isPresenting`. `App.jsx` unmounts the Editor on Home (the presenter key handler goes with it), and the Editor's sync effect then pushes the NEXT deck's slides into the session — the live id is not found, `liveIdx` is -1, and the next press sends that deck's `slides[0]`. `window:requestClose` already had the right confirm.
- **A4.** `presenterFlow.js` `syncPresentationSession` finds the live slide by `sectionId && id`, so a moved live slide stops refreshing. `PresenterPanel.jsx` derives `liveIdx` by id (a move is fine there), but a **deleted** live slide gives `-1`, and `goNext` then sends `slides[0]`. Deleting the live slide from a menu or button asks nothing (L2 already made Backspace / Delete inert while presenting).
- **A3.** `PresenterPanel.goToSlide` marked the slide live only after `await sendSlide`; the sync reads the live id, awaits `setPresentationSessionSlides`, then refreshes — so an advance landing between can have the previous slide refreshed back over it. Main's `output:refreshSlide` repaints whatever it is given.
- **A7.** `liveIdxRef` is updated by an effect after re-render, so two presses inside one round trip both read the old index.

## Decisions

1. **One confirm helper**, `src/utils/leaveWhilePresenting.js` `confirmStopBeforeLeaving(actionLabel)` — the same wording and title as the quit guard; stops the session cleanly on confirm; returns `false` on Cancel. Used by `file:new`, `file:open`, `file:close` (before the unsaved-changes gate) and the title bar's Home. A confirm, not a hard block, for the quit guard's reason.
2. **A4 sync:** find the live slide by id; if its section changed, record the new section.
3. **A4 panel:** remember the last index a live slide actually had. With the live slide gone, next shows the slide that took its place and previous the one before it.
4. **A4 delete:** `deleteSelectedSlideFromCurrentPresentation` asks (`Delete Live Slide`, danger) when the selection includes the live slide.
5. **A3 / A7:** `goToSlide` updates the live index refs and the store **before** `await sendSlide` (optimistic, as the verification pass recommended). Main applies a refresh only to the live slide — `shouldApplyRefresh(current, incoming)` in the tested `presentationWindows.ts`.
6. **Deferred, recorded:** LIVE-E2 (dead presenter message types, the always-null `background` argument, toggle-not-set black/logo) — each needs an IPC contract change. LIVE-E1 (session owned by main) stays deferred.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Comparisons: sent-slide lists exact and ordered; call counts exact; call ordering
(stop before the unsaved-changes gate, stop before creating a new deck) asserted
with `invocationCallOrder`; remaining slide ids exact.

## Blast radius

May create: `src/utils/leaveWhilePresenting.js` and the six test files. May
change: `src/utils/appCommands.js` (import + three cases), `src/components/layout/TitleBar.jsx`
(import + `handleBack`), `src/utils/presenterFlow.js` (the live-slide lookup),
`src/utils/presentationCommands.js` (import + the delete guard),
`src/components/presenter/PresenterPanel.jsx` (refs, `goToSlide`, `goPrev`,
`goNext`), `electron/main/presentationWindows.ts` (`shouldApplyRefresh`),
`electron/main/index.js` (require + `output:refreshSlide`), this plan, the
charter row, the notes entry. **May not** change any L0–L3 test.

## Todos

- [x] 1. **Red** — 21 cases, 18 fail on the old code: `appCommands.leaveWhilePresenting.test.ts` (7; the 6 presenting cases fail, "nothing live → no question" passes), `TitleBar.presenting.test.tsx` (2 fail), `presenterFlow.movedLiveSlide.test.ts` (1 fails), `PresenterPanel.liveSafety.test.tsx` (3 fail: double-tap sent `b, b`; next after deleting the live slide sent slide 1; previous sent nothing), `presentationCommands.deleteLive.test.ts` (4; the 2 live cases fail, the 2 "does not ask" cases pass), `liveRefresh.test.ts` (4 fail, function missing).
- [x] 2. Implement Decisions 1–5 (anchored, exact-once replacements).
- [x] 3. The six files green, and the earlier presenting suites unchanged: `presenterFlow`, `PresenterPanel.keys`, `PresenterPanel.clicker`, `appCommands.present`, `appCommands.closeGuard`, `editorKeyAction`, `TitleBar`, `presentationCommands`, `presentationWindows`, `OutputRenderer.safety` → 104 / 104.
- [x] 4. `npm run gate` + `npm run format:check` → on the branch merged with `main` @ `7bfedb0` (L3 #141 squashed, SEC1/ED2/MB1/H2/DB2 landed): `vitest 875/875 passed`, format ✓; the L0–L4, D3, SEC1, startup-failure and lifecycle suites 283/283. Merge conflicts were only lines neighbouring PRs added beside L4's (`index.js` requires, `appCommands.js` guards, `presentationWindows.ts`), all kept.
- [ ] 5. Manual verification (owed to Ethan, standing rule 7): present, then (a) File ▸ Open → "Still Presenting"; Cancel keeps the projector and the editor; Stop Presenting ends it and goes Home; the same for File ▸ Close, File ▸ New and the Home button; (b) delete the live slide from the filmstrip menu → asked; confirm, then press → the slide after it goes up, not slide 1; (c) Move to Section… on the live slide, then edit it → the projector updates; (d) double-tap a clicker → two slides.
- [ ] 6. Findings report in the PR body.

## Compliance Manifest

### writing-executable-plans.mdc (14 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact lists, counts and call ordering |
| List sampling designed against | Four leaving paths each have their own Cancel and Confirm case |
| Quantifier erosion designed against | "every way of leaving the deck" is the enumerated list in Decision 1, each tested |
| Sanctioned escape hatch | N/A — no allowlist; deferred items named in Decision 6 |
| Bounded blast radius | Blast radius section |
| File-specific pitfall notes | `PresenterPanel`'s live index ref lags a render (Measured A7); the helper imports `presenterFlow`, so tests mock that module rather than `ipc` for the stop |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | The panel's keys mount only while presenting — `presentFrom()` seeds it; TitleBar renders only in the editor view — seeded |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no channel added or changed; `output:refreshSlide` keeps its payload and envelope |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6 |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 red before Todo 2 |
| 2 | Behavior-change test edits | N/A — no existing test modified |
| 3 | No weakened assertions | Clause verbatim; exact comparisons |
| 4 | Coverage floor | Each decision and each leaving path has its own case |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch` |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | jsdom header where needed; app / editor / presenter / dialog stores reset; `@/utils/ipc` mocked; `ResizeObserver` and `scrollIntoView` stubbed as seams |
| 9 | Test placement | `src/utils/__tests__/`, `src/components/layout/__tests__/`, `src/components/presenter/__tests__/`, `electron/main/__tests__/` |
| 10 | Characterization before refactor | L0's presenting characterization and L2 / L3's suites pass unchanged (Todo 3) |
