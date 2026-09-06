# Executable Plan D2 — `react-hooks/set-state-in-effect` (16 findings, individually)

**Workstream:** D (React correctness) · **Depends on:** D1 (pattern for component render tests)
**Category:** one — state set synchronously inside an effect. Each finding is a
place where React state is "synchronised" from something React already knows,
which costs a second render and is where stale-state bugs breed under
concurrent rendering. The charter forbids bulk fixes: every row below is its
own decision with its own test.

## The sixteen findings

| #     | Site                                       | Shape                                                                                           | Decision                                                                      |
| ----- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1     | `FormattingToolbar.jsx:235` NumberField    | controlled draft mirrors `value` while unfocused                                                | **derive**: shown value = `focused ? draft : value`; draft is seeded on focus |
| 2     | `FormattingToolbar.jsx:460` LineSpacingBtn | `custom` mirrors `value` while closed                                                           | **derive**: seed `custom` when the popover opens (it is hidden while closed)  |
| 3     | `OnboardingTutorial.jsx:57`                | local `stepIndex` mirrors the store's `tutorialStepIndex`, both updated in lock-step everywhere | **remove the mirror**: read the store value; handlers write the store only    |
| 4     | `ApplyThemeModal.jsx:38`                   | form fields reset from `initialTheme`                                                           | reset-on-prop-change — slice 2                                                |
| 5     | `Canvas.jsx:540`                           | layout measurement `setScale` in the mount effect                                               | measurement — slice 3                                                         |
| 6     | `Canvas.jsx:554`                           | reset interaction state when the section changes                                                | reset-on-prop-change — slice 3                                                |
| 7–8   | `Canvas.jsx:574/597`                       | auto-enter edit mode for a fresh slide                                                          | behaviour effect — slice 3                                                    |
| 9     | `Filmstrip.jsx:423`                        | `collapsed` map rebuilt from sections                                                           | derive — slice 2                                                              |
| 10    | `MediaLibraryPanel.jsx:231`                | clear selection when the item disappears                                                        | derive — slice 2                                                              |
| 11–14 | `SongEditorModal.jsx:272/298/305/310`      | form load from `song`; pruning; lyrics mirror; selection normalisation                          | slice 2                                                                       |
| 15    | `OutputRenderer.jsx` countdown             | `setRemaining('00:00')` when inactive                                                           | derive — slice 2                                                              |
| 16    | `Home.jsx:421`                             | clear selection when not visible                                                                | derive — slice 2                                                              |

**Slice 1 (this PR): findings 1–3** — three self-contained components, each
gets a render test that pins current behaviour before the change.

## Tests (written first, characterization: green before and after)

- `src/components/editor/__tests__/FormattingToolbarFields.test.tsx`
  - NumberField: shows `value`; a parent `value` change while unfocused is
    shown; while focused, typing shows the draft and an in-range number
    commits at once; a parent `value` change while focused does **not**
    clobber the draft; blur clamps an out-of-range number through `onCommit`;
    blur with junk reverts to `value`.
  - LineSpacingBtn: closed shows `↕ {value}×`; open shows the custom input
    seeded with `value`; a `value` change while closed is what the next open
    shows.
- `src/components/shared/__tests__/OnboardingTutorial.test.tsx` (store real,
  `createPresentationFromTemplate` mocked): shows "Step 1 of 6"; Next writes
  the store and shows step 2; an external store write to step 4 is reflected;
  Back writes step 3; Next on the last step calls `onComplete` and does not
  advance the store.

`NumberField` and `LineSpacingBtn` gain named exports for the tests only.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius (slice 1)

| File                                               | Action                                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `src/components/editor/FormattingToolbar.jsx`      | NumberField + LineSpacingBtn effects removed; named exports |
| `src/components/shared/OnboardingTutorial.jsx`     | local `stepIndex` state removed                             |
| the two test files                                 | create                                                      |
| `eslint-suppressions.json`                         | prune (51 → 48)                                             |
| `vitest.config.mjs`                                | thresholds only                                             |
| `tasks/fable-notes.md`, `tasks/fable-pass-plan.md` | record                                                      |

### Sanctioned escape hatch — none.

## Todos

- [x] 1. Tests green on current code (characterization). Paste.
- [x] 2. Fixes; the three findings gone from `eslint`; tests still green; prune; gate; E2E (the tutorial dismissal runs in every spec).
- [x] 3. Record; PR.

## Findings — slice 1 (2026-09-06)

- Characterization first: 10 cases; 9 green on the unfixed code. The tenth
  exposed a **suspected UX bug, not changed here**: a NumberField that is
  emptied and blurred commits the _minimum_ (`Number('')` is `0`, which
  clamps to `min`) instead of reverting — clearing the font-size box sets
  size 8. Pinned as current behaviour with the reason in the test name;
  recorded in fable-notes for a decision.
- Findings 1–3 fixed by derivation / removing the mirror; `eslint` reports
  none of them; suppressions 51 → 48; lint warnings 15 → 14 (ceiling
  ratcheted).
- Gate 31 files / 270 tests; E2E 19/19 (the tutorial is dismissed in every
  spec, so the store-owned step is exercised for real).
- Coverage 10.12/8.49/9.09/10.77 → 11.39/9.26/10.21/12.06; thresholds raised.

## Findings — slice 2 (2026-09-06): findings 4, 11–15

- **Finding 4 was dead code.** `ApplyThemeModal.jsx` is imported nowhere;
  the filmstrip's "Style Slides…" applies an appearance snapshot directly.
  Deleted (it also carried a `no-unescaped-entities` suppression).
- Characterization first: SongEditorModal (4 cases: loads title/groups,
  textarea derived from groups, typed text wins, new song empty) and the
  OutputRenderer countdown (active shows `01:30`, inactive hides) — all green
  before and after.
- SongEditorModal: the `[song]` load effect became a lazy initial state
  (`buildSongEditorInitialState`) and the two parents that pass a real song
  now key the modal by song id, so a different song remounts. The three
  sync effects became `lyricsShown` / `activeCollapsedGroupIds` / the
  existing `selection` memo, and the four raw reads of the selection state
  now read the normalised selection.
- Suppressions 48 → **41**; gate 32 files / 275 tests; E2E 19/19.
- Coverage 11.39/9.26/10.21/12.06 → 14.27/12.09/13.11/15.18; thresholds raised.

## Findings — slice 3 (2026-09-06): findings 9, 10, 16

- Two small hooks under `src/hooks/` carry React's documented
  "adjust state while rendering" pattern, unit-tested with `renderHook`
  (10 cases): `useCollapsedSections` (all collapsed per presentation id;
  sections changing under the same id keep the map; updater and plain map)
  and `useClearWhenMissing` (clears only when something is selected and it
  is gone; reacts on a later render).
- The three components lost their effects and two `exhaustive-deps`
  warnings with them: suppressions 41 → **38**, lint warnings 14 → **12**
  (ceiling ratcheted).
- Gate 34 files / 285 tests; E2E 19/19 (Home renders on every launch).
- Coverage 14.27/12.09/13.11/15.18 → 14.51/12.29/13.36/15.39; thresholds raised.
- Remaining in D2: the four Canvas findings (slice 4, its own plan: the
  selection/editing state duplicated between Canvas and the editor store).
