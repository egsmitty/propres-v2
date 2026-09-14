# Plan H2 — Onboarding and template accuracy

Audit source: `tasks/fable-pass-2-audit.md` (local, untracked) items HOME-12,
HOME-13, HOME-14, HOME-15. None is tagged `[F]`, so none needs an Architect
decision before fixing. Scope: `presenter-pro/src/utils/presentationTemplates.js`
and `presenter-pro/src/components/shared/OnboardingTutorial.jsx` only.

## Measured

- `presenter-pro/src/utils/presentationTemplates.js:178-360` —
  `PRESENTATION_TEMPLATES`, 7 real templates (`sunday-service`, `worship-set`,
  `sermon-scripture`, `featured-sunday-example`, `announcement-loop`,
  `student-night`, `prayer-night`), each with a `description` string and an
  async/sync `buildPresentation()`. Verified by actually calling every
  template's `buildPresentation({ songLibrary })` with a 4-hymn fixture
  (`Amazing Grace`, `All Creatures of Our God and King`, `How Great Thou
  Art`, `Great Is Thy Faithfulness` — the real titles from
  `shared/hymns.json:5,41,77,114`) and logging `sections.map(s => s.title)`.
  Real output for the two broken templates:
  - `student-night` description (line ~330): *"A youth-service template with
    welcome, game moment, worship, message, and response."* Real sections:
    `['Welcome', 'Game Moment', 'Message']` — no `worship`/song section
    exists anywhere in this template, and `response` is a slide inside the
    `Message` section (`buildSermonPlaceholderSection`,
    `presentationTemplates.js:126-146`), not a section of its own.
  - `prayer-night` description (line ~345): *"A calm service flow for
    scripture, guided prayer, reflection, and closing worship."* Real
    sections: `['Gathering', 'Guided Prayer']` — `scripture`, `reflection`,
    and `closing worship` are not created; only 2 of the 4 promised items
    exist (and `Gathering` itself goes unmentioned).
  - The other 5 templates' descriptions were checked the same way and found
    already accurate (do not over-promise): `sunday-service` → announcements
    + 4 named hymns + sermon, matches `['Pre-Service Announcements',
    'Amazing Grace', 'All Creatures of Our God and King', 'How Great Thou
    Art', 'Sermon', 'Great Is Thy Faithfulness']`; `worship-set` → 3 songs,
    matches; `sermon-scripture` → message + KJV scripture, matches
    `['Sermon', 'Scripture Reading']`; `featured-sunday-example` →
    announcements/worship/sermon notes/"a featured flow" (deliberately
    vague, not a false claim), matches `['Pre-Service Announcements',
    'Amazing Grace', 'Great Is Thy Faithfulness', 'Scripture Reading',
    'Message']`; `announcement-loop` → single announcements section, matches.
  - `template.description` is currently **not rendered anywhere in the UI**
    (`grep -rn "\.description" src` finds only an unrelated hit in
    `Dialog.jsx`) — `TemplateCard` (`Home.jsx:787-831`) renders only
    `template.title`. The mismatch is latent today, not currently visible to
    a user, but the field exists for a reason (card tooltips / a future list
    view / the "More templates" screen are plausible next consumers) and the
    task brief is explicit: fix the text now rather than leave it
    accumulating drift. Note for the record in Findings — not a fix, since
    widening where descriptions render is out of scope for a P2 text
    correction.
  - `src/utils/templateVisuals.js` (`TEMPLATE_VISUALS[id].lines`) is a
    **separate, already-rendered** set of pill labels on each card
    (`TemplatePreview`, `Home.jsx:833-905+`) with its own accuracy drift
    (e.g. `prayer-night` lines are `['Scripture', 'Guided Prayer',
    'Response', 'Closing']`, `student-night` lines include `'Worship'`) —
    same underlying problem, different field. **Out of scope**: the task
    brief names `presentationTemplates.js`'s `description` field
    specifically, and `templateVisuals.js` is unrelated visual data, not
    covered by the HOME-12 audit line or brief. Recorded as a Finding for a
    follow-up.
- `presenter-pro/src/components/shared/OnboardingTutorial.jsx:122-130` —
  `handleTemplateAction` unconditionally calls
  `createPresentationFromTemplate('featured-sunday-example')` every time it
  runs, with no check for an existing presentation of that name.
  `createPresentationFromTemplate` (`presentationCommands.js:149-206`)
  already dedupes *media* (`ensureMedia`) but always calls `createPresentation`
  for the presentation itself — every tutorial run is a brand-new row.
- `presenter-pro/src/utils/ipc.ts:30-32` — `getPresentations()` returns
  `Envelope<T[]>` of presentation summaries with a `.title` field (confirmed
  via `Home.jsx:990,1029` reading `presentation.title`).
  `presenter-pro/src/utils/presentationCommands.js:97-124` —
  `openPresentationInEditor(id, options)` is the existing "load this
  presentation" path (`touchPresentation` + `getPresentation` +
  `loadPresentationIntoEditor`); calling it with no `options.fresh` is the
  correct call for an *existing* row (matches how `Home.jsx`'s own
  `handleOpen` uses it).
- `presenter-pro/src/components/shared/OnboardingTutorial.jsx:37-42` — the
  `present` step's body: *"Use Present or press F5 to open Presenter View
  and the clean output window."* "Presenter View" names the standalone
  presenter window deleted in plan S1
  (`CLAUDE.md`: "the separate presenter-window code was deleted in plan
  S1"). The real term used elsewhere in this codebase for the in-editor
  panel is **"Presenter Panel"** (`MenuBar.jsx:47,190` — "Show/Hide Presenter
  Panel", `Editor.jsx:413` — "Show presenter panel"), and the real output
  surface is the lower-case **"output window"**
  (`presenterFlow.js:69` — "opens only the output window (no separate
  presenter window)"). The `templates` step's body (line ~17) already says
  "Sunday Morning Example" correctly and needs no change.
- `presenter-pro/src/components/shared/OnboardingTutorial.jsx:57-87,148-166` —
  target-measurement effect and render. When `document.querySelector(step.selector)`
  finds nothing, `targetRect` stays `null` and the render falls to:
  ```
  <div className="absolute inset-0" style={{ background: 'rgba(7, 10, 18, 0.62)' }} />
  ```
  — the same 0.62-alpha dark color used to darken *around* a real spotlight
  cutout (`boxShadow: '0 0 0 9999px rgba(7, 10, 18, 0.62)'`, same file
  :159), but with no cutout at all, so the whole screen goes dark with
  nothing highlighted. All 6 `STEPS` entries declare a `selector`, so a null
  `targetRect` always means "the target didn't render," never an
  intentional no-target step.
- `presenter-pro/src/components/shared/OnboardingTutorial.jsx:132-138` —
  `handleBack`:
  ```
  function handleBack() {
    const nextIndex = Math.max(0, stepIndex - 1);
    if (nextIndex === 0 && currentView === 'editor') {
      setCurrentView('home');
    }
    setTutorialStepIndex(nextIndex);
  }
  ```
  Two problems, both reachable from a normal tutorial run:
  1. The `nextIndex === 0` special case (Back from `templates`, the "Step 2
     of 6" tooltip label, to `sidebar`, "Step 1") calls `setCurrentView('home')`
     directly — it skips the same unsaved-changes gate every other
     home-bound navigation goes through. Compare `TitleBar.jsx:29-43`
     (`handleBack`) and `appCommands.js:41-44` (`file:close`): both call
     `resolveUnsavedChanges` first, then `touchPresentation`, then
     `setHomeTab('home')`, then `setCurrentView('home')`. `OnboardingTutorial`
     does none of the first three.
  2. The check is *only* `nextIndex === 0`. `STEPS[0]` (`sidebar`) and
     `STEPS[1]` (`templates`) both target Home-only elements
     (`[data-tour="home-sidebar"]`, `[data-tour="home-templates"]`);
     `STEPS[2..5]` (`toolbar`, `filmstrip`, `canvas`, `present`) all target
     editor-only elements. So Back from `toolbar` (index 2, "Step 3 of 6" —
     reached right after `handleTemplateAction` opens a presentation and
     advances to index 2) computes `nextIndex = 1` and the condition is
     false: `currentView` is never switched back to `'home'`, even though
     `templates`' target cannot exist while still in the editor. This is
     the live repro path for the "missing target" bug above — it is not
     hypothetical, it is the normal way to reach it. Fixing `handleBack` to
     recognize *either* home-only destination index (0 or 1), not only 0, is
     the root-cause fix for both halves of HOME-15's one audit line, not two
     unrelated patches.
- `presenter-pro/src/store/appStore.js:4-5,22-23` — `currentView: 'home'`,
  `homeTab: 'home'`, `setCurrentView`, `setHomeTab` — plain `set()` writers,
  no side effects, safe to call from a test.
- `presenter-pro/src/store/editorStore.js:66,74-75,146-147` — `presentation:
  null`, `isDirty: false`, `requiresInitialSave: false` defaults;
  `setDirty`/`setRequiresInitialSave` are plain setters.
- `presenter-pro/src/utils/unsavedChanges.js:17-25` — `resolveUnsavedChanges`
  returns `true` immediately, with no dialog, when `!presentation ||
  (!isDirty && !requiresInitialSave)` — with the default (empty) editor
  state used in this plan's test, it resolves synchronously true, so no
  dialog needs mocking.
- `presenter-pro/src/components/shared/__tests__/OnboardingTutorial.test.tsx:10-12` —
  existing top-level mock:
  ```
  vi.mock('@/utils/presentationCommands', () => ({
    createPresentationFromTemplate: vi.fn(),
  }));
  ```
  None of the 3 existing tests reach the `templates` step's action button or
  call `handleBack` from a Home-bound index, so none exercises
  `openPresentationInEditor` or the Back-to-home path today. This plan must
  add `openPresentationInEditor: vi.fn()` to this mock (source now imports
  it) and a new `vi.mock('@/utils/ipc', ...)` for `getPresentations`/
  `touchPresentation` (source now imports both) for the file to keep
  resolving real module shapes. This is scaffolding for new tests, not an
  edit to any existing test's behavior or assertions — recorded per rule
  testing-standards.mdc item 2 regardless, since it touches an existing test
  file.

## Decisions

1. **HOME-12 scope is `description` text only, per the task brief.**
   `templateVisuals.js` has the same class of bug but is explicitly out of
   scope (Measured, above) — recorded as a Finding, not touched.
2. **Fix only the two over-promising descriptions** (`student-night`,
   `prayer-night`); the other 5 are already accurate (Measured) — editing
   them would be a no-op text change with no test value and violates "keep
   changes small."
   - `student-night`: `"A youth-service template with welcome, game moment,
     worship, message, and response."` →
     `"A youth-service template with a welcome, a game moment, and a
     message with response prompts."` — drops the fabricated `worship`
     section and re-scopes `response` as part of the message, matching the
     real `['Welcome', 'Game Moment', 'Message']`.
   - `prayer-night`: `"A calm service flow for scripture, guided prayer,
     reflection, and closing worship."` →
     `"A calm service flow for gathering together and guided prayer for the
     church and city."` — drops `scripture`/`reflection`/`closing worship`
     (none exist) and names the real `Gathering` section, matching
     `['Gathering', 'Guided Prayer']`.
3. **The pinning test asserts real section titles are exact** (order, count,
   content) against a hand-authored `EXPECTED_SECTION_TITLES` map covering
   **all 7** templates (exhaustive, not just the 2 fixed ones — "list
   sampling" guard), built directly from the same fixture run recorded in
   Measured. This is what makes "described sections" mechanically checkable:
   the map is what a human reading each (now-accurate) description would
   expect to see created; if `buildPresentation` for any template later
   drifts from that map, the test fails and a maintainer must reconcile
   either the code or the description — never silently.
4. **The test also directly guards the specific regression this bug was**,
   not just the general shape: a `FORBIDDEN_DESCRIPTION_WORDS` map keyed only
   for `student-night` (`/\bworship\b/i`) and `prayer-night`
   (`/\bscripture\b/i`, `/\breflection\b/i`, `/\bclosing worship\b/i`)
   asserts those words are absent from the (fixed) description. This is the
   part of the test that would fail if someone reverted only the prose
   without re-adding the sections — the section-title pin alone (Decision 3)
   wouldn't catch that, since it never reads `.description`.
5. **HOME-13 fix location and match key.** `handleTemplateAction` (only) is
   changed, not `createPresentationFromTemplate` itself: the generic
   "create from template" flow used by every `TemplateCard` click on Home
   is a deliberate "make me a new one" action (same as PowerPoint/Keynote
   opening a template makes a new document) — users clicking the "Sunday
   Morning Example" card by hand should still get a fresh copy each time.
   Only the *tutorial's automatic* action should reuse. Match key is
   `presentation.title === template.title` (looked up from
   `PRESENTATION_TEMPLATES` by id, not a second hardcoded string, so the two
   can't drift if the template's title ever changes) via `getPresentations()`.
   If found, `openPresentationInEditor(existing.id)`; if not,
   `createPresentationFromTemplate('featured-sunday-example')` as before.
6. **HOME-14 wording.** Replace `"Presenter View"` and `"the clean output
   window"` with the app's own terms: `"the output window"` and the
   `"Presenter Panel"` (Measured, above) so the copy can't be read as
   describing the deleted separate presenter window.
7. **HOME-15a fix removes the fallback dim entirely, rather than softening
   it.** When there is nothing to spotlight, dimming the whole screen at any
   opacity still tells the user "look here" while giving them nowhere to
   look. Since a null `targetRect` never represents an intentional
   no-highlight step (Measured — all 6 steps declare a selector), the
   correct fallback is no backdrop at all: the tooltip still renders,
   centered (`tooltipStyle`'s existing `!targetRect` branch, unchanged), and
   the rest of the app stays visible and undimmed instead of being hidden
   behind a broken-looking overlay.
8. **A `data-testid="tutorial-full-dim"` is added to the (buggy, no-target)
   fallback backdrop div** — the one this todo deletes — so the red test can
   assert its *presence-then-absence* without pattern-matching on
   inline-style formatting (which jsdom/React could serialize with
   different spacing than the source literal — a brittle assertion). Adding
   a query hook is test scaffolding, not a behavior change, and is added in
   the same red-test commit as the rest of T1 so the "see it fail on
   current code" step still runs against today's
   real (buggy) render branch.
9. **HOME-15b fix generalizes the Home-bound check from `nextIndex === 0` to
   "does `STEPS[nextIndex]` target Home"** (Measured, point 2 above), and
   routes through the same normal-path sequence `TitleBar.jsx`'s own
   `handleBack` uses (`resolveUnsavedChanges` → `touchPresentation` →
   `setHomeTab('home')` → `setCurrentView('home')`), rather than the raw
   `setCurrentView('home')` call. This is the minimal root-cause fix per
   AGENTS.md ("Always address errors by debugging and fixing the root
   cause") — patching only `nextIndex === 0` would leave the Back-from-
   `toolbar` path (the one that actually reproduces HOME-15a) broken. The
   sequence is duplicated inline in `OnboardingTutorial.jsx` rather than
   extracted into a shared helper in `presentationCommands.js` used by both
   files — extracting and re-wiring `TitleBar.jsx` to call it is a larger,
   separate-purpose change (touches a file outside this plan's blast radius)
   for a ~10-line duplication; not done here.
10. **The red test for HOME-15b targets the Back-from-`toolbar` path**
    (Decision 9's generalization), not the narrower pre-existing
    `nextIndex === 0` case, because it is the stronger demonstration of the
    bug: under today's code `currentView` does not change *at all* (not
    just "changes the unsafe way"), which is a cleaner, more obviously-wrong
    red assertion (`expect(currentView).toBe('home')` fails outright,
    rather than requiring a secondary signal like `homeTab` to distinguish
    "changed the safe way" from "changed the unsafe way").

## Anti-weakening clause

If an assertion fails, the bug is elsewhere — never loosen the assertion to
pass. Fix the root cause or record it as a suspected regression.

## Comparisons: order / count / exactness

- HOME-12 section-title pin: **exact** (`toEqual`, not `toContain` or a
  sorted/set comparison) — order, count, and content all matter, since the
  prose describes sections in the order they play.
- HOME-12 exhaustiveness check: iterates the real `PRESENTATION_TEMPLATES`
  array and asserts every id has a map entry via `hasOwnProperty`, plus an
  explicit `toHaveLength(7)` on both the template list and the expected-map
  keys — self-enforcing count, not a manually-sampled subset.
- HOME-12 forbidden-word check: presence/absence of a fixed regex list per
  template id — not a fuzzy/partial match, `/\bworship\b/i` etc. use word
  boundaries so it can't false-positive on an unrelated substring.
- HOME-13 test: `openPresentationInEditor` call **count** must be exactly
  `1` with the existing presentation's id, and `createPresentationFromTemplate`
  must be called **0** times, when a matching title exists — both directions
  checked, not just "was reuse attempted."
- HOME-15a test: the fallback dim element (`data-testid="tutorial-full-dim"`)
  must be **absent** (`queryByTestId(...)` is `null` / not
  `toBeInTheDocument()`) when no DOM target exists — presence/absence, not a
  style-value comparison.
- HOME-15b test: `currentView` must equal `'home'` **exactly** (not "is
  truthy" or "changed from its initial value") after Back from the
  `toolbar` step while starting in `'editor'`.

## Blast radius

- **May edit:**
  `presenter-pro/src/utils/presentationTemplates.js`,
  `presenter-pro/src/utils/__tests__/presentationTemplates.test.ts` (new
  file),
  `presenter-pro/src/components/shared/OnboardingTutorial.jsx`,
  `presenter-pro/src/components/shared/__tests__/OnboardingTutorial.test.tsx`
  (mock scaffolding + new test cases only, per Measured/Decision above — no
  existing `it(...)` block's body or assertions change),
  `presenter-pro/src/__tests__/inlineStyleBudget.test.ts` (ceiling-only, see
  T10 amendment below — discovered during execution, not anticipated here),
  `tasks/fable-pass-plan.md`, `tasks/fable-notes.md` (records only).
- **May NOT edit:** `presenter-pro/src/utils/templateVisuals.js` (Decision
  1), `presenter-pro/src/pages/Home.jsx`, `presenter-pro/src/components/layout/TitleBar.jsx`,
  `presenter-pro/src/utils/appCommands.js`, `presenter-pro/src/utils/unsavedChanges.js`,
  `presenter-pro/src/utils/presentationCommands.js`, `presenter-pro/src/store/**`,
  `presenter-pro/electron/**`. No IPC channel is touched (both new imports —
  `getPresentations`, `touchPresentation` — are existing exports of
  `src/utils/ipc.ts`, called with their existing shapes). No migration/data
  rewrite. No snapshot test is added or touched.
- `presenter-pro/e2e/*-snapshots` — grepped `e2e/*.spec.ts` for `tutorial`
  and `template`: `e2e/onboarding.spec.ts` and `e2e/templates.spec.ts` exist
  and are **not** visual-snapshot specs (no `toHaveScreenshot`/`toMatchSnapshot`
  calls — confirmed by grep). No `e2e/*-snapshots` baseline references either
  file. Stated in Findings per the task brief regardless.

## Todos

- [x] **T1 — Red tests, HOME-15 (both halves).** In
  `OnboardingTutorial.test.tsx`: add `data-testid="tutorial-full-dim"` to
  the no-target fallback backdrop div in `OnboardingTutorial.jsx`
  (scaffolding only, Decision 8 — no behavior change yet, the div itself is
  untouched by this todo, only instrumented). Extend the top-level mocks: add `openPresentationInEditor:
  vi.fn()` to the existing `@/utils/presentationCommands` mock, and add
  `vi.mock('@/utils/ipc', () => ({ getPresentations: vi.fn(), touchPresentation:
  vi.fn() }))`. Import `getPresentations` from the mock. Two new tests:
  - "shows no full-screen dim when the step's target is missing": default
    render (no target ever exists in this jsdom tree, confirmed in Measured
    — every existing test already renders with `targetRect === null`),
    `expect(screen.queryByTestId('tutorial-full-dim')).not.toBeInTheDocument()`
    — this one is red on current code because the div is currently always
    present under that condition (that IS the bug).
  - "Back from the toolbar step returns to Home the normal way": seed
    `getPresentations` to resolve `{ success: true, data: [] }` (not
    exercised by this path but must not reject/hang), set
    `useAppStore.setState({ tutorialStepIndex: 2, currentView: 'editor' })`,
    render, `fireEvent.click(screen.getByText('Back'))` inside `await
    act(async () => { ... })` (the handler is now async), then
    `expect(useAppStore.getState().currentView).toBe('home')`.
  Run: `npx vitest run src/components/shared/__tests__/OnboardingTutorial.test.tsx`
  — both new tests must FAIL on current source (`tutorial-full-dim` found;
  `currentView` still `'editor'`) before any fix lands. Capture the red
  output for the PR body.
- [x] **T2 — Red test, HOME-13.** Same file: add a test "reuses an existing
  Sunday Morning Example instead of creating another one" — seed
  `getPresentations` to resolve `{ success: true, data: [{ id: 'existing-1',
  title: 'Sunday Morning Example' }] }`, set `tutorialStepIndex: 1,
  currentView: 'home'` (so the "Open Featured Example" button renders —
  `canAdvance` is false only on the `templates` step outside the editor),
  render, click the button (wrapped in `await act(async () => {...})`),
  assert `expect(openPresentationInEditor).toHaveBeenCalledWith('existing-1')`
  and `expect(createPresentationFromTemplate).not.toHaveBeenCalled()`. Run:
  `npx vitest run src/components/shared/__tests__/OnboardingTutorial.test.tsx -t "reuses an existing"`
  — must FAIL on current code (`createPresentationFromTemplate` is called
  unconditionally). Capture the red output for the PR body.
- [x] **T3 — Red test, HOME-12.** Create
  `presenter-pro/src/utils/__tests__/presentationTemplates.test.ts` per
  Decisions 3–4 (`EXPECTED_SECTION_TITLES` for all 7 templates,
  `FORBIDDEN_DESCRIPTION_WORDS` for `student-night`/`prayer-night`, the
  exhaustiveness check). Use the 4-hymn `songLibrary` fixture from Measured.
  Run: `npx vitest run src/utils/__tests__/presentationTemplates.test.ts` —
  the `student-night` and `prayer-night` forbidden-word cases must FAIL on
  current code (the old descriptions contain the forbidden words); the
  section-title pins for all 7 templates should already pass (they assert
  real, unedited `buildPresentation` output — verified by hand in Measured,
  not itself a red case). Capture the red output for the PR body.
- [x] **T4 — Fix HOME-15a.** In `OnboardingTutorial.jsx`: delete the `else`
  branch's full-screen dim `<div>` (Decision 7). The `{targetRect ? (...) :
  null}` ternary becomes `{targetRect && (...)}`, rendering nothing when
  there is no target.
- [x] **T5 — Fix HOME-15b.** In `OnboardingTutorial.jsx`: add a
  `HOME_STEP_IDS = new Set(['sidebar', 'templates'])` constant near `STEPS`.
  Add imports: `useEditorStore` from `@/store/editorStore`,
  `resolveUnsavedChanges` from `@/utils/unsavedChanges`, `touchPresentation`
  from `@/utils/ipc`. Add `const setHomeTab = useAppStore((s) =>
  s.setHomeTab);` inside the component. Rewrite `handleBack` to `async
  function handleBack()`; compute `nextIndex` as before; if
  `HOME_STEP_IDS.has(STEPS[nextIndex].id) && currentView === 'editor'`, run
  the `TitleBar.jsx`-equivalent sequence (Decision 9) and `return` early
  without advancing the step if `resolveUnsavedChanges` resolves false;
  otherwise fall through to the existing `setTutorialStepIndex(nextIndex)`.
- [x] **T6 — Fix HOME-13.** In `OnboardingTutorial.jsx`: add imports
  `getPresentations` from `@/utils/ipc`, `openPresentationInEditor` from
  `@/utils/presentationCommands`, `PRESENTATION_TEMPLATES` from
  `@/utils/presentationTemplates`. Rewrite `handleTemplateAction` per
  Decision 5: look up the featured template's title from
  `PRESENTATION_TEMPLATES`, call `getPresentations()`, find a match by
  title, and branch to `openPresentationInEditor` or
  `createPresentationFromTemplate` accordingly, before
  `setTutorialStepIndex(2)`.
- [x] **T7 — Fix HOME-14.** In `OnboardingTutorial.jsx`: reword the
  `present` step's `body` per Decision 6.
- [x] **T8 — Fix HOME-12.** In `presentationTemplates.js`: replace the
  `student-night` and `prayer-night` `description` strings per Decision 2.
- [x] **T9 — Green.** Run
  `npx vitest run src/components/shared/__tests__/OnboardingTutorial.test.tsx src/utils/__tests__/presentationTemplates.test.ts`
  — all tests (existing 3 + new 4) pass. Capture the green output for the
  PR body.
- [x] **T10 — Ratchets and regressions.** Run
  `npx vitest run src/__tests__/inlineStyleBudget.test.ts src/__tests__/keyboardReachability.test.ts`.
  **Amendment, found during execution:** `keyboardReachability.test.ts` is
  unaffected as predicted, but `inlineStyleBudget.test.ts` FAILED —
  `components/shared/OnboardingTutorial.jsx` does have a ceiling (`5`,
  missed in Measured), and T4 (deleting the no-target fallback div) drops
  its real inline-`style={{...}}` count from 5 to 4. The ratchet is an
  exact-match ceiling (flags a decrease as "stale" too, not just an
  increase), by design (`testing-standards.mdc`: never weaken a ratchet;
  this is the opposite direction — the file legitimately has fewer inline
  styles now, so the ceiling is lowered to match, same as the ratchet's own
  documented intent, "lower it when a slice lands"). Lowered
  `'components/shared/OnboardingTutorial.jsx': 5` → `4` in
  `inlineStyleBudget.test.ts`. Re-ran: both files green
  (`src/__tests__/inlineStyleBudget.test.ts src/__tests__/keyboardReachability.test.ts`,
  6/6 passed). No inline style was *added* by this plan — one was removed;
  reported as-is in the PR body per "Behavior-change test edits" (rule
  applies to any existing test file this plan touches, ratchet or not).
- [x] **T11 — Full gate.** From `presenter-pro/`: `npm run gate && npm run
  format:check`. Report `type-check`, `lint`, `vitest N/N passed (0
  skipped)`. If coverage or any step fails, STOP and report — do not lower
  thresholds.
- [x] **T12 — Findings + records.** Write the PR body's `## Findings`
  section (the `templateVisuals.js` drift left unfixed; the E2E-baseline
  grep result; the `description` field being currently unrendered
  anywhere). Append one row to `tasks/fable-pass-plan.md`'s status table and
  a `## H2 — <title> (2026-09-14)` section (preceded by a blank-line-wrapped
  `---`) at the end of `tasks/fable-notes.md`.

## Compliance Manifest

### writing-executable-plans.mdc

- Assertion weakening — order/count/exactness stated per comparison:
  "Comparisons" section above.
- List sampling — the 4 audit items are itemized exhaustively (HOME-12,
  -13, -14, -15) each with its own todo(s); HOME-12's own internal list (7
  templates) is exhaustiveness-checked by the test itself (Decision 3/T3),
  not sampled.
- Quantifier erosion — HOME-12's "every template's description" is made
  mechanically checkable via the `toHaveLength(7)` + `hasOwnProperty` loop
  in T3, not a hand-picked subset.
- Sanctioned escape hatches — N/A — no allowlist/exemption constant is
  introduced by this plan.
- Bounded blast radius — "Blast radius" section above.
- File-specific pitfall notes — Measured section: the unused `.description`
  field, the `templateVisuals.js` sibling bug (out of scope), the
  `nextIndex === 0`-only Back check and why it's insufficient, the
  `resolveUnsavedChanges` no-dialog short-circuit needed for T1's second
  test to run without mocking a dialog.
- Exact paths, no improvisation — "Blast radius" section lists exact
  paths; every todo names the file(s) it touches.
- Per-todo verification — every todo (T1–T11) names its exact command.
- Snapshot policy inline — N/A — no snapshot is added or touched by this
  plan.
- Preconditions for conditional UI — T2 states why `tutorialStepIndex: 1,
  currentView: 'home'` is required for the "Open Featured Example" button
  to render (`canAdvance` gate, `OnboardingTutorial.jsx:120`); T1's second
  test states why `tutorialStepIndex: 2` is required to reach `toolbar`.
- Structural floor under every snapshot — N/A — no snapshot in this plan.
- IPC contract pinning — N/A — `getPresentations` and `touchPresentation`
  are pre-existing `src/utils/ipc.ts` exports called with their existing
  signatures; no channel shape changes.
- Data rewrites state backup/rollback — N/A — no data/row/snapshot rewrite.
- Manual verification steps — user-facing change (tutorial copy, tutorial
  Back behavior, tutorial's "Open Featured Example" reuse, template
  descriptions that are not currently rendered anywhere). Manual check:
  `npm run dev` from `presenter-pro/` — (a) trigger the First Run Tour (or
  set `tutorialStepIndex`/`currentView` via devtools to reach it), advance
  to the `templates` step, click "Open Featured Example" twice in two
  separate tutorial runs and confirm the second run opens the same
  presentation rather than creating a second "Sunday Morning Example"; (b)
  from the `toolbar` step (inside the editor) click Back and confirm the
  app returns to Home with the templates section correctly highlighted, not
  a fully dark screen; (c) read the `present` step's body text and confirm
  it no longer says "Presenter View."
- Required findings report — T12.

### testing-standards.mdc (all 10 items)

1. TDD ordering — T1/T2/T3 (red) precede T4–T8 (implementation) precede T9
   (green).
2. Behavior-change test edits — the existing `vi.mock('@/utils/presentationCommands', ...)`
   factory in `OnboardingTutorial.test.tsx` gains a key
   (`openPresentationInEditor: vi.fn()`) and a sibling `vi.mock('@/utils/ipc', ...)`
   is added; per Measured, no existing `it(...)` block's body, assertions,
   or outcome changes — none of the 3 existing tests reaches the code paths
   that use the new mock keys. Called out explicitly here and must be
   called out again in the PR body per this rule.
3. No weakened assertions — anti-weakening clause carried verbatim above;
   "Comparisons" section states order/count/exactness per assertion,
   including why the exhaustiveness and forbidden-word checks (which
   necessarily iterate/pattern-match) are not disguised weakenings.
4. Coverage floor — one test per fixed behavior: T1 (HOME-15a, HOME-15b —
   two tests, two distinct bugs), T2 (HOME-13), T3 (HOME-12, all 7 templates
   + the 2 forbidden-word regressions). HOME-14 is copy-only with no
   existing test pattern for tutorial step text (checked: no test asserts
   on `STEPS[n].body` today) — per the task brief, copy changes need a test
   only if a pattern already exists; none does, so T7 has no dedicated test.
5. Lint floor — no `.only`/`.skip` anywhere; every new test has a real
   `expect`; no `expect` inside `if`/`catch`.
6. Snapshot discipline — N/A — no snapshot in this plan.
7. Completion gate — T11.
8. Vitest/jsdom mechanics — T1/T2 state `@vitest-environment jsdom` (file
   already has it), `useAppStore` reset in the file's existing `beforeEach`
   (unchanged), `@/utils/ipc` and `@/utils/presentationCommands` mocked
   (never `electron`), no `better-sqlite3` load, no timers needed (no
   time-dependent behavior touched), async handlers (`handleBack`,
   `handleTemplateAction`) awaited via `act(async () => {...})`. T3 needs no
   DOM (pure util, skeleton A) — no jsdom header required.
9. Test placement — `OnboardingTutorial.test.tsx` (existing, extended)
   matches "React component"; new
   `src/utils/__tests__/presentationTemplates.test.ts` matches "Pure util."
10. Characterization before refactor — N/A — this plan does not restructure
    either file's shape/extraction boundaries; `handleBack` and
    `handleTemplateAction` change their bodies, not the file's
    decomposition.

## Review

All 12 todos landed as planned, plus one amendment found during execution
(T10): deleting the no-target fallback `<div>` (T4) dropped
`OnboardingTutorial.jsx`'s real inline-style count from 5 to 4, so
`inlineStyleBudget.test.ts`'s ceiling for that file was lowered to match —
the ratchet's own stated intent, not a weakening. No other deviation from
the plan.

- HOME-12: `student-night` and `prayer-night` descriptions fixed; the other
  5 templates were already accurate. All 7 templates' real section output is
  now pinned by `presentationTemplates.test.ts`.
- HOME-13: the tutorial's featured-example action now reuses an existing
  "Sunday Morning Example" by title instead of creating another one; the
  generic per-card template flow is untouched (still makes a new copy).
- HOME-14: the `present` step no longer names the deleted standalone
  presenter window.
- HOME-15a/b: a missing tour target no longer dims the whole screen, and
  Back from the `toolbar` step now returns to Home through the same
  unsaved-changes-gated path used elsewhere in the app.

Gate: `type-check ✓ · lint ✓ · vitest 647/647 passed (0 skipped)` (rebased
onto latest `origin/main`). `npm run format:check`: exit 0. PR:
https://github.com/egsmitty/propres-v2/pull/133 (not merged — awaiting
review, per instructions).

Out of scope, recorded as a Finding: `templateVisuals.js`'s card-pill labels
have the same class of drift as HOME-12 but are a different file/field, not
named by the task brief.
