# Plan H1 — Home presentation-row list fixes

Audit source: `tasks/fable-pass-2-audit.md` (local, untracked) items HOME-9,
HOME-11, HOME-24. Scope: `presenter-pro/src/pages/Home.jsx` only (in bounds —
not on the OUT OF BOUNDS list for this PR stack).

## Measured

- `presenter-pro/src/pages/Home.jsx:990-994` — the row's click wiring today:
  ```
  onClick={() => {
    onSelect?.();
    void onOpen(presentation);
  }}
  onDoubleClick={() => void onOpen(presentation)}
  ```
  A real double-click dispatches `click`, `click`, `dblclick` in sequence, so
  this fires `onOpen` three times for one double-click.
- `presenter-pro/src/pages/Home.jsx:209-217` — `handleOpen` has no in-flight
  guard:
  ```
  async function handleOpen(pres) {
    setHiddenRecentIds((current) => { ... });
    await openPresentationInEditor(pres.id);
  }
  ```
- `presenter-pro/src/pages/Home.jsx:949-999` — `PresentationRow` is a
  `role="button" tabIndex={0}` div (line 969-970) containing two real
  `<button>` elements (Pin, More — lines 1019, 1035). Invalid nesting
  (button-in-button-role); fixing it changes markup/layout and is out of
  scope per the task brief (baselines guard it) — recorded as a Finding, not
  fixed here.
- `presenter-pro/src/pages/Home.jsx:962,965,998-999` —
  ```
  const [hovered, setHovered] = useState(false);
  ...
  const showActions = hovered || selected || menuOpen;
  ...
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
  ```
  No focus-driven path sets `showActions` true, so a keyboard user who tabs
  onto the row (it is natively focusable) cannot reach Pin/More — they render
  a spacer div (line 1058) instead.
- `presenter-pro/src/pages/Home.jsx:96-99`:
  ```
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  ```
  Hard-coded `'en-US'`, date-only, no "today" relative/time form.
- `presenter-pro/e2e/fixtures/visual.ts:12,17-23`:
  ```
  export const DATE_TEXT = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
  ...
  export function homeMasks(page: Page): Locator[] {
    return [page.getByText(DATE_TEXT), page.locator('[data-profile-card="true"]')];
  }
  ```
  `homeMasks` masks a row's date cell in `home.png`, `home-recent.png`,
  `home-open.png`, `home-open-empty.png` (via `visual.spec.ts` and
  `visual-home.spec.ts`) **only when the rendered text matches
  `DATE_TEXT`** — i.e. only the current `"Mon D, YYYY"` shape. The one
  baseline capture that shows a row's date cell without going through
  `homeMasks` is `hover-home-pin.png` in `e2e/visual-hover.spec.ts:66-72`; its
  `clip` box is the Pin button's bounding box (44px) + 12px padding inside the
  128px-wide, third grid column, which does not overlap the 180px-wide date
  column, so that capture is unaffected either way.
- `presenter-pro/src/__tests__/inlineStyleBudget.test.ts:24` — `pages/Home.jsx`
  ceiling is `9`; current count is `9` (verified: `grep -c 'style={' Home.jsx`
  → 9). `:71` — `HOVER_HANDLER_BUDGET['pages/Home.jsx']` is `1`; current
  `onMouseEnter` count is `1`. Both ratchets are exact-match tests (fail if the
  count moves either direction) — this plan must not change either count.
- `presenter-pro/src/__tests__/keyboardReachability.test.ts:39-59` — flags any
  non-native element with `onClick` that isn't `role` + `tabIndex` +
  `onKeyDown` or `data-backdrop="true"`. The row already satisfies this
  (line 969-977); this plan does not change that shape.

## Decisions

1. **HOME-9 fix location.** Guard lives in `handleOpen` itself (a
   `useRef(new Set())` of in-flight presentation ids), not in
   `PresentationRow`, because `handleOpen` is the single call site reached
   from the row's click, the row's `Enter`/`Space` keydown (line 972-978), the
   context menu's "Open" item (line 534), and `RecentLibrary`/`OpenLibrary`.
   Guarding once in `handleOpen` covers all of them; guarding only the row's
   click would leave the other paths racing.
2. **`onDoubleClick` removal, not a debounce.** The task brief requires
   removing the handler outright (Google Docs behaviour: single click opens).
   A debounce would still call `onOpen` twice for two independent clicks close
   together; a ref-guarded async function only re-enters while the previous
   call for that same id is still in flight, which is the actual bug (three
   concurrent `touch`/`load`/`ensureVersion` round trips), not "clicks too
   close together."
3. **Guard scope is per-presentation-id, not global.** Two different rows
   opened in quick succession are legitimate (e.g. arrow-key + Enter across
   rows); only re-entrant opens of the *same* id are the bug.
4. **HOME-11 fix is `focus`/`blur` state, not a CSS `group-focus-within`
   variant.** `showActions` already gates on JS state (`hovered`, `selected`,
   `menuOpen`); adding a fourth boolean (`focusWithin`) to the same
   `||` expression is the smallest change and touches zero classes, so it
   cannot move a screenshot baseline. A `group-focus-within:` Tailwind class
   would require restructuring the conditional render into always-mounted +
   CSS-visibility, which is a bigger, riskier diff for the same outcome.
5. **`focusWithin` correctness.** Row and both buttons are all independently
   focusable elements inside one container. `onFocus`/`onBlur` are React's
   bubbling focus-in/focus-out (unlike native non-bubbling `focus`/`blur`), so
   a single pair of handlers on the row div correctly tracks "focus is
   somewhere inside this row": `onBlur` only clears state when
   `!e.currentTarget.contains(e.relatedTarget)` (focus left the row entirely,
   not moved from the row to its own Pin button).
6. **The `role="button"`-containing-`<button>` nesting is a Finding, not a
   fix.** Per the task brief, restructuring it changes layout/baselines and is
   explicitly out of scope for this PR.
7. **HOME-24 is SKIPPED.** `DATE_TEXT` (Measured, above) matches only the
   literal `"Mon D, YYYY"` shape. Introducing a `"Today, 9:14 AM"` variant for
   rows updated today means: on any day a baseline-captured row (e.g. "Sunday
   Morning Service" in `hover-home-pin.png`'s row, or any row visible in
   `home.png`/`home-recent.png`/`home-open.png`) was last updated *today*,
   that row's date cell would render text `homeMasks` cannot match, leaving a
   live, non-deterministic ("today" + current time) string unmasked in a
   pixel-diffed screenshot. That is exactly the "dates appear unmasked, and
   baselines would move" condition the task brief says to skip on. Widening
   `DATE_TEXT` to also match the new shape would fix this, but
   `e2e/fixtures/visual.ts` is shared baseline-safety infrastructure the task
   brief calls out by name as something to read-before-touching, not edit as
   a side effect of an unrelated P2 formatting change, and no current CI run
   can prove which baseline presentations were "updated today" without
   inspecting fixture seed data outside this plan's blast radius. Skipping is
   the smaller, safer change. No code or test changes for this item; recorded
   as a Finding for a follow-up PR that also updates `DATE_TEXT`/`homeMasks`
   and re-captures if anything moves.

## Anti-weakening clause

If an assertion fails, the bug is elsewhere — never loosen the assertion to
pass. Fix the root cause or record it as a suspected regression.

## Comparisons: order / count / exactness

- HOME-9 test: `openPresentationInEditor` call **count** must be exactly `1`
  (`toHaveBeenCalledTimes(1)`) after `click, click, dblclick` — exact count,
  not "at least once", not "at most N".
- HOME-11 test: the Pin and More buttons must each be present in the
  document (`toBeInTheDocument()`) after focus — presence, not a count (there
  is exactly one of each per row already, unchanged by this plan).
- `inlineStyleBudget.test.ts` / `keyboardReachability.test.ts`: exact-count
  ratchets — this plan must leave both counts unchanged (9 and 1
  respectively); if either moves, that is a bug in this plan's diff, not a
  reason to edit the budget.

## Blast radius

- **May edit:** `presenter-pro/src/pages/Home.jsx`,
  `presenter-pro/src/pages/__tests__/Home.test.tsx` (new file).
- **May NOT edit:** anything under `presenter-pro/src/pages/Editor.jsx`,
  `presenter-pro/src/components/presenter/**`,
  `presenter-pro/src/utils/appCommands.js`,
  `presenter-pro/src/utils/presenterFlow.js`,
  `presenter-pro/src/utils/presentationCommands.js` (call its exports only),
  `presenter-pro/src/components/layout/**`,
  `presenter-pro/src/components/shared/**`, `presenter-pro/electron/**`. Also
  not editing (by Decision 7): `presenter-pro/e2e/fixtures/visual.ts`,
  `presenter-pro/e2e/visual*.spec.ts`,
  `presenter-pro/src/__tests__/inlineStyleBudget.test.ts`,
  `presenter-pro/src/__tests__/keyboardReachability.test.ts`.
- No IPC channel is touched. No migration/data rewrite. No snapshot test is
  added or touched.

## Todos

- [x] **T1 — Red test, HOME-9.** Create
  `presenter-pro/src/pages/__tests__/Home.test.tsx`. Mock `@/utils/ipc`
  (`getPresentations`, `getProfile`) and `@/utils/presentationCommands`
  (`createNewPresentation`, `createPresentationFromTemplate`,
  `deletePresentationById`, `openPresentationInEditor`,
  `renamePresentationById`). Seed `getPresentations` to resolve one
  presentation with `sections: []` (avoids mounting `ScaledSlideText`, which
  needs a real `ResizeObserver` jsdom does not provide — confirmed absent
  from `vitest.setup.mjs`). Reset `useAppStore` to its captured initial state
  in `beforeEach` (module singleton, skeleton B). `render(<Home />)`,
  `await screen.findByRole('button', { name: /Sunday Morning Service/ })`,
  then `fireEvent.click(row); fireEvent.click(row);
  fireEvent.doubleClick(row);` and assert
  `expect(openPresentationInEditor).toHaveBeenCalledTimes(1)`. Run:
  `npx vitest run src/pages/__tests__/Home.test.tsx -t "opens once"` — must
  FAIL on current code (3 calls) before any source edit. Capture the red
  output for the PR body.
- [x] **T2 — Red test, HOME-11.** In the same file, a second test: same
  render/find-row setup, then (wrapped in `act`) `row.focus()`, and assert
  `screen.getByRole('button', { name: /Pin presentation/ })` and
  `screen.getByRole('button', { name: 'More actions' })` are both
  `toBeInTheDocument()`. Run:
  `npx vitest run src/pages/__tests__/Home.test.tsx -t "keyboard focus"` —
  must FAIL on current code (spacer div renders instead) before any source
  edit. Capture the red output for the PR body.
- [x] **T3 — Fix HOME-9.** In `Home.jsx`: add `useRef` to the existing React
  import. Add `const openingPresentationIdsRef = useRef(new Set());` inside
  `Home()`. Rewrite `handleOpen` to check-and-set the ref before the async
  work and delete from it in a `finally`, short-circuiting if the id is
  already present. Remove the `onDoubleClick` prop from `PresentationRow`
  (line 994) entirely — do not replace it with anything.
- [x] **T4 — Fix HOME-11.** In `PresentationRow`: add
  `const [focusWithin, setFocusWithin] = useState(false);` beside the
  existing `hovered` state. Change `showActions` to
  `hovered || selected || menuOpen || focusWithin`. Add `onFocus={() =>
  setFocusWithin(true)}` and `onBlur={(e) => { if
  (!e.currentTarget.contains(e.relatedTarget)) setFocusWithin(false); }}` to
  the row's root div, alongside its existing `onMouseEnter`/`onMouseLeave`.
  Do not touch the div's `role`/`tabIndex`/nesting.
- [x] **T5 — Green.** Run
  `npx vitest run src/pages/__tests__/Home.test.tsx` — both new tests pass.
  Capture the green output for the PR body.
- [x] **T6 — Ratchets unchanged.** Run
  `npx vitest run src/__tests__/inlineStyleBudget.test.ts
  src/__tests__/keyboardReachability.test.ts` — both green, counts unchanged
  (9 inline styles, 1 hover handler for `pages/Home.jsx`).
- [x] **T7 — Full gate.** From `presenter-pro/`: `npm run gate && npm run
  format:check`. Report `type-check`, `lint`, `vitest N/N passed (0
  skipped)`, and the coverage line. If coverage fails, STOP and report — do
  not lower thresholds.
- [x] **T8 — Findings + records.** Write the PR body's `## Findings` section
  (role-in-role nesting on the row; HOME-24 skip reasoning). Append one row to
  `tasks/fable-pass-plan.md`'s status table and a `## H1 — <title>
  (2026-09-13)` section (preceded by a blank-line-wrapped `---`) at the end of
  `tasks/fable-notes.md`.

## Compliance Manifest

### writing-executable-plans.mdc

- Assertion weakening — order/count/exactness stated per comparison: T1/T2 —
  "Comparisons" section above.
- List sampling — the three audit items are itemized as an exhaustive,
  numbered set (HOME-9, HOME-11, HOME-24), each with its own todo(s) and
  disposition (fixed, fixed, skipped-with-reason); no prose enumeration used.
- Quantifier erosion — N/A — this plan's assertions are single-element
  presence/count checks (one row, one guard), not "every X in a collection";
  no quantifier is at risk of erosion.
- Sanctioned escape hatches — N/A — no allowlist/exemption constant is
  introduced by this plan.
- Bounded blast radius — "Blast radius" section above.
- File-specific pitfall notes — Measured section: `ResizeObserver` gap
  (T1), `DATE_TEXT` mask shape (Decision 7), focus bubbling via
  `onFocus`/`onBlur` vs. native `focus`/`blur` (Decision 5).
- Exact paths, no improvisation — Blast radius section lists exact paths;
  T1 states the one new file's exact path.
- Per-todo verification — every todo (T1–T7) names its exact command.
- Snapshot policy inline — N/A — no snapshot is added or touched by this
  plan.
- Preconditions for conditional UI — T1 states why `sections: []` is
  required to reach the row without hitting the `ResizeObserver` gap; T2
  states the precondition for the Pin/More buttons (focus-within) that this
  plan itself adds.
- Structural floor under every snapshot — N/A — no snapshot in this plan.
- IPC contract pinning — N/A — no `ipcMain`/`ipcRenderer` channel is
  touched; `openPresentationInEditor` is called through
  `presentationCommands.js`'s existing export, unchanged.
- Data rewrites state backup/rollback — N/A — no data/row/snapshot rewrite.
- Manual verification steps — user-facing change (double-click behaviour,
  keyboard-visible Pin/More). Manual check: `npm run dev` from
  `presenter-pro/`, on Home with at least one presentation row — (a) rapid
  double-click a row and confirm the editor opens once, not with a
  version-conflict/duplicate-load symptom; (b) `Tab` from the sidebar into
  the presentation list and confirm Pin/More become visible on the focused
  row without a mouse.
- Required findings report — T8.

### testing-standards.mdc (all 10 items)

1. TDD ordering — T1/T2 (red) precede T3/T4 (implementation) precede T5
   (green).
2. Behavior-change test edits — N/A — no existing test is modified; both
   new tests are net-new files/cases.
3. No weakened assertions — anti-weakening clause carried verbatim above;
   "Comparisons" section states order/count/exactness per assertion.
4. Coverage floor — one test per fixed behavior (T1 for HOME-9, T2 for
   HOME-11); HOME-24 has no new function since it is skipped.
5. Lint floor — no `.only`/`.skip`; both tests assert with `expect`; no
   `expect` inside `if`/`catch`.
6. Snapshot discipline — N/A — no snapshot in this plan.
7. Completion gate — T7.
8. Vitest/jsdom mechanics — T1 states `@vitest-environment jsdom`,
   `@testing-library/jest-dom/vitest`, `useAppStore` reset in `beforeEach`,
   `@/utils/ipc` mocked (never `electron`), no `better-sqlite3` load, no
   timers needed (no time-dependent behavior touched by the fixed items),
   the `ResizeObserver` measurement gap is avoided by seed data rather than
   asserted through it.
9. Test placement — `presenter-pro/src/pages/__tests__/Home.test.tsx`
   matches the "Page-level wiring" row of the placement table.
10. Characterization before refactor — N/A — this plan does not restructure
    `Home.jsx`; it adds a ref guard and a boolean to existing functions
    without changing the file's shape/extraction boundaries.
