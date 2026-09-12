# Executable Plan A6 — Version History

**Workstream:** A (Data safety) · **Depends on:** A5 (merged, #94/#95)
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

Written per `.cursor/rules/writing-executable-plans.mdc`. Ends with a complete
Compliance Manifest.

---

## Why this exists — a design flaw in A5, found by using it

**Ethan, 2026-09-11:** *"once i make a save i cant revert to last save. not sure
that makes sense to me, it should be a version history with memory that isnt too
long but useful enough, an undo can revert well enough."*

He is right, and the A5 plan defended the wrong thing.

`File ▸ Revert to Last Save` is gated on `isDirty`, so it greys out the instant
you save — which is exactly the moment you would want it. What it actually does
is **"discard uncommitted changes"**, wearing a name that promises more. The
case that really happens is: make changes → save → realise they were wrong →
want the previous version back. That is unreachable today.

And because `⌘Z` already covers "undo my uncommitted mess" at a finer grain, the
command as built earns very little on its own.

**The data is already there.** `presentation_versions` is append-only and holds
the last 25 saves per presentation — that is precisely why A5 chose a list-shaped
table over a single row, and why `listVersions` already exists in the IPC
contract, unused, waiting for this. **This is a UI problem, not a data problem.**

## Decisions (Ethan, 2026-09-11)

| Question | Answer |
|---|---|
| Keep `Revert to Last Save`? | **Keep both.** It stays as the one-click shortcut for discarding uncommitted changes; Version History handles everything else. Apple's model (`Revert To ▸ Previous Save` / `Browse All Versions…`). |
| Retention | **Time-thinned.** Every save from today, then one per day for ~30 days. |
| Is restoring undoable? | **Yes** — restoring saves the current state as a version first, so you can always get back. |

That third answer also removes A5's reason for making revert final: the
objection was that appending would corrupt a "revert to the newest version"
target. With an explicit list you pick a version, so appending is safe — and
**`Revert to Last Save` becomes recoverable too** (see the ordering rule below).

## THE INVARIANT — read this before changing anything

**The newest version row always equals the committed state of the presentation
row.**

A5 rests on it. `openPresentationInEditor` decides the dirty flag by comparing
the row against the newest version (`presentationCommands.js:120`), and
`Revert to Last Save` targets the newest version. Break it and two things happen
immediately, both on the happy path:

- Every affected presentation **opens "Unsaved changes" forever**, because
  `hasDiverged` is true on every open of a document nobody has touched.
- **`Revert to Last Save` restores the thing you just restored away from**, and
  a second revert silently restores the state the first one discarded.

The first draft of this plan broke it. Its sequence — *read target → capture
current → write target* — leaves the row holding the target while the newest
version holds the pre-restore state. They differ **by construction**; that was
the whole point of the change, and it was wrong.

**Every operation below ends with the newest version equal to the row.** Any
change to this plan must preserve that, and there is a test for it:

> after `restoreVersion`, `isDivergedFromLatest(store.presentation)` is `false`.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

---

## Design

### Retention — pure policy, `electron/db/versionRetention.ts`

Replaces `MAX_VERSIONS_PER_PRESENTATION`. Pure, so the calendar logic is
testable without a database:

```ts
export const RETENTION_DAYS = 30;
export function versionsToPrune(
  versions: ReadonlyArray<{ id: number; saved_at: number }>,
  now: number
): number[];   // ids to delete
```

Rules — **all 8, exhaustive:**

0. **A version dated at or after `now` is always kept.** A laptop that woke with
   a fast clock, then had it corrected by NTP, leaves future-dated rows. They
   match none of the rules below, so without this they fall through to whatever
   the implementation happens to do — possibly deletion.
1. **Every version saved on the same local calendar day as `now` is kept**, up
   to `MAX_VERSIONS_PER_DAY = 50`; beyond that the oldest of today go first.
   Rule 1 without a cap is unbounded, and a real editing day with a genuine
   change every couple of minutes reaches several hundred rows.
2. For each **earlier** local day within `RETENTION_DAYS`, keep only the
   **newest** version of that day; drop the rest.
3. Drop every version older than `RETENTION_DAYS`. **Compare day keys, not
   `now - 30*86400`** — arithmetic on seconds drifts across a DST boundary.
4. **Never drop the newest version overall**, even when rule 3 would. A
   presentation untouched for a year must still have a restore point, and
   `Revert to Last Save` depends on one existing.
5. "Newest" is resolved by `id`, **never** `saved_at`: `unixepoch()` is
   second-resolution and two saves in one second would tie.
6. Day buckets come from `saved_at`, but within a bucket "newest" is by `id`
   (rule 5). If the clock has moved backwards those two disagree; `id` wins, and
   there is a test for it.
7. **Pruning happens on write only.** An idle presentation keeps whatever it had
   until its next save, so "30 days" is a ceiling on what is *kept after a
   write*, not a promise that old rows vanish on a timer. This is deliberate —
   keeping too much is harmless, a background sweeper is not worth the
   complexity — but do not describe it to the user as a 30-day limit.

Local calendar days, not UTC — a save at 11pm belongs to the day the user thinks
it does. `now` is injected so tests need no clock control.

**Known sharp edge, accepted:** a session spanning midnight has its pre-midnight
saves collapsed to one by rule 2 on the first save after 00:00. Recorded rather
than solved; revisit if it bites.

This is a `.ts` module with its own rollup entry, `require`d from the CJS
`queries/versions.js` — exactly the arrangement `migrations.js` /
`migrationList.ts` already uses. **Prune in JS, not SQL**: local-day arithmetic
in SQLite would be unreadable and untestable.

### Queries — `electron/db/queries/versions.js`

```js
writeVersion(db, { presentationId, snapshot })   // INSERT + thinned prune, one transaction
getVersion(db, versionId)                        // NEW — one row by its own id
listVersionSummaries(db, presentationId)         // NEW — id, saved_at, slide_count. NO snapshot
getLatestVersion(db, presentationId)             // unchanged
listVersions(db, presentationId)                 // unchanged; NOT used by the modal
deleteVersionsFor(db, presentationId)            // unchanged
```

**`listVersionSummaries` exists for a measured reason.** Every text box in a
snapshot carries the whole merged `DEFAULT_TEXT_BOX` (25 keys) plus
`DEFAULT_TEXT_STYLE` (18 keys), because `normalizeTextBox` always materialises
them — roughly 1.1 KB per slide, so an 80-slide service order is ~90 KB per
snapshot. Listing 40 versions through `listVersions` would push ~3.6 MB across
IPC and `JSON.parse` all of it on the renderer thread **to display a number**.
The summary computes the slide count with `json_array_length` in SQL and
transfers a few hundred bytes.

`getVersion` fetches the one snapshot actually being restored.

### IPC — two new channels

| `INVOKE_METHODS` key | Channel | `src/utils/ipc.ts` wrapper |
|---|---|---|
| `getVersion` | `db:versions:get` | `getVersion(versionId)` |
| `listVersionSummaries` | `db:versions:summaries` | `listVersionSummaries(presentationId)` |

`listVersions` is already in the contract from A5 and stays; the modal does not
use it. Invoke count goes 52 → **54**.

### Restore — `presentationVersionsSync.ts`

```ts
export async function restoreVersion(versionId: number, deps?): Promise<boolean>;
```

Steps, in this exact order — **all 9, exhaustive:**

1. `cancelPendingAutosave()` **first**, before any `await`: a debounced write
   landing mid-restore would put the restored-away edits straight back.
2. `getVersion(versionId)`. Missing → alert, return `false`.
3. **Assert `row.presentation_id === store.presentationId`.** The channel is not
   scoped, and a stale id (a modal left open across a `file:open`) would write
   one presentation's content over another. Mismatch → alert, return `false`.
4. `JSON.parse` the snapshot; unparseable → alert, return `false`.
5. Validate it is a non-null object with an array `sections` — `JSON.parse('null')`
   succeeds and would reach the main process as `null`.
6. **`captureVersion(current)` — the pre-restore state becomes a version.** This
   is what makes restoring undoable. **It returns a boolean; if the write
   failed, alert and return `false` WITHOUT touching the document.** Otherwise
   the one guarantee this feature exists to provide evaporates silently at
   exactly the moment it matters.
7. `updatePresentation(id, snapshot)`, guarded on `result?.success && result.data`
   exactly as `saveCurrentPresentation` is. On failure: alert, return `false`.
8. **`captureVersion(restored)` — append the restored content too.** This is what
   keeps THE INVARIANT: without it the newest version is the pre-restore state
   and the document opens dirty forever. Two rows per restore is the correct
   cost.
9. Load it, `setDirty(false)`, `setRequiresInitialSave(false)`.

After step 9 the list reads (newest last): `… target … pre-restore, restored`.
The newest equals the document ✅, and the pre-restore state is one row below it,
reachable — which is what "restoring is undoable" actually means.

### `captureVersion` must report failure — a behaviour change

It currently discards the write result (`presentationVersionsSync.ts:100`) and
returns `void`. Restore and revert both stake their one guarantee on that write
having happened, so it now returns `boolean` and callers abort on `false`.
Without this, a failed version write (disk full, locked database) is followed by
the document being overwritten with **no restore point recorded and nothing
said** — the feature failing silently at the only moment it matters.

### `revertToLatestVersion` becomes recoverable — a behaviour change

A5's rule was *"revert never appends a version"*. It gains an option:

```js
revertToLatestVersion(id, { navigate = true, capture = true })
```

With `capture: true` (the menu command) the sequence mirrors restore, including
the closing append that keeps THE INVARIANT:

```
1. target = getLatestVersion(id)   // read BEFORE appending, or it targets itself
2. captureVersion(current)         // pre-revert state preserved
3. updatePresentation(id, target)
4. captureVersion(target)          // newest version == row again
```

**`capture: false` is for Discard, and is not optional.** `unsavedChanges.js:77`
routes Discard through this function. With capture on, Discard would **append a
version of the very work the user asked to throw away** — it would sit in the
history list beside real saves, and retention rule 4 ("never drop the newest")
would pin it as unprunable. Discard means *this never happened*. With
`capture: false` the row simply becomes the target, which already equals the
newest version, so the invariant holds with no appends at all.

Behaviour-change edit: the test moves from "never appends" to "appends with
`capture: true`, appends nothing with `capture: false`, and in both cases the
newest version equals the document afterwards".

### UI — `src/components/editor/VersionHistoryModal.jsx`

A modal, matching `PresentationSettingsModal` / `OutputSettingsModal` in
structure, Escape handling and focus behaviour. **Read one of them before
writing this one; do not invent a new modal shape.**

- Title **Version History**, rows newest first.
- Each row: a relative timestamp (`Today 9:14 AM`, `Yesterday 4:02 PM`,
  `Sun 7 Sep`) and the slide count, from `listVersionSummaries`.
- **The row marked "Current" is the one whose content matches the open document**,
  found with `presentationContentKey` — **not** "the newest row" by position.
  With THE INVARIANT held they are the same row, but deriving it from content
  means the marker cannot drift if anything ever appends out of band, and it
  stays honest while the document is dirty (then no row is Current). Its Restore
  control is disabled; everything else is enabled, **including the row directly
  below it, which is the pre-restore state** — that row is how "restoring is
  undoable" is actually reached, so it must never be disabled.
- **The list re-fetches after a successful restore**, before the modal decides
  whether to close. A restore appends rows, so the list on screen is stale the
  instant it succeeds and the Current marker would point at the wrong row.
- Restore asks for confirmation, naming the version. The wording mentions that
  the **title** reverts too, since `title` is a content field.
- A row whose summary could not be read shows `—` rather than throwing.
- Empty/failed load states read as sentences, not blanks.

Date formatting is a **pure function** in `src/utils/versionLabels.ts`
(`formatVersionTimestamp(savedAt, now)`) so it is testable without rendering —
jsdom cannot be trusted for locale output, so assert against explicit
`Intl`-free construction.

### Never restore during a live service

**Disabled while `isPresenting`.** Restoring replaces the presentation, which
runs `syncPresentationSession`; if the live slide's id is not in the restored
document, `PresenterPanel` computes `liveIdx = -1`, and then
`canGoNext = -1 < allSlides.length - 1` is **true** while `goNext` resolves
`slides[-1 + 1]` → `slides[0]` (`PresenterPanel.jsx:197-220`). The next press of
the spacebar would jump the congregation to slide 1 of the deck, mid-song, with
the output already showing a slide that no longer exists.

This is a worship-presentation app. The guard is the same one `present:start`
already uses.

### Menus

- `appCommands.js`: `case 'file:versionHistory'` opens the modal via an
  `appStore` flag, mirroring `edit:presentationSettings`.
- `MenuBar.jsx`: `{ label: 'Version History…', action: 'file:versionHistory' }`
  directly after `Revert to Last Save`. Disabled when `!presentation`
  **or `isPresenting`** — see below.
- `electron/main/index.js`: the same item in the native File submenu, **no
  accelerator** (every free `⌘` chord is taken, and this opens a window rather
  than doing something destructive).

---

## Bounded blast radius

| File | Action |
|---|---|
| `presenter-pro/electron/db/versionRetention.ts` | create — pure retention policy |
| `presenter-pro/electron/db/__tests__/versionRetention.test.ts` | create |
| `presenter-pro/electron/db/queries/versions.js` | modify — thinned prune, add `getVersion` |
| `presenter-pro/electron/db/__tests__/versionQueries.test.ts` | modify — prune is now thinned (behaviour-change edit) |
| `presenter-pro/electron.vite.config.js` | modify — add the `db/versionRetention` rollup entry |
| `presenter-pro/electron/main/index.js` | modify — 1 `ipc.handle`, 1 native menu item |
| `presenter-pro/shared/ipcContract.ts` | modify — 1 row |
| `presenter-pro/shared/__tests__/ipcContract.test.ts` | modify — 52 → 54 invoke (behaviour-change edit) |
| `presenter-pro/src/utils/ipc.ts` | modify — 1 wrapper |
| `presenter-pro/src/utils/versionLabels.ts` | create — pure timestamp formatting |
| `presenter-pro/src/utils/__tests__/versionLabels.test.ts` | create |
| `presenter-pro/src/utils/presentationVersionsSync.ts` | modify — `restoreVersion`; `captureVersion` returns boolean; revert gains `capture` |
| `presenter-pro/src/utils/unsavedChanges.js` | modify — Discard passes `{ capture: false }`; one line |
| `presenter-pro/src/utils/__tests__/unsavedChanges.test.ts` | modify — Discard writes no version |
| `presenter-pro/src/utils/__tests__/presentationVersionsSync.test.ts` | modify — restore cases + revert behaviour change |
| `presenter-pro/src/store/appStore.js` | modify — one `versionHistoryOpen` flag, mirroring the existing modal flags |
| `presenter-pro/src/components/editor/VersionHistoryModal.jsx` | create |
| `presenter-pro/src/components/editor/__tests__/VersionHistoryModal.test.tsx` | create |
| `presenter-pro/src/pages/Editor.jsx` | modify — render the modal beside the other two |
| `presenter-pro/src/utils/appCommands.js` | modify — one `case` |
| `presenter-pro/src/components/layout/MenuBar.jsx` | modify — 1 item + its disabled rule |
| `presenter-pro/src/components/layout/__tests__/MenuBar.test.tsx` | modify — the new item |
| `presenter-pro/e2e/versionHistory.spec.ts` | create |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |
| `tasks/plan-A6-version-history.md` · `tasks/fable-pass-plan.md` · `tasks/fable-notes.md` | modify — records |

**Do NOT modify:** `src/store/editorStore.js` · `src/components/editor/Canvas.jsx`
· `src/components/layout/Toolbar.jsx` · `src/pages/Home.jsx` ·
`src/utils/backgrounds.js` · any migration (the table shape does not change) ·
any `e2e/visual*.spec.ts` · any baseline PNG · the ratchet tests.

**A new modal draws pixels.** No existing baseline should move — the modal is
closed by default and no capture opens it. If one moves, that is a finding.

---

## Todos

- [ ] **1. Failing tests first (TDD — before todo 2).**

      `electron/db/__tests__/versionRetention.test.ts` — **all 10, exhaustive**,
      one per retention rule plus the mixed case:
      1. Five saves today → **none** pruned (rule 1).
      2. `MAX_VERSIONS_PER_DAY + 10` saves today → exactly the 10 oldest of today
         pruned (rule 1's cap).
      3. Three saves yesterday → the two older pruned, newest kept (rule 2).
      4. A version 40 days old → pruned (rule 3).
      5. A presentation whose ONLY version is 400 days old → **not** pruned (rule 4).
      6. A future-dated version (`saved_at > now`) → **kept** (rule 0).
      7. Two versions in the same second on an earlier day → the higher **id**
         wins (rules 5/6).
      8. A version whose `saved_at` is out of order with its `id` (clock moved
         backwards) → `id` decides which survives its day (rule 6).
      9. A mixed set across today / yesterday / last week / 60 days → the exact
         kept-id list, compared with `toEqual` (order and membership both matter).
      10. An empty list → `[]`, no throw.
      Use fixed epoch-second fixtures and an injected `now`; **never `Date.now()`**.
      Build the DST case from day keys so rule 3 cannot regress to seconds
      arithmetic.

      `src/utils/__tests__/versionLabels.test.ts` — **all 4, exhaustive:**
      today / yesterday / this week / older, each with an injected `now`.

      `electron/db/__tests__/versionQueries.test.ts` — **behaviour-change edit:**
      the prune is no longer "keep 25"; it deletes exactly the ids
      `versionsToPrune` returns. Plus a new case: `getVersion` selects by its own
      id. State the change in the summary.

      `src/utils/__tests__/presentationVersionsSync.test.ts` — **all 10, exhaustive:**
      1. `restoreVersion` cancels the pending autosave **first** (assert order).
      2. It captures the pre-restore state **before** writing (assert order).
      3. **THE INVARIANT:** after a successful restore,
         `isDivergedFromLatest(store.presentation)` is `false` — i.e. the closing
         `captureVersion` ran and the newest version equals the document. This is
         the single most important assertion in the plan; the first draft would
         have failed it.
      4. It writes the parsed snapshot (`toEqual`) and clears dirty.
      5. A version belonging to a **different** presentation → alert, return
         `false`, nothing written.
      6. Missing version / unparseable snapshot / `'null'` snapshot → alerts,
         returns `false`, writes nothing.
      7. **A failed `captureVersion` aborts before the document is touched** —
         `updatePresentation` call count `0`.
      8. A failed `updatePresentation` does not blank the editor.
      9. **Behaviour change:** `revertToLatestVersion` with `capture: true`
         appends the pre-revert state and still restores the version that was
         newest **before** that append — the ordering trap, asserted directly —
         and ends with the invariant holding.
      10. `revertToLatestVersion` with `capture: false` writes **no** version, and
          the invariant still holds. Paired with a case in
          `unsavedChanges.test.ts` proving Discard passes `capture: false`.

      `src/components/editor/__tests__/VersionHistoryModal.test.tsx` (jsdom) —
      **all 7, exhaustive:**
      1. Renders one row per summary, newest first.
      2. The row whose content key matches the open document is marked
         **Current** and its Restore is `toBeDisabled()`.
      3. **The row directly below Current is enabled** — that is the pre-restore
         state, and disabling it would make "restoring is undoable" unreachable.
      4. Restore asks for confirmation before doing anything.
      5. Confirming calls `restoreVersion` with that row's id.
      6. Cancelling calls nothing.
      7. **After a successful restore the summaries are re-fetched** — a restore
         appends rows, so an un-refreshed list is stale and its Current marker
         wrong.

      *Verify:* `npx vitest run electron/db/__tests__/versionRetention.test.ts src/utils/__tests__/versionLabels.test.ts` — must FAIL (modules absent). Paste the output.

- [ ] **2. Implement**: retention policy, `getVersion`, the contract row and
      handler and wrapper, `restoreVersion`, the revert re-ordering, the modal,
      the store flag, the two menu items and the `appCommands` case.
      *Verify:* every todo-1 command passes.

- [ ] **3. Rollup entry** `db/versionRetention` in `electron.vite.config.js`.
      Without it the packaged app crashes at startup **and the build still
      reports SUCCESS** — the trap A2 and A5 both hit.
      *Verify:* `npm run build && ls out/db/` shows `versionRetention.js`.

- [ ] **4. `e2e/versionHistory.spec.ts`** — **all 5, exhaustive:**
      1. Save three times with a different slide count each; the modal lists
         three rows plus the one from opening, newest first.
      2. Restoring an older version changes the row's slide count to match.
      3. **Restoring is recoverable:** after restoring, the pre-restore state
         appears in the list and restoring *it* returns the document.
      4. The Current row's Restore control is disabled.
      5. **Version History is disabled while presenting** — start presenting and
         the menu item greys out.
      Drive the modal through the in-app `MenuBar`, and read counts from SQLite
      as `e2e/revert.spec.ts` does.
      *Verify:* `npm run test:e2e` twice.

- [ ] **5. Confirm no baseline moved.** The modal is closed by default and no
      capture opens it. CI is the verdict; **do not run Playwright locally while
      Ethan is at the machine.** A moved baseline is a finding, not a recapture.

- [ ] **6. Raise coverage thresholds** to just below the new measured floor.

- [ ] **7. Gate, PR, merge, and delete the branch** (`gh pr merge --squash
      --delete-branch`). Then update `tasks/fable-pass-plan.md` and
      `tasks/fable-notes.md`, and tell Ethan `main` is ready to pull.

---

## Pitfall notes

1. **Read the target version BEFORE appending the current state.** Both
   `restoreVersion` and `revertToLatestVersion` depend on it. Append first and
   the newest version becomes its own restore target, which is a silent no-op
   that looks like the feature working.
2. **Local calendar days, not UTC.** A save at 11pm belongs to the day the user
   thinks it does. Build day keys from a local `Date`, and inject `now`.
3. **Order by `id`, never `saved_at`** — `unixepoch()` ties within a second.
4. **`captureVersion` is content-key idempotent.** Restoring to a state
   identical to the newest version appends nothing, so the list will not grow on
   a no-op restore. That is correct; do not "fix" it.
5. **Prune in JS, not SQL.** Local-day arithmetic in SQLite is unreadable and
   untestable; the query module calls the pure policy and deletes the ids it
   returns.
6. **A new `.ts` module in `electron/` needs a rollup entry** or the packaged
   app dies at startup while the build reports success.
7. **Read an existing modal before writing this one** — `PresentationSettingsModal`
   or `OutputSettingsModal`. Escape-to-close is an E3 requirement and there is a
   guard test for keyboard reachability.
8. **`MenuItem` sets the HTML `disabled` attribute** (fixed in #94), so a
   disabled Restore button is genuinely unfocusable — assert `toBeDisabled()`,
   not a class.
9. **Commitlint** rejects non-conventional types and sentence-case subjects; a
   subject starting with a capitalised token (`Cmd-S`, `F0`) reads as upper-case
   and is rejected.
10. **Never `git add -A`.** Add explicit paths.

## Required findings report

1. Gate results and CI E2E result.
2. Todo-1 failure output, proving tests came first.
3. The behaviour-change edits, named: the thinned prune; the invoke count
   (52 → 54); `revertToLatestVersion` gaining `capture`; `captureVersion`
   returning a boolean; and Discard writing no version.
7. Confirmation that THE INVARIANT test passes — the newest version equals the
   document after every restore and revert.
4. Any file touched outside the blast radius.
5. Whether any screenshot baseline moved (expected: none).
6. The measured retention behaviour on a real profile, if one is available.

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; retention case 5 compares the exact kept-id list with `toEqual`; restore and revert assert call **order**, not just presence |
| List sampling designed against | Counted exhaustive lists: retention rules 8, restore steps 9, unit cases 10+4+10+7, E2E 5, pitfalls 10. Counts re-derived after an independent review found the first draft's model broken |
| Quantifier erosion designed against | Retention is a pure function over the whole list, asserted as a whole list rather than sampled; the modal test asserts one row per version, not "at least one" |
| Sanctioned escape hatch | `N/A — no partial-completion state to allowlist; a blocked step is a STOP-and-report` |
| Bounded blast radius | 23-file table plus an explicit do-not-touch list; the editor store and every large file are untouched |
| File-specific pitfall notes | 10 notes, each naming a concrete file or mechanism |
| Exact paths, no improvisation | Every file named in full |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | Todo 5: no baseline should move because the modal is closed by default; a moved baseline is a finding, never a recapture; no local Playwright while Ethan is present |
| Preconditions for conditional UI | The modal needs a presentation open and at least one version; todo 4 seeds both by saving before opening it |
| Structural floor under snapshots | `N/A — no test snapshots.` E2E assertions pair each restore with a slide count read from SQLite |
| IPC contract pinning | One channel named with its exact key and payload; `ipcChannels.test.ts` and `assertComplete()` already enforce all four sides |
| Manual verification steps | `N/A for merge` — covered by todo 4. Issue #100's checklist gains the history flow for Ethan's live pass |
| Required findings report | 6-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 strictly precedes todo 2; failure output required |
| 2 | Behavior-change test edits | Five, each named in findings item 3: the thinned prune; 52 → 54 invoke methods; `revertToLatestVersion` gaining `capture`; `captureVersion` returning a boolean; and Discard writing no version. Each fails under the old code and passes under the new |
| 3 | No weakened assertions | Clause verbatim; whole-list comparisons; call-order assertions |
| 4 | Coverage floor | 31 unit cases + 5 E2E across 3 new modules and one new component; at least one per new exported function, plus one asserting THE INVARIANT |
| 5 | Lint floor | No `.only` / `.skip` / assertion-free tests / conditional `expect`; `eslint . --max-warnings 0` |
| 6 | Snapshot discipline | `N/A — no test snapshots.` Screenshot baselines covered by todo 5 |
| 7 | Completion gate | Todo 7 |
| 8 | Vitest / jsdom mechanics | Retention and label tests are pure (skeleton A) with an injected `now` and no clock control; the modal test carries `@vitest-environment jsdom` + `@testing-library/jest-dom/vitest`, resets the store in `beforeEach`, and mocks `@/utils/ipc` rather than `electron`; `better-sqlite3` is never loaded — queries use the fake db |
| 9 | Test placement | `electron/db/__tests__`, `src/utils/__tests__`, `src/components/editor/__tests__`, `e2e/` per the placement table |
| 10 | Characterization before refactor | `N/A — nothing is restructured. The two behaviour changes (prune policy, revert appending) are deliberate and are made under tests written in todo 1.` |
