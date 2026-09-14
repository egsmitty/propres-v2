# Executable Plan V1 — version history edge cases

**Source:** `tasks/fable-pass-2-audit.md` (local, untracked): **SAVE-B12** ·
P2 · [S] · SUSPECTED — content key compares JSON with nested insertion order
· **SAVE-B13** · P3 · [S] · CONFIRMED — the Unsaved Changes gate acts on
click-time state after the dialog resolves · **SAVE-C6** · P2 · [S] ·
partial — ambiguous version labels (days 2-6 show no time; same-day rows can
render identically). The "Before restore" kind and any new stored field are
explicitly out of scope for SAVE-C6 — recorded as a Finding, not fixed.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`e24a2f8`.

---

## Measured

| Item | Code | What happened |
|---|---|---|
| SAVE-B12 | `presentationVersions.ts` `presentationContentKey`: `JSON.stringify(content)` | `content`'s own top-level keys are always inserted in `CONTENT_FIELDS` order, so the bug is one level down — `content.sections` is the input's `sections` array copied through as-is, so a section/slide object built with different key insertion order (e.g. a DB round trip vs. a fresh object literal) produced a different string for an otherwise-identical document. `hasDiverged` and autosave's dirty check both rest on this key, so a spurious mismatch reads as "diverged" / "unsaved changes" that isn't real. |
| SAVE-B13 | `unsavedChanges.js` `resolveUnsavedChanges({ presentation, isDirty, requiresInitialSave, ... })` | These are destructured **parameters**, captured by the caller (`appCommands.js`, `TitleBar.jsx`) at click time via `useEditorStore.getState()` *before* the function runs. The function `await`s `showDialog(...)` and then acts on the same closed-over values — never re-reading the store. If autosave commits, or the presentation is saved/deleted elsewhere, while the dialog sits open, Save/Discard act on the stale snapshot. |
| SAVE-C6 | `versionLabels.ts` `formatVersionTimestamp` | Today/Yesterday show a time; the `days < 7` (weekday) branch returned `WEEKDAY.format(date)` with **no time at all**, so two versions saved on the same weekday were indistinguishable. There was also no cross-row awareness: nothing looked at the *list* of versions being rendered, so any two rows landing on the same label (same day and, for Today/Yesterday, the same minute) rendered as duplicates — routine under autosave, which can write a version every few minutes of activity. |

## Decisions

1. **SAVE-B12** — `presentationContentKey` canonicalizes its `content` object
   with a recursive key-sort (`canonicalize`) before `JSON.stringify`. Arrays
   keep their own order and have their elements canonicalized in place —
   reordering slides is a real difference, not noise, so only *object* key
   order is normalized, never array element order.
2. **SAVE-B13** — after the dialog resolves, `resolveUnsavedChanges` reads
   `useEditorStore.getState()` and uses the live `presentation` /
   `requiresInitialSave` **only when the store is still tracking the same
   document** (`current.presentation?.id === presentation.id`). If the store
   has moved on to a different presentation, or was never populated (as in
   the existing unit tests, which mock parameters without touching the real
   store — this is also how a caller that never wired the store would
   behave), the click-time parameters are used exactly as before. This keeps
   the function's existing signature and every existing caller
   (`appCommands.js`, `TitleBar.jsx`) unchanged.
3. **SAVE-C6, part 1 (always include the time)** — the weekday branch (days
   2-6) becomes `` `${WEEKDAY.format(date)}, ${TIME.format(date)}` ``. The
   oldest bucket (`FULL`, 7+ days) is unchanged — out of the audit's stated
   scope ("days 2-6") and the exact minute genuinely is noise a year later.
4. **SAVE-C6, part 2 (make colliding rows distinguishable)** — a new pure
   function, `formatVersionLabels(versions, now)`, formats a WHOLE list at
   once: it computes each row's base label via `formatVersionTimestamp`,
   counts collisions across the list, and appends `` (H:MM:SS AM/PM) `` only
   to labels that collide with at least one other label in the same list. A
   label with no collision is returned untouched. `VersionHistoryModal.jsx`
   is rewired to call `formatVersionLabels(versions, loadedAt)` once and
   index into the result, instead of calling `formatVersionTimestamp` per
   row with no sibling context — this is the change that actually makes the
   fix reach the screen, so it is in scope alongside the pure labelling
   despite `VersionHistoryModal.jsx` not being named in SAVE-C6's "Measured"
   line. The single-row confirm dialog (`handleRestore`) keeps calling
   `formatVersionTimestamp` directly — one row, no collision to resolve.
5. **Scaffold-first TDD for `formatVersionLabels`.** Because it is a
   genuinely new exported function, a red test asserting it against a
   *nonexistent* export would fail on a `TypeError` before reaching any
   `expect()` — exactly the "not a red" case the hard rules rule out. So
   Todo 1 lands a naive stub first (`versions.map(formatVersionTimestamp)`,
   no de-duplication — functionally "the current code" for this feature),
   confirms the collision tests fail **on their assertions** against that
   stub, and only then Todo 2 replaces the stub with the real
   count-and-append logic. This is recorded here so the technique is
   auditable, not silently skipped over.
6. **SAVE-C6 explicitly NOT done** (per the item's own scope note): no
   "Before restore" kind, no new stored field. `formatVersionLabels` is
   purely a display-time transform over `saved_at`; it has no opinion on
   *why* two versions are close together.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record
it as a suspected regression._

Comparisons: content-key equality/inequality is exact string equality;
`updatePresentation` / `deletePresentation` / `revertToLatestVersion` mock
call lists are compared with `toEqual` against the exact `[args]` tuple
(order and count both matter — each function is asserted called at most
once per test); label collision tests compare with `toBe` (single value) and
`new Set(...).size` (count of distinct values, not order).

## Blast radius

May change: `src/utils/presentationVersions.ts` (`presentationContentKey`,
plus new private `canonicalize` helper), `src/utils/unsavedChanges.js`
(`resolveUnsavedChanges`), `src/utils/versionLabels.ts`
(`formatVersionTimestamp`, new `formatVersionLabels`),
`src/components/editor/VersionHistoryModal.jsx` (wiring only — swaps a
per-row `formatVersionTimestamp` call for an indexed `formatVersionLabels`
result), `src/utils/__tests__/presentationVersions.test.ts`,
`src/utils/__tests__/versionLabels.test.ts` (one case behavior-changed, five
cases added), the charter row, the notes entry. May create:
`src/utils/__tests__/unsavedChanges.freshState.test.ts`. **May not** change
`src/utils/__tests__/unsavedChanges.test.ts`,
`src/utils/__tests__/unsavedChanges.captureFailure.test.ts`,
`src/components/editor/__tests__/VersionHistoryModal.test.tsx`, or any file
in the "do NOT edit" list (`appCommands.js`, `SongEditorModal.jsx`,
`OnboardingTutorial.jsx`, `presentationTemplates.js`, `Editor.jsx`,
`PresenterPanel.jsx`, `Canvas.jsx`, anything under `electron/`).

## Todos

- [x] 1. **Red.**
  - `presentationVersions.test.ts`: 3 new cases in a new
    `describe('presentationContentKey key-order canonicalization (SAVE-B12)')`
    block — 1 fails on the old code (`JSON.stringify` with no key sort); the
    other 2 (a real content difference survives key-order noise; array
    element order is preserved) pass on old code too and stay as guard rails
    against a weakened fix.
    Verify: `npx vitest run src/utils/__tests__/presentationVersions.test.ts`
  - `unsavedChanges.freshState.test.ts` (new file): 2 new cases — both fail
    on the old code, because `resolveUnsavedChanges` never reads the store
    at all.
    Verify: `npx vitest run src/utils/__tests__/unsavedChanges.freshState.test.ts`
  - `versionLabels.test.ts`: one existing case
    ("labels earlier this week by day, without a time") is a BEHAVIOUR
    CHANGE — renamed to "... WITH the time" and its assertion flipped from
    "no time" to "a time is present"; fails on the old code, passes on the
    new, called out in the file and here. A naive stub `formatVersionLabels`
    (map-only, no de-duplication) is added to `versionLabels.ts` first, so
    the 5 new cases in a new `describe('formatVersionLabels')` block fail
    **on their assertions** rather than on a missing export: 2 of the 5 fail
    against the stub (the two-way and three-way disambiguation cases); the
    other 3 pass against the stub too and stay as guard rails (no-collision
    passthrough, base-label-as-prefix, an uninvolved row in a colliding list
    stays untouched).
    Verify: `npx vitest run src/utils/__tests__/versionLabels.test.ts`
  - Total: 10 new cases across 3 files (1 + 2 + 5, plus the array-order and
    real-difference guard cases counted above), 5 fail on the old code, plus
    1 modified existing case that fails old / passes new.
- [x] 2. Implement Decisions 1-4: canonical sort in `presentationVersions.ts`;
  store re-read (guarded by same-document check) in `unsavedChanges.js`;
  weekday time + real `formatVersionLabels` in `versionLabels.ts`; wire
  `VersionHistoryModal.jsx` to the list function.
- [x] 3. All three edited/new test files plus the untouched suites that
  exercise the same code paths
  (`unsavedChanges.test.ts`, `unsavedChanges.captureFailure.test.ts`,
  `unsavedChangesGuard.test.ts`, `VersionHistoryModal.test.tsx`) →
  green, no case count regression.
  Verify: `npx vitest run src/utils/__tests__/unsavedChanges.freshState.test.ts src/utils/__tests__/unsavedChanges.test.ts src/utils/__tests__/unsavedChanges.captureFailure.test.ts src/utils/__tests__/presentationVersions.test.ts src/pages/__tests__/unsavedChangesGuard.test.ts src/utils/__tests__/versionLabels.test.ts src/components/editor/__tests__/VersionHistoryModal.test.tsx`
- [x] 4. `npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 647/647 passed
  (0 skipped)`; `npm run format:check` → all matched files use Prettier
  style.
- [ ] 5. Manual verification (owed to Ethan, desktop-app addendum): open a
  presentation, save it a few times in quick succession (within the same
  minute) via ⌘S, then open File ▸ Version History — confirm the rows that
  landed in the same minute now show distinct times (with seconds) instead
  of identical labels, and a row from a different minute is untouched.
  Separately, trigger the Unsaved Changes dialog (e.g. Back with unsaved
  edits), let autosave fire while the dialog is open (wait ~2s), then click
  Save — confirm the write reflects the latest edits rather than what was on
  screen when the dialog opened.
- [ ] 6. Findings report in the PR body.

## Findings (preview — finalized in the PR)

- SAVE-C6's "Before restore" kind and any new stored field are explicitly out
  of scope per the audit item itself ("partial") and are not attempted here —
  this needs a data/schema change (a `kind` column or similar) that the audit
  itself defers.
- No E2E visual baseline captures version-history labels:
  `e2e/versionHistory.spec.ts` has no `toHaveScreenshot()` call and the one
  text assertion it makes (`getByText('Current')`) does not depend on the
  timestamp label; no `e2e/*-snapshots/*.png` is named for version history.
  Grepped `e2e/*.spec.ts` for `version-history` / `VersionHistoryModal` /
  `toHaveScreenshot` to confirm.
- `VersionHistoryModal.jsx` was touched even though SAVE-C6's "Measured" row
  only names `versionLabels.ts` — recorded above in Decision 4 as the
  necessary wiring to make the collision fix visible; it is not on the
  do-not-edit list.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; exact string/tuple/count comparisons throughout (see "Comparisons") |
| List sampling designed against | Each item (B12, B13, C6-time, C6-collision) has its own dedicated test block, not a shared/sampled case |
| Quantifier erosion designed against | "every caller of resolveUnsavedChanges" is the two real callers (`appCommands.js`, `TitleBar.jsx`) found by grep in Measured; the function signature is unchanged so both keep working without edits |
| Sanctioned escape hatch | N/A — no allowlist |
| Bounded blast radius | Blast radius section; the do-NOT-edit file list is repeated there |
| File-specific pitfall notes | Decision 2 (same-document guard, or the pre-existing unit tests that never populate the real store would flip behavior); Decision 5 (scaffold-first technique for a brand-new pure function, so red is on an assertion not a crash) |
| Exact paths | Blast radius |
| Per-todo verification | Todos 1, 3, 4 |
| Snapshot policy inline | N/A — no snapshots |
| Preconditions for conditional UI | N/A — no new conditional UI; `VersionHistoryModal`'s existing render gates (loading / error / empty) are untouched |
| Structural floor under snapshots | N/A — no snapshots |
| IPC contract pinning | N/A — no IPC channel or payload touched; all three items are pure-function / renderer-only fixes |
| Manual verification steps | Todo 5 |
| Required findings report | Todo 6; preview above |
| Data rewrites state their backup and rollback | N/A — no stored rows or snapshots are rewritten; `formatVersionLabels` is a display-time transform only |

### testing-standards.mdc (10 items)

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (red) before Todo 2 (implementation) for all three items |
| 2 | Behavior-change test edits | `versionLabels.test.ts`, one case ("labels earlier this week...") — fails under old code (no time present), passes under new, stated in the file and here (Decision 3) |
| 3 | No weakened assertions | Clause verbatim; exact comparisons per "Comparisons" above |
| 4 | Coverage floor | Each decision (B12 canonicalization, B13 same-document guard, C6 time, C6 collision) has at least one dedicated case, several have guard-rail cases against over-fixing |
| 5 | Lint floor | No `.only`/`.skip`; every case asserts; no `expect` in `if`/`catch`; confirmed by `npm run lint` in the gate |
| 6 | Snapshot discipline | N/A — no snapshots |
| 7 | Completion gate | Todo 4 |
| 8 | Vitest / jsdom mechanics | `unsavedChanges.freshState.test.ts` resets the real `useEditorStore` in `beforeEach` (module singleton) and mocks `@/utils/ipc`, `@/utils/dialog`, `@/utils/autosaveSync`, `@/utils/presentationVersionsSync` — never `electron`; `presentationVersions.test.ts` / `versionLabels.test.ts` are pure-function tests, no DOM; `VersionHistoryModal.test.tsx` (untouched) already resets the store and mocks IPC |
| 9 | Test placement | `src/utils/__tests__/` for all three (pure utils) |
| 10 | Characterization before refactor | N/A — targeted bug fixes to already-tested pure functions, not a restructuring of an untested large file; existing suites (Todo 3) pass unchanged except the one Decision-3 case |

## Review

All three items landed. `presentationContentKey` now canonicalizes nested
object keys (arrays keep their element order) so two deep-equal documents
never produce different content keys because of insertion order —
`hasDiverged` / autosave's dirty check inherit the fix for free, no change
needed there. `resolveUnsavedChanges` re-reads `useEditorStore.getState()`
after the dialog resolves and acts on it whenever the store is still
tracking the same document (by id), so a Save that lands after autosave
committed mid-dialog writes the current content, not the click-time
snapshot; its signature and both real callers (`appCommands.js`,
`TitleBar.jsx`) are unchanged. Version labels always carry a time now (days
2-6 previously showed a bare date), and a new `formatVersionLabels` looks at
the whole list on screen at once and appends seconds only to the rows that
would otherwise be indistinguishable from a sibling — wired into
`VersionHistoryModal.jsx` so the fix is actually visible, not just
available.

10 new test cases across 3 files, 5 failing on the old code before the fix
(1 in `presentationVersions.test.ts`, 2 in the new
`unsavedChanges.freshState.test.ts`, 2 in `versionLabels.test.ts`), plus one
existing `versionLabels.test.ts` case deliberately behavior-changed (stated
in the file and in Decision 3 above) — it asserted the old bug ("without a
time") and now asserts the fix. No other existing test was touched.
`formatVersionLabels` was scaffolded as a stub first specifically so its red
tests could fail on their assertions rather than on a missing export
(Decision 5) — both technique and result are recorded here for audit.

`npm run gate` → `gate: type-check ✓ · lint ✓ · vitest 647/647 passed (0
skipped)`. `npm run format:check` → clean, no `prettier --write` needed.

Manual verification (Todo 5) and the findings report (Todo 6) are owed to
Ethan / the PR body respectively — not run here per the task's "do not
launch the app" instruction.
