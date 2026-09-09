# Executable Plan A5 — Autosave with Revert to Last Save

**Workstream:** A (Data safety) · **Depends on:** A1 (migrations, #29), A2 (journal)
**Decision (Ethan, 2026-09-06, reaffirmed and extended 2026-09-09):** autosave
writes to the real record. The charter's flagged consequence — *"with autosave
writing continuously, 'discard my changes' stops being possible without version
history"* — is answered with **revert-to-last-save**, stored in an **append-only
version table** so that version history is a later UI feature rather than a
later migration.
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

Written per `.cursor/rules/writing-executable-plans.mdc`. Ends with a complete
Compliance Manifest.

---

## What this delivers

The charter's Truth #3, unaddressed since 2026-09-06:

> *No autosave is the largest **product** risk in the project. A volunteer
> building a service order loses everything to one crash. Every other item here
> is about code health; this one is about someone's Sunday morning.*

After this plan, edits reach the database continuously and **Save keeps its
meaning**. The four user-visible facts:

1. Edits are written to the presentation's own row about two seconds after you
   stop typing (and never more than ten seconds apart while you keep typing).
2. **Save** (`⌘S`) is now a *commit*: it marks the current state as a version.
3. **File ▸ Revert to Last Save** throws away everything since that version.
4. **Discard** in the Unsaved Changes dialog does exactly the same thing — it
   is honest again, instead of quietly leaving autosaved edits in the record.

A crash no longer prompts. You reopen the presentation, your work is there, and
the title bar's existing "Unsaved changes" pill says so, with Revert available.
That is strictly better than A2's "Recover unsaved work?" dialog, which is why
slice 3 retires the journal's writer (see **The journal's fate**, below).

---

## Product principle: familiarity is the feature

**Ethan, 2026-09-09:** *"we want this system to mirror other successful ones in
most ways, it can't be a new system that would confuse them… the major
differences come in the thoughtfulness and explicit focus on church services,
organization, terminology… We want it to be as easy to read and navigate as
possible with all functions being noticeably similar and familiar."*

Save behaviour is exactly the kind of thing that must not be novel. A volunteer
who has used Keynote, PowerPoint or Google Docs must be able to guess right.
So every user-facing decision below is copied from an app they have already
used, and the novelty budget is spent on church-service concepts instead.

### What this mirrors — all 8, exhaustive

| Decision | Mirrors | Why not otherwise |
|---|---|---|
| Autosave writes to the real document | Keynote/Pages (macOS Lion onward), Google Docs, Figma, JetBrains, ProPresenter | AutoRecover-to-a-shadow-file is the pattern these replaced |
| `⌘S` still exists and still means "save" | Keynote (`⌘S` = save a version), Word, PowerPoint | Removing `⌘S` breaks the single strongest piece of muscle memory in desktop software |
| `⌘S` creates a restore point rather than "writing the file" | Keynote, Google Docs ("name this version") | A save that does nothing observable teaches users the button is broken |
| Menu item reads **Revert to Last Save**, in the File menu | Pages/Keynote `File ▸ Revert To ▸ Previous Save`; Word's historical `Revert to Saved` | Reads correctly to both the Apple and the Office audience |
| Revert sits directly under `Save As…` | Pages/Keynote put Revert To below the save group | Anywhere else and it is not where a user goes looking |
| Revert asks for confirmation before discarding | Pages/Keynote revert sheet; Word's revert prompt | It is destructive and unrecoverable at this stage (no history UI yet) |
| Title bar keeps its "Unsaved changes" / "Saved" pill | Apple's `— Edited` marker; Google Docs' "All changes saved" | Already built (`TitleBar.jsx:122–133`) and still exactly true under this model |
| No autosave on/off toggle in the UI | Keynote, Pages, Figma (none offer one) | PowerPoint's toggle exists only because autosave there depends on cloud storage; a local-first app has no such split |

### Deliberately *not* copied, and why

Google Docs, Figma and ProPresenter have **no Save button and no unsaved
state at all**. That is where the industry has landed, and it is where this app
should eventually go — but not in this plan. Removing `⌘S`, the dirty pill and
the Unsaved Changes dialog is a UX bet that must be made deliberately, with
version history already visible in the UI to replace them. Doing it here would
also churn `dialog-unsaved-changes-darwin.png` and `e2e/unsavedChanges.spec.ts`,
which exist to prove a real past bug stays fixed (phase7 #11).

**Recorded for a future plan, not this one:** once a version-history panel
exists, revisit whether `isDirty`, the Unsaved Changes dialog and `⌘S` still
earn their place.

### The one thing that is genuinely ours

Nothing in this plan. The church-service focus lives in sections, section
types, the presenter flow and terminology — not in the save model. That is the
point: **spend the novelty budget where it differentiates, and be boring
everywhere else.**

---

## Measured (verified 2026-09-09 on `main` @ `035be9f`, not estimated)

| Fact | Value | How verified |
|---|---|---|
| Gate | green — type-check ✓, lint ✓, vitest 308/308 in 41 files | `npm run gate` |
| E2E | 17 spec files, 30 test cases | `ls e2e/*.spec.ts`, `grep -c '^\s*test('` |
| Screenshot baselines | 52 | `ls e2e/*-snapshots/*.png \| wc -l` |
| IPC channels | 49 invoke · 1 send · 12 event | parsed from `shared/ipcContract.ts` |
| Migrations | 1–4 (`baseline-schema`, `presentation-journal`, `claim-legacy-built-in-hymns`, `built-in-revision`) | `electron/db/migrationList.ts` |
| Coverage ratchet | statements 15.2 · branches 12.9 · functions 14.4 · lines 16.0 | `vitest.config.mjs` |
| Coverage **measured** | 17.55 · 15.45 · 17.28 · 18.39 — the ratchet is ~2 points stale | `npx vitest run --coverage` |
| Autosave today | **none** — `grep -rni "autosave\|auto-save" src electron shared` → **0 hits** | grep |
| Open PRs / issues | 0 / 0 | `gh pr list`, `gh issue list` |

Facts the design rests on (each read in the code, 2026-09-09):

1. **Every presentation in the editor already has a row.** `createNewPresentation`
   inserts before the editor opens (`src/utils/presentationCommands.js:105`), so
   autosave never has to create one.
2. **`updatePresentation` writes six content columns** — `title`, `sections`,
   `default_background_id`, `aspect_ratio`, `custom_aspect_width`,
   `custom_aspect_height` — and sets `updated_at = unixepoch()`
   (`electron/db/queries/presentations.js`). **Five** of them can differ;
   `default_background_id` is forced to `null` by `normalizePresentation`
   (`backgrounds.js:33-34`) on every path, so it is excluded from the content
   key. Those five are the definition of "the document changed."
3. **`saveCurrentPresentation` calls `loadPresentationIntoEditor(result.data)`**,
   which calls `setPresentation` — that **resets selection and clears
   undo/redo history**. Autosave must therefore never route through it.
   (Pitfall 1.)
4. **`resolveUnsavedChanges` Discard has two branches** (`unsavedChanges.js:44-56`).
   For a `requiresInitialSave` presentation it **deletes the row**. For an
   existing one it is a **no-op on the row** — `setDirty(false)` and the
   in-memory edits are dropped. The second branch was correct only because the
   row was never touched; under autosave it becomes a **lie**. That is the exact
   breakage the charter predicted, and slice 2 fixes it.
5. **`openPresentationInEditor` calls `touchPresentation(id)` first**, which
   bumps `updated_at` on every open. Any "has it changed?" comparison must
   therefore ignore `updated_at`. (Pitfall 3.)
6. **`deletePresentation` cascades to nothing.** Journal rows for deleted
   presentations are already orphaned and survive until `selectRecoverable`
   calls them `presentation-missing`. A version table would leak the same way,
   and unlike the journal it grows without bound.
7. **The File menu is never captured open** by any of the 52 baselines.
   `visual-hover.spec.ts:131` opens the **View** menu for `hover-menu-item.png`.
   So a new File item changes no baseline. (Verified by reading all **7**
   `e2e/visual*.spec.ts` files.) **This is an assertion the plan tests, not an assumption it trusts.**
9. **There is a SEVENTH save path, and it bypasses `saveCurrentPresentation`.**
   `src/pages/Editor.jsx:305` defines its own `handleSave` that calls
   `updatePresentation` directly, then `setDirty(false)`. It is wired to the
   in-renderer keyboard handler (`:235`) and to `<Canvas onSave={handleSave} />`
   (`:392`). Left alone it would clear `isDirty` **without appending a version**,
   so `⌘S` would not be a commit on the path a user in the canvas is most likely
   to take, and the document would reopen dirty after a save. Slice 1 makes it
   delegate to `saveCurrentPresentation`.
10. **`renamePresentationById` writes the row without touching the store**
   (`presentationCommands.js:456-471`), and `Home.jsx:220` calls it. Without a
   version capture, renaming from Home makes the row diverge from its newest
   version, so the presentation opens **dirty** and Revert would silently rename
   it back.
11. **`setPresentation` resets `requiresInitialSave` to `false`**
   (`editorStore.js:91`), and two ordinary edit paths call it with no options —
   `insertNewSlideIntoCurrentPresentation` (`presentationCommands.js:247`) and
   `TitleBar.commitRename` (`TitleBar.jsx:55`). So inserting a slide into a
   brand-new presentation silently converts it to "already saved", and Discard
   then takes the revert branch instead of deleting the row. **This is a
   pre-existing bug** (today it means Discard leaves an unwanted presentation
   behind); autosave makes it choose between two *destructive* branches, so
   slice 1 fixes it.
8. **The title bar already shows unsaved state** — `TitleBar.jsx:122–133`
   renders an "Unsaved changes" / "Saved" pill from `isDirty ||
   requiresInitialSave`. Because `isDirty` keeps its meaning under this plan,
   the pill stays correct with **no change** to that file.

---

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

---

## The model

Three states, and the one rule that separates them:

| Concept | Where it lives | Changed by |
|---|---|---|
| **Live document** | `presentations` row | autosave, manual save, revert |
| **Versions** (restore points) | `presentation_versions` rows (new, migration 5) | manual save, open-if-none, create |
| **In-memory document** | `useEditorStore.presentation` | every edit action |

**`isDirty` means "the live document differs from the newest version."** It is
NOT cleared by autosave — that is the whole design. Save clears it by adding a
new version; Revert clears it by moving the live document back to the newest
version.

The six-field **content key** (fact 2) is the single definition of "differs."
It is computed **only from a `normalizePresentation`-normalized presentation**,
on both sides of every comparison, so a round trip through SQLite cannot
manufacture a difference.

### Why append-only rather than one row per presentation

A single restore point has a failure mode that every app in the familiarity
table above designs against: `⌘S` is reflexive. Save, make a mistake, save
again out of habit, and the only restore point has moved past the mistake.
Keynote, Google Docs, PowerPoint and JetBrains all answer this with a *list*.

This plan keeps the **single-restore-point UX** (only "Revert to Last Save"
ships) but stores it in a **list-shaped table**, because the two costs are
wildly asymmetric:

- Append-only now: a different `CREATE TABLE` and a prune query. Roughly an hour.
- Retrofitting later: a migration that reshapes a `PRIMARY KEY`, plus a rewrite
  of every read path.

**Scope discipline:** no history UI, no version browser, no "name this version"
in this plan. `listVersions` exists solely so the prune policy is testable and
so the future panel needs no schema change. If an executor finds themselves
building a history UI, they have left the plan — **STOP and report.**

### Semantics table — all 8 rows, exhaustive

| Event | Live row | Versions | `isDirty` |
|---|---|---|---|
| Edit action | unchanged (yet) | unchanged | → `true` |
| Autosave fires | ← in-memory | unchanged | unchanged (`true`) |
| Manual Save | ← in-memory | **+1 appended** | → `false` |
| Save As… | new row created | **+1 appended** for the new row | → `false` |
| Revert to Last Save | ← newest version | unchanged (**never** appended) | → `false` |
| Discard (existing presentation) | ← newest version | unchanged | → `false` |
| Discard (`requiresInitialSave`) | row **deleted** | **all deleted** for that id | → `false` |
| Open a presentation | unchanged | +1 appended **only if none exist** | `true` iff content key ≠ newest version |

Two rules worth stating separately because they are easy to get backwards:

- **Revert never appends a version.** Reverting is not a save; appending would
  make the reverted-away state unreachable and defeat a future history panel.
- **Autosave never appends a version.** Versions are deliberate acts only.
  Appending on autosave would fill the table with noise every two seconds.

That last table row is the crash story: after a crash the row holds autosaved
edits, the newest version holds the last commit, they differ, so the document
opens **unsaved with Revert available**. No prompt.

---

## The journal's fate — why slice 3 exists

A2's `presentation_journal` and autosave cannot both run. This is not a taste
argument; the incoherence is mechanical and checkable:

- `selectRecoverable` calls a journal stale when
  `journal.base_updated_at !== presentation.updated_at`
  (`src/utils/recoveryJournal.ts`).
- Every autosave runs `UPDATE presentations SET … updated_at = unixepoch()`.
- Therefore **every journal row is stale before it is ever read**, and
  `offerRecoveryOnStartup` deletes it silently.

`presentation_journal` would become a write-only table: a safety net that looks
alive, costs a serialized JSON write every two seconds, and can never fire. That
is worse than not having one. Slice 3 removes the **writer** and nothing else.

**What slice 3 removes — all 14, exhaustive.** One line per removal; do not
collapse two into one.

1. `startRecoveryJournalSync` (`recoveryJournalSync.ts`)
2. Its call and the `stop` return in `App.jsx`
3. `baseUpdatedAtOf()` — a local helper used only by the writer
4. The `writeJournal` import in `recoveryJournalSync.ts`
5. The `nextWriteDelayMs` import in `recoveryJournalSync.ts`
6. `SyncDeps.writeJournal` and its `defaultDeps()` entry
7. `SyncDeps.now` and its `defaultDeps()` entry — used only by the writer's `schedule`
8. `JOURNAL_EXEMPT_PRESENTATION_IDS` and its test at `recoveryJournalSync.test.ts:185`
9. `nextWriteDelayMs` (`recoveryJournal.ts`)
10. `JOURNAL_DEBOUNCE_MS`
11. `JOURNAL_MAX_WAIT_MS`
12. The `writeJournal` row in `shared/ipcContract.ts`
13. The `db:journal:write` handler in `electron/main/index.js` and the
    `writeJournal` wrapper in `src/utils/ipc.ts`
14. `writeJournal` in `electron/db/queries/journal.js`, its **2** cases in
    `journalQueries.test.ts`, and the `describe('presentation journal')` block
    in `realSqlite.queries.test.ts` that seeds rows through it

**What slice 3 keeps, deliberately:** the `presentation_journal` table (no
destructive migration — ever), `selectRecoverable`, `offerRecoveryOnStartup`,
and the `listJournals` / `deleteJournal` channels. They still drain journal rows
written by a pre-autosave build, which is a real database state on Ethan's
machine today. Cost is one `SELECT` per launch against a table that is empty
forever after.

**Removal trigger for the rest**, recorded so it is not forgotten: once
`sqlite3 ~/Library/Application\ Support/presenter-pro/presenterpro.db 'SELECT
COUNT(*) FROM presentation_journal'` reads `0` on Ethan's real profile, a
follow-up plan may delete `recoveryJournal.ts`, `recoveryJournalSync.ts`, the
two remaining channels and the table. **Not in this plan.**

---

## Slices

Three PRs, one plan — the E4 pattern (`plan-E4-inline-styles.md`, PRs #71–#82).
The order is a safety property, not a preference: **Revert must exist and be
proven before autosave can create the state that needs it.**

| Slice | Ships |
|---|---|
| 1 | Version store + `File ▸ Revert to Last Save`. No autosave. |
| 2 | Autosave writer; Discard becomes revert; dirty-on-open. |
| 3 | Retire the journal writer. |

**`main` must be coherent after each slice.** Slice 1 alone is useful (Revert
throws away in-memory edits and reloads the last save).

**DEVIATION, applied 2026-09-09: slices 2 and 3 shipped as ONE PR.** The plan
allowed for them landing the same day; in the event they could not be separated
at all. Running slice 2 on its own turned two `e2e/recovery.spec.ts` specs red
— the journal's staleness rule firing exactly as *The journal's fate* predicted
— so a slice-2-only commit would have left `main` with a failing required
check. The argument on paper and the observed behaviour agree; they merged
together. Slice 1 shipped separately as planned (#94).

---

## Bounded blast radius

### Slice 1 — version store and Revert

| File | Action |
|---|---|
| `presenter-pro/electron/db/migrationList.ts` | modify — **append migration 5 only** |
| `presenter-pro/electron/db/queries/versions.js` | create |
| `presenter-pro/electron/db/queries/presentations.js` | modify — `deletePresentation` cascade only |
| `presenter-pro/electron/db/__tests__/versionQueries.test.ts` | create |
| `presenter-pro/electron/db/__tests__/presentationQueries.test.ts` | create or modify — cascade cases |
| `presenter-pro/electron/main/index.js` | modify — 4 `ipc.handle` blocks beside the journal handlers; **1 native menu item**; nothing else |
| `presenter-pro/electron.vite.config.js` | modify — add the `db/queries/versions` rollup entry |
| `presenter-pro/shared/ipcContract.ts` | modify — 4 rows in `INVOKE_METHODS` |
| `presenter-pro/src/utils/ipc.ts` | modify — 4 wrappers |
| `presenter-pro/src/utils/presentationVersions.ts` | create (pure policy) |
| `presenter-pro/src/utils/presentationVersionsSync.ts` | create (wiring) |
| `presenter-pro/src/utils/__tests__/presentationVersions.test.ts` | create |
| `presenter-pro/src/utils/__tests__/presentationVersionsSync.test.ts` | create |
| `presenter-pro/src/utils/presentationCommands.js` | modify — version capture in `openPresentationInEditor`, `createNewPresentation`, `createPresentationFromTemplate`, `saveCurrentPresentation`, `saveCurrentPresentationAs`; new `revertCurrentPresentationToLastSave` |
| `presenter-pro/src/utils/__tests__/presentationCommands.test.ts` | create or modify |
| `presenter-pro/src/utils/appCommands.js` | modify — one `case 'file:revert'` |
| `presenter-pro/src/utils/__tests__/appCommands.test.ts` | create or modify — revert case |
| `presenter-pro/src/components/layout/MenuBar.jsx` | modify — 1 menu item + its disabled rule |
| `presenter-pro/src/components/layout/__tests__/MenuBar.test.tsx` | create or modify |
| `presenter-pro/e2e/revert.spec.ts` | create |
| `presenter-pro/e2e/migrations.spec.ts` | modify — expected lists gain version 5 (behaviour-change edit, todo 4) |
| `presenter-pro/electron/db/__tests__/migrations.test.ts` | modify — `[1,2,3,4]` → `[1,2,3,4,5]` and the test name (behaviour-change edit) |
| `presenter-pro/electron/db/__tests__/realSqlite.migrations.test.ts` | modify — `applied`, the `schema_migrations` rows, the `tablesOf` list and the `COUNT(*)` (behaviour-change edit) |
| `presenter-pro/src/pages/Editor.jsx` | modify — `handleSave` delegates to `saveCurrentPresentation` (fact 9); nothing else |
| `presenter-pro/src/pages/__tests__/Editor.save.test.tsx` | create — characterization + the delegation |
| `presenter-pro/src/components/layout/TitleBar.jsx` | modify — **two lines only**, the `setPresentation` options in `commitRename` (fact 11) |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |
| `tasks/plan-A5-autosave.md` · `tasks/fable-pass-plan.md` · `tasks/fable-notes.md` | modify — records |

### Slice 2 — autosave

| File | Action |
|---|---|
| `presenter-pro/src/utils/autosave.ts` | create (pure policy) |
| `presenter-pro/src/utils/autosaveSync.ts` | create (wiring) |
| `presenter-pro/src/utils/__tests__/autosave.test.ts` | create |
| `presenter-pro/src/utils/__tests__/autosaveSync.test.ts` | create |
| `presenter-pro/src/App.jsx` | modify — start autosave in the main-window effect |
| `presenter-pro/src/utils/unsavedChanges.js` | modify — Discard reverts; cancel pending autosave in all three non-Cancel branches |
| `presenter-pro/src/utils/__tests__/unsavedChanges.test.ts` | create or modify — behaviour-change edits |
| `presenter-pro/src/utils/presentationCommands.js` | modify — `openPresentationInEditor` sets dirty when diverged |
| `presenter-pro/e2e/autosave.spec.ts` | create |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |

### Slice 3 — retire the journal writer

| File | Action |
|---|---|
| `presenter-pro/src/utils/recoveryJournalSync.ts` | modify — delete `startRecoveryJournalSync` + `JOURNAL_EXEMPT_PRESENTATION_IDS` |
| `presenter-pro/src/utils/recoveryJournal.ts` | modify — delete `nextWriteDelayMs` and its two constants |
| `presenter-pro/src/utils/__tests__/recoveryJournal.test.ts` | modify — delete the 3 `nextWriteDelayMs` cases |
| `presenter-pro/src/utils/__tests__/recoveryJournalSync.test.ts` | modify — delete the writer cases, keep the startup cases |
| `presenter-pro/src/App.jsx` | modify — drop the `startRecoveryJournalSync` call |
| `presenter-pro/shared/ipcContract.ts` | modify — remove the `writeJournal` row |
| `presenter-pro/src/utils/ipc.ts` | modify — remove the `writeJournal` wrapper |
| `presenter-pro/electron/main/index.js` | modify — remove the `db:journal:write` handler |
| `presenter-pro/electron/db/queries/journal.js` | modify — remove `writeJournal` |
| `presenter-pro/electron/db/__tests__/journalQueries.test.ts` | modify — remove the write case |
| `presenter-pro/electron/db/__tests__/realSqlite.queries.test.ts` | modify — delete the `describe('presentation journal')` block at `:226`, whose helper is `writeJournal` |
| `presenter-pro/e2e/recovery.spec.ts` | rewrite — behaviour-change edit, see todo 14 |
| `presenter-pro/vitest.config.mjs` | modify — thresholds |

### Do NOT modify, in any slice

`src/store/editorStore.js` (subscribe to it; do not change it) ·
`src/utils/backgrounds.js` · `src/utils/textBoxes.js` ·
`src/components/editor/Canvas.jsx` · `src/components/editor/Filmstrip.jsx` ·
`src/components/layout/Toolbar.jsx` · `src/pages/Home.jsx` ·
any migration 1–4 · any `e2e/visual*.spec.ts` · any `e2e/*-snapshots/*.png` ·
`src/__tests__/inlineStyleBudget.test.ts` · `src/__tests__/tailwindTokens.test.ts` ·
`eslint-suppressions.json`.

If a change here looks necessary, **STOP and report it** — do not make it.
Do not create test directories outside `.cursor/rules/testing-standards.mdc`'s
placement table.

---

## Design — slice 1

### Migration 5

```sql
CREATE TABLE IF NOT EXISTS presentation_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  presentation_id INTEGER NOT NULL,
  snapshot        TEXT    NOT NULL,  -- JSON of the presentation at save time
  saved_at        INTEGER NOT NULL   -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_presentation_versions_lookup
  ON presentation_versions(presentation_id, id DESC);
```

Appended to `MIGRATIONS` as `{ version: 5, name: 'presentation-versions', up }`,
idempotent by inspection (`IF NOT EXISTS`), exactly like migration 2.
**Never edit migrations 1–4.**

**Newest is by `id DESC`, never by `saved_at`.** `saved_at` has one-second
resolution (`unixepoch()`), so two saves in the same second would tie and the
"newest version" would be ambiguous — the exact class of bug that only shows up
under a fast test or an impatient user. `id` is monotonic; order by it.

**No `label` column.** Named versions are a history-UI feature, and adding a
nullable column later is a three-line `addColumnIfMissing` migration (migration 4
is the precedent). The `PRIMARY KEY` shape is the part that is expensive to
change later, and that is what this migration gets right.

### `electron/db/queries/versions.js` — CJS, mirrors `queries/journal.js`

```js
writeVersion(db, { presentationId, snapshot })  // INSERT + prune, one transaction
getLatestVersion(db, presentationId)            // row | null, ORDER BY id DESC LIMIT 1
listVersions(db, presentationId)                // rows, newest first (prune tests + future UI)
deleteVersionsFor(db, presentationId)
```

**Prune policy:** `writeVersion` keeps the newest `MAX_VERSIONS_PER_PRESENTATION
= 25` rows for that presentation and deletes the rest, in the **same
transaction** as the insert. 25 deliberate saves of a large service order is a
few megabytes at most, and the number is a named constant so it is one edit to
change. Without a prune, an append-only table on a machine that runs for years
is a slow disk leak — fact 6's warning, taken seriously.

### `queries/presentations.js` — cascade

`deletePresentation` additionally deletes the presentation's
`presentation_versions` **and** `presentation_journal` rows, in one
`db.transaction`. The journal half fixes the pre-existing orphan leak in fact 6;
it is a **behaviour change** and must be reported.

### IPC — 4 channels (contract → main → renderer, one PR)

| `INVOKE_METHODS` key | Channel | `src/utils/ipc.ts` wrapper |
|---|---|---|
| `writeVersion` | `db:versions:write` | `writeVersion(data)` |
| `getLatestVersion` | `db:versions:latest` | `getLatestVersion(presentationId)` |
| `listVersions` | `db:versions:list` | `listVersions(presentationId)` |
| `deleteVersionsFor` | `db:versions:deleteFor` | `deleteVersionsFor(presentationId)` |

Handlers copy the style of `db:journal:*` exactly. `ipcChannels.test.ts` and
`assertComplete()` already enforce all four sides — do not add new guards.

### `src/utils/presentationVersions.ts` — pure, fully tested

```ts
/** The content columns that can actually differ — the definition of "changed". */
export const CONTENT_FIELDS = [
  'title', 'sections',
  'aspectRatio', 'customAspectWidth', 'customAspectHeight',
] as const;

/** Stable JSON of the six content fields, in CONTENT_FIELDS order. */
export function presentationContentKey(presentation: unknown): string;

/** True when the live document differs from the newest version's snapshot. */
export function hasDiverged(presentation: unknown, versionSnapshot: string | null): boolean;
// `versionSnapshot` is the whole stored presentation JSON, NOT a content key.
// It is PARSED and never re-normalized: the snapshot was stored already
// normalized, and re-running normalizePresentation would re-mint uuids for
// id-less content (textBoxes.js:120,147) and manufacture a false difference.
// That is also why this module needs no import from backgrounds.js.
```

Rules — **all 5, exhaustive:**
1. The key is built from `CONTENT_FIELDS` in that exact order, so `JSON.stringify`
   is stable.
2. `default_background_id` / `aspect_ratio` / `custom_aspect_width` /
   `custom_aspect_height` (snake_case, as SQLite returns them) are read as
   fallbacks for their camelCase names, so a DB row and an in-memory object
   produce the same key.
3. `updated_at`, `created_at` and `id` are **never** part of the key (fact 5).
   Neither is `defaultBackgroundId`: `normalizePresentation` hard-nulls **both**
   spellings unconditionally (`backgrounds.js:33-34`), so after normalization it
   is a constant and can never contribute a difference. Including it would be
   dead weight that reads as meaningful. **This is a finding to report**, not a
   silent omission — see *Findings for Ethan* below.
4. A `null` / `undefined` presentation produces the key of an empty document,
   never a throw.
5. `hasDiverged(p, null)` is `false` — no version means nothing to differ from,
   and an absent version must not mark a document dirty.

### `src/utils/presentationVersionsSync.ts` — wiring, deps injectable

```ts
export interface VersionDeps { writeVersion; getLatestVersion; deleteVersionsFor;
                               updatePresentation; loadPresentationIntoEditor;
                               store; now }
export async function captureVersion(presentation, deps?): Promise<void>;
export async function ensureVersion(presentation, deps?): Promise<void>;
export async function readLatestSnapshot(id, deps?): Promise<string | null>;
export async function revertToLatestVersion(id, deps?): Promise<boolean>;
```

- **`captureVersion` is content-key-idempotent**: it reads the newest version
  and appends **only if `presentationContentKey(candidate)` differs from
  `presentationContentKey(JSON.parse(newest.snapshot))`**. This is load-bearing
  twice over:
  - Reflexive `⌘S` is exactly the habit the append-only table exists to protect
    against, and `saveCurrentPresentation` runs regardless of `isDirty`
    (`presentationCommands.js:180`, `appCommands.js:47`). Without idempotency,
    25 habitual saves prune away every genuine restore point and the list
    degrades to strictly worse than a single row.
  - `createNewPresentation`, `createPresentationFromTemplate` and
    `saveCurrentPresentationAs` all route through `openPresentationInEditor`
    (`presentationCommands.js:111,175,218`), whose `ensureVersion` already
    appends for a brand-new row — so an unconditional `captureVersion` at those
    sites would double-append and break todo 5 case 5's row count.
- `ensureVersion` appends **only if `getLatestVersion` returns no row**.
- **The snapshot is always taken from the value that came back out of SQLite**,
  normalized by `normalizePresentation` — never from the in-memory object
  directly. This is what makes the round trip lossless. (Pitfall 2.)
- `revertToLatestVersion`, in this exact order — **all 7 steps, exhaustive:**
  1. **`cancelPendingAutosave()` FIRST**, before any `await`. Every later step
     yields, and a debounced autosave firing mid-revert would issue its write
     *after* the revert's and leave the reverted-away edits in the row while the
     editor showed the reverted document and the pill read "Saved".
  2. `getLatestVersion(id)`. **No row → `alertDialog('There is no saved version
     to revert to.')` and return `false`** — never a silent no-op after a
     destructive-sounding confirmation.
  3. `JSON.parse` the snapshot. Unparseable → alert and return `false`.
  4. **Validate the parsed value**: it must be a non-null object with an array
     `sections`. `JSON.parse('null')` succeeds and would otherwise reach
     `updatePresentation(id, null)`, whose handler destructures it and throws.
  5. `updatePresentation(id, parsed)`.
  6. **Guard the envelope exactly as `saveCurrentPresentation` does**
     (`presentationCommands.js:186`): only on `result?.success && result.data`
     may `loadPresentationIntoEditor(result.data)` run. On failure, `alertDialog`
     and return `false`. Calling `loadPresentationIntoEditor(undefined)` would
     pass `undefined` through `normalizePresentation` (which returns it
     unchanged, `backgrounds.js:14`) into `setPresentation`, blanking the open
     document to `presentation: null` with no error shown.
  7. `setDirty(false)`, `setRequiresInitialSave(false)`. It **must not**
     `captureVersion` — reverting is not a save.

### Where versions are captured — all 4 sites, exhaustive

**There are exactly seven ways this app writes a presentation row.** They were
enumerated by `grep -rn "updatePresentation\|createPresentation" src/`. Every
one has a disposition here; none may be left out.

| # | Write path | Disposition |
|---|---|---|
| 1 | `openPresentationInEditor` (`presentationCommands.js:86`) | **`ensureVersion(loaded)`** — appends only when the row has no version yet |
| 2 | `createNewPresentation` (`:100`) | **nothing** — it calls path 1 internally (`:111`), which already captures |
| 3 | `createPresentationFromTemplate` (`:120`) | **nothing** — calls path 1 internally (`:175`) |
| 4 | `saveCurrentPresentationAs` (`:195`) | **nothing** — calls path 1 internally (`:218`) |
| 5 | `saveCurrentPresentation` (`:180`) | **`captureVersion(result.data)`** on success |
| 6 | `renamePresentationById` (`:456`) | **`captureVersion(result.data)`** on success — fact 10 |
| 7 | `Editor.jsx handleSave` (`Editor.jsx:305`) | **delegate to `saveCurrentPresentation()`**, keeping its `alertDialog` on failure — fact 9 |

**Paths 2, 3 and 4 must NOT also call `captureVersion`.** Each routes through
`openPresentationInEditor`, so an extra capture would append a second,
byte-identical row for every new presentation and every Save As — and would
break todo 5 case 5's row count. `captureVersion`'s content-key idempotency
(above) is the belt to this braces; both are required.

The Save branch of `resolveUnsavedChanges` (`unsavedChanges.js:29`) is an
**eighth** row-write. It gets `captureVersion` in **slice 2**, where that file
is already open. Until then it is harmless: without autosave the row equals the
in-memory state anyway. **Do not touch `unsavedChanges.js` in slice 1.**

### The `requiresInitialSave` fix (fact 11), slice 1

`insertNewSlideIntoCurrentPresentation` (`presentationCommands.js:247`) and
`TitleBar.commitRename` (`TitleBar.jsx:55`) must pass
`{ isDirty: true, requiresInitialSave: <current value> }` to `setPresentation`
so an ordinary edit stops silently clearing the flag. A failing test lands
first (todo 1). `TitleBar.jsx` is therefore removed from the do-not-touch list
**for this two-line change only** — no markup, no classes, no styles, so no
screenshot baseline may move.

### The Revert command

- `appCommands.js`: `case 'file:revert': return revertCurrentPresentationToLastSave();`
- `presentationCommands.js`:

  ```js
  export async function revertCurrentPresentationToLastSave() {
    const state = useEditorStore.getState();
    if (!state.presentation || !state.isDirty || state.requiresInitialSave) return false;
    const ok = await confirmDialog(
      'Your changes since the last save will be lost. This cannot be undone.',
      { title: 'Revert to Last Save', confirmLabel: 'Revert', danger: true }
    );
    if (!ok) return false;
    return revertToLatestVersion(state.presentation.id);
  }
  ```

  The wording mirrors the Pages/Keynote revert sheet: state the consequence,
  then the irreversibility, and label the confirm button with the verb rather
  than "OK".

- `MenuBar.jsx` File menu, **after `Save As…`, before the divider**:
  `{ label: 'Revert to Last Save', action: 'file:revert' }`.
  Disabled when `!presentation || !isDirty || requiresInitialSave` — a new
  presentation has no save to revert to, so the item must not merely fail
  silently. `MenuBar` already subscribes to `presentation`; add `isDirty` and
  `requiresInitialSave` selectors.
- `electron/main/index.js` File submenu, same position:
  `{ label: 'Revert to Last Save', click: () => sendCommand('file:revert') }`.
  **No accelerator** — Pages and Keynote give Revert no shortcut either, every
  free `⌘`-chord in the File menu is taken, and an unbid shortcut for a
  destructive action is a hazard.

  **The native item is always enabled.** This app has no menu-state plumbing at
  all (`grep -n "enabled" electron/main/index.js` → nothing), so the native item
  cannot be greyed out the way the in-app one is. The command must therefore
  fail *loudly*, not silently: `revertCurrentPresentationToLastSave` returns
  `false` early for a clean or never-saved document, and in that case
  `alertDialog('There are no changes to revert.')` — otherwise the two menu bars
  would behave differently for the same command. Add menu-state plumbing only in
  a future plan; do not build it here.

### Sanctioned escape hatch

Exactly one, initially empty, in `presentationVersionsSync.ts`:

```ts
/**
 * Presentation ids for which no version is ever captured. Every entry REQUIRES
 * a justifying comment and must be reported. Do not add entries to make
 * something pass.
 */
export const VERSION_EXEMPT_PRESENTATION_IDS: ReadonlyArray<number> = [];
```

---

## Design — slice 2

### `src/utils/autosave.ts` — pure

```ts
export const AUTOSAVE_DEBOUNCE_MS = 2_000;
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
export function nextAutosaveDelayMs(input: {
  now: number; lastChangeAt: number; lastWriteAt: number | null;
}): number;
```

Same trailing-debounce-with-max-wait shape A2 proved. It is a **fresh
implementation, not an import** from `recoveryJournal.ts` — slice 3 deletes that
one, and a live module must not depend on a module being retired.

Two seconds matches the interval users already expect from Google Docs and
Keynote; ten seconds bounds the worst case while someone types continuously.

### `src/utils/autosaveSync.ts` — wiring

```ts
export function startAutosave(deps?: AutosaveDeps): () => void;  // returns stop()
export function cancelPendingAutosave(): void;                    // module-level
```

Subscription rules — **all 9, exhaustive:**

1. **Schedule using the journal's transition condition, verbatim:**
   ```js
   state.isDirty && state.presentation &&
     (!prev.isDirty || state.presentation !== prev.presentation)
   ```
   **Do not simplify this to `state.presentation !== prev.presentation && state.isDirty`.**
   That weaker form never fires for the app's most common edit path:
   `insertNewSlideIntoCurrentPresentation` calls `setPresentation(...)` (which
   sets `isDirty: false`) and *then* `setDirty(true)`
   (`presentationCommands.js:247,253`), so the presentation-reference change and
   the dirty change arrive in **two separate notifications**, and neither
   satisfies both halves at once. `TitleBar.commitRename` has the same shape.
   `recoveryJournalSync.ts:136-140` already gets this right — copy it.
2. **Fire-time guard.** `flush()` re-reads the store and returns without writing
   unless `state.isDirty && state.presentation && id != null`, exactly as
   `recoveryJournalSync.ts:102` does. State can change between schedule and fire.
3. Before writing, recompute `presentationContentKey`. **Skip the write if the
   key is unchanged since the last successful write** — selection and
   normalization churn must not cost a SQLite write.
4. The write is `updatePresentation(id, presentation)` and **nothing else**. It
   does **not** call `loadPresentationIntoEditor`, does **not** call
   `setPresentation`, does **not** clear `isDirty`, and does **not**
   `captureVersion` (fact 3, pitfall 1).
5. **The write's envelope is inspected. Autosave may never fail silently.**
   - `result.success === false` → **do not** record `lastWrittenKey` (so the
     content is retried on the next change), increment a failure counter, and
     once it reaches `AUTOSAVE_FAILURE_ALERT_THRESHOLD = 3`, `alertDialog` once
     with the error and stop scheduling until the next successful write.
   - `result.success === true && result.data == null` → the row is **gone**
     (`getPresentation` returns `null` for a missing id,
     `queries/presentations.js:8`). Stop autosaving this document and alert;
     continuing would silently no-op forever against a deleted presentation.
   - A success resets the failure counter and records `lastWrittenKey`.
6. **Bookkeeping is explicit.** `lastWriteAt` is recorded **before** the `await`
   (as `recoveryJournalSync.ts:104` does, so the max-wait maths cannot
   double-fire); `lastWrittenKey` is recorded **only on success** (rule 5). A
   monotonic `generation` counter is incremented by every cancel; a flush whose
   generation is stale abandons before issuing its invoke.
7. **`presentationId` change → FLUSH the previous document, then reset.** Not
   cancel. The old "cancel, never flush" rule was wrong: both Discard branches
   already call `cancelPendingAutosave()` first and Discard-on-existing reverts
   the *same* id, so cancelling here protects nothing — while
   `case 'file:open'` (`appCommands.js:43-46`) navigates Home **without**
   `resolveUnsavedChanges`, so a user who opens another presentation from a
   dirty editor would lose up to `AUTOSAVE_MAX_WAIT_MS` of work with no prompt.
   Flush `prev.presentation` under `prev.presentationId`.
8. `isDirty` `true → false` → cancel. Save and Revert both already wrote what
   they meant to write. **This is the only rule that cancels.**
9. Ids in `VERSION_EXEMPT_PRESENTATION_IDS` are never autosaved either.

`cancelPendingAutosave()` reads a module-level controller that `startAutosave`
registers and `stop()` clears. It is a no-op when autosave is not running, so
unit tests of `unsavedChanges.js` need no autosave harness.

### `unsavedChanges.js` — the honest Discard

Ordering is a correctness requirement, not a style choice:

| Branch | Steps, in order |
|---|---|
| Save | `cancelPendingAutosave()` → `updatePresentation` → `captureVersion(result.data)` → `setDirty(false)` → `setRequiresInitialSave(false)` |
| Discard, `requiresInitialSave` | `cancelPendingAutosave()` → `deletePresentation(id)` (cascade drops the versions) → clear flags |
| Discard, existing | `cancelPendingAutosave()` → `revertToLatestVersion(id, { navigate: false })` → **if it returns `false`, `alertDialog` and return `false`** (do not clear the flags) → clear flags |
| Cancel | `cancelPendingAutosave()` is **not** called — the user is still editing |

**`cancelPendingAutosave()` must precede the write in every non-Cancel branch.**
A pending timer that fires after a revert would write the reverted-away edits
straight back into the row. (Pitfall 4.)

Two things this table encodes that are easy to get wrong:

- **The revert branch must handle failure.** `revertToLatestVersion` returns
  `false` when there is no version, the snapshot will not parse, or the write
  fails. The existing delete branch already alerts and returns `false`
  (`unsavedChanges.js:44-52`); the revert branch must match. Clearing the flags
  on a failed revert would report success while leaving the autosaved edits the
  user asked to discard sitting in the row — the precise lie this plan exists to
  remove.
- **`{ navigate: false }` is required here.** `revertToLatestVersion` ends in
  `loadPresentationIntoEditor`, which calls
  `useAppStore.setCurrentView('editor')` (`presentationCommands.js:81`). Every
  caller of `resolveUnsavedChanges` is *leaving* the editor
  (`appCommands.js:52` and `:99`, `TitleBar.jsx:30`), so forcing the view back
  would fight the navigation that follows. `revertToLatestVersion` therefore
  takes `{ navigate = true }` and, when `false`, sets the store via
  `setPresentation` + `selectFirstSlide` without touching `currentView`.

The dialog's title, description and its three actions `Cancel / Discard / Save`
are **unchanged** — `e2e/unsavedChanges.spec.ts` asserts that exact ordered list
and `dialog-unsaved-changes-darwin.png` captures it. Neither may move.

### Dirty on open

`openPresentationInEditor`, after `ensureVersion`: if
`hasDiverged(loaded, snapshot)` then `setDirty(true)` and
`setRequiresInitialSave(false)`. This is the crash story, and it is the only
new call to `setDirty` in the plan.

---

## Todos

Slices are separate PRs. Do not start a slice before the previous one is merged.

### Slice 1 — version store and Revert

- [x] **1. Failing tests first (TDD — complete before todo 2).**

      `src/utils/__tests__/presentationVersions.test.ts` — **all 9, exhaustive:**
      1. `presentationContentKey` includes all six `CONTENT_FIELDS` — assert by
         iterating `CONTENT_FIELDS` and checking each name appears in the key;
         **fail loudly if `CONTENT_FIELDS` is empty** (quantifier guard).
      2. Two objects differing only in `updated_at` produce the **same** key.
      3. Two objects differing only in `id` or `created_at` produce the same key.
      4. A snake_case DB row and its camelCase in-memory twin produce the same key.
      5. Changing `sections` changes the key.
      6. Changing `title` changes the key.
      7. `presentationContentKey(null)` returns the empty-document key, no throw.
      8. `hasDiverged` takes a **snapshot** (whole normalized presentation JSON),
         not a content key: `hasDiverged(p, null)` is `false`;
         `hasDiverged(p, JSON.stringify(normalizePresentation(p)))` is `false`;
         `hasDiverged(p, JSON.stringify(normalizePresentation(other)))` is
         `true`. **Do not pass a content key here** — a plain string comparison
         against a snapshot would report every document diverged on open, and
         every presentation would open dirty forever.
      9. **Determinism / idempotency, the property the whole design rests on.**
         For a presentation built by `createTextSlide` and for one whose slides
         and text boxes have **no ids** (legacy/template/song-import shape):
         `key(normalize(x))` equals `key(normalize(normalize(x)))` and equals
         `key(normalize(JSON.parse(JSON.stringify(normalize(x)))))`.
         **Why this matters:** `normalizeTextBox` mints `uuid()` for an id-less
         box at index > 0 and `legacyTextBoxId` mints one for an id-less slide
         (`textBoxes.js:120,147`), so a *first* normalization of legacy content
         is non-deterministic. If a fresh normalization is compared against a
         separately-normalized snapshot, the keys differ, the document is
         permanently dirty, and autosave writes forever on an idle document.
         **The mitigation is structural and must be implemented:** the value
         passed to `ensureVersion` / `captureVersion` is the **same normalized
         object** that `loadPresentationIntoEditor` returned and put in the
         store — never a second, independent normalization of the same row.

      `src/utils/__tests__/presentationVersionsSync.test.ts` (fake ipc, store
      reset in `beforeEach`) — **all 8, exhaustive:**
      1. `captureVersion` writes with the exact payload (`toEqual`).
      2. `ensureVersion` writes when `getLatestVersion` returns no row.
      3. `ensureVersion` does **not** write when a row exists (call count `0`).
      4. `revertToLatestVersion` calls `updatePresentation` with the parsed
         snapshot (`toEqual`), then loads it, then sets dirty `false`.
      5. `revertToLatestVersion` calls `writeVersion` **zero** times — reverting
         is not a save.
      6. `revertToLatestVersion` returns `false` and writes nothing when there is
         no version row.
      7. `revertToLatestVersion` returns `false` and writes nothing on
         unparseable JSON.
      8. `VERSION_EXEMPT_PRESENTATION_IDS` is empty (ratchet).

      `electron/db/__tests__/versionQueries.test.ts` (fake db, like
      `journalQueries.test.ts`) — **all 6, exhaustive:**
      1. `writeVersion` issues an `INSERT` (not an upsert — appending is the point).
      2. `writeVersion` runs the insert and the prune inside `db.transaction`.
      3. The prune keeps `MAX_VERSIONS_PER_PRESENTATION` and is scoped to the
         one presentation id (assert the id is bound, so one document's saves
         cannot prune another's).
      4. `getLatestVersion` orders by `id DESC` — assert the SQL orders by `id`,
         **not** `saved_at`.
      5. `listVersions` is scoped to the presentation id and newest-first.
      6. `deleteVersionsFor` targets the id.

      `electron/db/__tests__/presentationQueries.test.ts` — **all 2,
      exhaustive:** `deletePresentation` issues deletes against all three of
      `presentations`, `presentation_versions`, `presentation_journal` (assert
      the exact set of tables touched — count and membership both matter); and
      it runs them inside `db.transaction`.

      `src/utils/__tests__/presentationCommands.test.ts` (create) — **all 9,
      exhaustive**, one per row of the write-path table plus the guards:
      1. `openPresentationInEditor` calls `ensureVersion` with the normalized
         loaded presentation (the same object it returns).
      2. `createNewPresentation` results in **exactly one** version write
         (`writeVersion` call count `1`, not 2) — the double-capture guard.
      3. `createPresentationFromTemplate` likewise: **exactly one**.
      4. `saveCurrentPresentationAs` likewise: **exactly one**, for the new id.
      5. `saveCurrentPresentation` calls `captureVersion` with `result.data`.
      6. `renamePresentationById` calls `captureVersion` with `result.data`.
      7. `captureVersion` is idempotent: a second call with content-identical
         input writes **nothing** (call count stays `1`).
      8. `revertCurrentPresentationToLastSave` returns `false` **and does not
         prompt** when the document is clean.
      9. …and likewise when `requiresInitialSave` is `true`; in both cases it
         alerts rather than failing silently (native-menu parity).

      `src/pages/__tests__/Editor.save.test.tsx` (create, jsdom) — **all 2,
      exhaustive:** `handleSave` delegates to `saveCurrentPresentation` (fact 9);
      a failed save still shows the `alertDialog` it shows today
      (characterization — must pass before and after the delegation).

      `src/utils/__tests__/requiresInitialSave.test.ts` (create) — **all 2,
      exhaustive:** `insertNewSlideIntoCurrentPresentation` leaves
      `requiresInitialSave` **true** on a brand-new presentation; and leaves it
      **false** on an existing one. Both fail under the old code (fact 11).

      `src/components/layout/__tests__/MenuBar.test.tsx` (jsdom) — **all 4,
      exhaustive:** the File menu contains `Revert to Last Save`; it is disabled
      with no presentation; disabled when `isDirty` is `false`; disabled when
      `requiresInitialSave` is `true` and enabled when dirty and saved before.

      *Verify:* `npx vitest run src/utils/__tests__/presentationVersions* electron/db/__tests__/versionQueries.test.ts` — must **FAIL** (modules absent). **Paste the failure output into the PR as proof.**

- [x] **2. Implement slice 1**: migration 5, `queries/versions.js`, the
      `deletePresentation` cascade, 4 contract rows + 4 handlers + 4 `ipc.ts`
      wrappers, `presentationVersions.ts`, `presentationVersionsSync.ts`, the 5
      capture sites, `revertCurrentPresentationToLastSave`, the
      `appCommands.js` case, and the two menu items.
      *Verify:* every todo-1 command passes.

- [x] **3. Rollup entry** `db/queries/versions` in `electron.vite.config.js`.
      Without it the packaged app crashes at startup **and the build still
      reports SUCCESS** (the A2 trap).
      *Verify:* `npm run build && ls out/db/queries/` shows `versions.js`.

- [x] **4. Migration expectations — 3 files, 8 sites, exhaustive.** All are
      **behaviour-change edits**: each fails under the old code (only 1–4
      recorded) and passes under the new. List every one in the summary.

      `e2e/migrations.spec.ts` — the fresh-install list, the legacy list, and the
      second-launch list. **The second-launch spec selects only `version`** and
      expects `[{version:1},…]`; append `{version:5}` there, **not** a
      `{version,name}` pair. Rename the fresh-install test, whose title says
      "records exactly migrations 1 through 4".

      `electron/db/__tests__/migrations.test.ts:48-49` — the expected array and
      the test name "is exactly versions 1, 2, 3, 4 and well-formed".

      `electron/db/__tests__/realSqlite.migrations.test.ts` — `:68`
      `result.applied`; `:70-76` the `schema_migrations` rows (add
      `{version:5,name:'presentation-versions'}`); `:80-88` the exact
      `tablesOf(db)` list (add `presentation_versions`, keeping the list's
      existing sort order); `:129` `COUNT(*)` `{n:4}` → `{n:5}`. The test name
      "applies exactly 1–4" changes too.
      *Verify:* `npx vitest run electron/db` is green.

- [x] **5. `e2e/revert.spec.ts`** — **all 5, exhaustive:**
      1. Blank presentation → `file:save` → `insert:newSlide` → File ▸ Revert to
         Last Save → confirm → the DB row's slide count is back to **1** and the
         editor shows 1 slide.
      2. Cancelling the confirm changes nothing — slide count stays **2**.
      3. `Revert to Last Save` is **disabled** immediately after a save (not dirty).
      4. `Revert to Last Save` is **disabled** on a never-saved presentation
         (`requiresInitialSave`).
      5. Two saves append **two** `presentation_versions` rows for that
         presentation, and a revert appends **none** (row count is stable across
         the revert).
      Drive the menu through the **in-app `MenuBar`**, not `app:command`: cases
      3 and 4 assert the item is *disabled*, which only the in-app menu exposes
      (Playwright cannot inspect a native macOS menu). Use
      `page.getByRole('button', { name: 'File', exact: true }).click()` then the
      item. Case 1's save/insert steps use the
      `webContents.send('app:command', …)` idiom from `recovery.spec.ts:54-56`.
      *Verify:* `npm run test:e2e` — **all** specs, run twice in a row.

- [x] **6. Prove the 52 baselines did not move.** The File menu is never
      captured open (fact 7) — this todo *checks* that rather than trusting it.

      **A bare local `VISUAL=1` run proves nothing about the committed
      baselines.** `playwright.config.ts:19-21` sends non-CI runs to the
      gitignored `{testDir}/.local-snapshots/`, never to the committed
      `*-snapshots/` directories. The only local proof is laptop-vs-laptop:
      ```
      git stash                                                    # base tree
      VISUAL=1 npx playwright test e2e/visual --update-snapshots    # local base
      git stash pop
      VISUAL=1 VISUAL_STRICT=1 npx playwright test e2e/visual       # must be 0 px
      ```
      Ethan is away (2026-09-09), so this pair of runs is sanctioned under
      standing rule 7 — **once, not in probes.** CI remains the verdict: the
      required `E2E (macOS)` check compares the real 52. If any committed
      baseline moves, that is a finding: report it, do not recapture.

- [x] **7. Raise coverage thresholds** in `vitest.config.mjs` to just below the
      new measured floor. Run `npx vitest run --coverage`, read the four
      numbers, set each threshold ≤ measured. **The ratchet only moves up.**
      Note: it is already ~2 points stale (measured 17.55/15.45/17.28/18.39),
      so it must rise even before this slice's tests are counted.

- [x] **8. Gate and PR.** `npm run gate` && `npm run format:check`; commit with
      **explicit paths** (never `git add -A`); PR body carries Summary / Proof /
      Findings. Wait for **both** `PR Gate` and `E2E (macOS)`. Squash-merge.

### Slice 2 — autosave

- [x] **9. Failing tests first (TDD — complete before todo 10).**

      `src/utils/__tests__/autosave.test.ts` — **all 4, exhaustive:**
      1. First change, never written → `AUTOSAVE_DEBOUNCE_MS`.
      2. Continuous changes, last write 9s ago → `<= 1000` (max wait caps it).
      3. Continuous changes, last write 10s+ ago → `0`.
      4. `AUTOSAVE_DEBOUNCE_MS < AUTOSAVE_MAX_WAIT_MS` (a self-enforcing
         sanity invariant).

      `src/utils/__tests__/autosaveSync.test.ts` (fake timers, fake ipc, store
      reset per `beforeEach`) — **all 9, exhaustive:**
      1. No write while the store is clean.
      2. One `updatePresentation` call `AUTOSAVE_DEBOUNCE_MS` after a dirty
         change, with the exact `(id, presentation)` arguments (`toEqual`).
      3. Rapid changes coalesce into **exactly one** write.
      4. **`isDirty` is still `true` after a write** — the load-bearing assertion
         of the whole design.
      5. `loadPresentationIntoEditor` / `setPresentation` are **never** called
         (call count `0`) — pitfall 1, asserted.
      6. `writeVersion` is **never** called by autosave (call count `0`) —
         versions are deliberate acts only.
      7. A change that leaves the content key unchanged writes **nothing**.
      8. `presentationId` change cancels the pending write (call count `0`).
      9. `cancelPendingAutosave()` prevents a scheduled write from landing.

      `src/utils/__tests__/unsavedChanges.test.ts` — **this file does not exist
      today and `unsavedChanges.js` has ZERO unit coverage**, so it lands in two
      stages within todo 9.

      *Stage A — characterization, must pass on unmodified `main` before any
      slice-2 source edit* (testing-standards item 10): Cancel returns `false`
      and writes nothing; Save calls `updatePresentation` then clears both
      flags; Save failure alerts and returns `false`; Discard with
      `requiresInitialSave` calls `deletePresentation`; Discard on an existing
      presentation calls **neither** `deletePresentation` nor any write. **5
      cases.** Commit these first and state that they passed unchanged on `main`.

      *Stage B — behaviour-change edits, all 4, exhaustive:* Save now also calls `captureVersion`; Discard on an
      existing presentation now calls `revertToLatestVersion` (and **not**
      `deletePresentation`); Discard on `requiresInitialSave` still calls
      `deletePresentation` (and **not** `revertToLatestVersion`); each of the
      three non-Cancel branches calls `cancelPendingAutosave` **before** its
      write — assert the call order, not merely that both happened.

      *Verify:* `npx vitest run src/utils/__tests__/autosave*` — must **FAIL**. Paste the output.

- [x] **10. Implement slice 2**: `autosave.ts`, `autosaveSync.ts`, the `App.jsx`
      start call (**main window only** — inside the existing branch guarded by
      `isOutputWindow || isStageDisplayWindow`), the `unsavedChanges.js`
      rewiring, and dirty-on-open in `openPresentationInEditor`.
      *Verify:* todo-9 commands pass.

- [x] **11. `e2e/autosave.spec.ts`** — **all 4, exhaustive:**
      Define `const AUTOSAVE_SETTLE_MS = 3_500;` at the top of the spec — greater
      than `AUTOSAVE_DEBOUNCE_MS` (2 s) with margin, mirroring
      `recovery.spec.ts`'s `JOURNAL_SETTLE_MS`.
      1. *Autosave reaches the row:* blank → `file:save` → `insert:newSlide` →
         wait `AUTOSAVE_SETTLE_MS` → the row's slide count is **2** while the
         app still reports unsaved (closing prompts). The `file:save` first is
         **required**: it clears `requiresInitialSave` so later cases take the
         revert branch rather than the delete branch.
      2. *Crash keeps the work:* same, then `crashApp` → relaunch the same
         profile → **no** recovery dialog appears → open the presentation → 2
         slides, and `Revert to Last Save` is **enabled** (it opened dirty).
      3. *Discard reverts the row:* `file:save` **first** (so
         `requiresInitialSave` is false and Discard reverts rather than
         deletes) → dirty → wait → row has 2 → close the window → Discard → the
         row is back to **1** slide.
      4. *Save commits a version:* dirty → wait → `file:save` → the newest
         `presentation_versions` snapshot's slide count is **2**, and Revert is
         disabled.
      Read the DB from outside with the `sqlite3` CLI, exactly as
      `e2e/recovery.spec.ts` already does.
      *Verify:* `npm run test:e2e` twice in a row.

- [x] **12. Baselines, thresholds, gate, PR** — repeat todos 6, 7 and 8 for this
      slice. **Slice 3 must be opened before this one merges.**

### Slice 3 — retire the journal writer

- [x] **13. Remove the writer** — the 9 symbols named in *The journal's fate*,
      and only those. **Do not drop the table. Do not touch migrations.**
      Delete the now-dead unit cases (3 in `recoveryJournal.test.ts`, the writer
      cases in `recoveryJournalSync.test.ts`, 1 in `journalQueries.test.ts`) —
      these are deletions of tests for **deleted code**, not weakened
      assertions; say so explicitly in the summary.
      *Verify, both required:*
      (a) `grep -rn 'writeJournal\|nextWriteDelayMs\|JOURNAL_DEBOUNCE_MS\|JOURNAL_MAX_WAIT_MS\|JOURNAL_EXEMPT\|startRecoveryJournalSync\|baseUpdatedAtOf' src electron shared e2e`
      returns **zero hits**. This is the real quantifier check —
      `no-unused-vars` does **not** flag unused *exported* bindings, so lint
      alone would let a leftover `export const JOURNAL_DEBOUNCE_MS` through.
      (b) `npx eslint . --max-warnings 0` is clean and `eslint-suppressions.json`
      is still `{}` (it does catch the now-unused imports and the local
      `baseUpdatedAtOf`).

- [x] **14. Rewrite `e2e/recovery.spec.ts`** — **behaviour-change edit, all 3,
      exhaustive:**
      1. Editing while dirty writes **no** `presentation_journal` row (the
         writer is gone) — the inverse of the spec it replaces.
      2. A journal row **seeded into the profile before launch** (via
         `prepareUserData`) is still offered on startup with actions exactly
         `['Later', 'Discard', 'Recover']`, and Recover loads it. This keeps
         `offerRecoveryOnStartup` covered and proves the legacy drain works.
      3. Discard on that seeded row deletes it.
      The suite's case count changes; state the old and new counts in the summary.

- [x] **15. Baselines, thresholds, gate, PR** — repeat todos 6, 7 and 8.

- [x] **16. Records, in the same PR as slice 3.** Update
      `tasks/fable-pass-plan.md` (a status row for A5), `tasks/fable-notes.md`
      (a dated narrative entry, newest at the bottom, including every opinion
      and correction found along the way), and tick this file's todos.
      Additionally update `CLAUDE.md`'s "Architectural Decisions" with the
      autosave/version model and remove the now-false journal line — **this is
      the one CLAUDE.md edit the plan authorises.**

- [ ] **17. Manual verification in a running window** (`npm run dev`) on macOS —
      **all 5, exhaustive:**
      1. Open a presentation, type into a slide, wait 3s, `kill -9` the app,
         relaunch, reopen → the typing is there and the document reads unsaved.
      2. `⌘S`, then File ▸ Revert to Last Save → the item is greyed out.
      3. Edit again → Revert is enabled → confirm → the edit is gone.
      4. Edit, then `⌘W` → Discard → reopen → the edit is gone from the row.
      5. New blank presentation → edit → `⌘W` → Discard → it is absent from
         Recent (the row was deleted, not reverted).

- [ ] **18. Final gate on `main`** and report:
      `gate: type-check ✓ · lint ✓ · vitest N/N passed (0 skipped)` plus E2E
      `passed/total` and the 52-capture result.

---

## Pitfall notes

1. **Autosave must never call `loadPresentationIntoEditor`.** It calls
   `setPresentation`, which resets `selectedSlideId` to the first slide and
   clears `past`/`future`. Routing autosave through the save helper would yank
   the user's cursor to slide 1 every two seconds and destroy undo history.
   Todo 9 case 5 asserts the call count is `0` — do not delete that assertion.
2. **Snapshot from the DB round trip, not from memory.** `captureVersion` takes
   the value `updatePresentation` / `getPresentation` returned, normalized by
   `normalizePresentation`. Snapshotting the in-memory object instead lets a
   serialization difference register as a permanent phantom "dirty".
3. **`updated_at` is not content.** `openPresentationInEditor` calls
   `touchPresentation` **before** loading, so `updated_at` differs on literally
   every open. A content key that included it would mark every document dirty
   the moment it opened.
4. **Cancel the pending autosave before any revert or delete.** A timer that
   fires afterwards writes the discarded edits back. Todo 9's `unsavedChanges`
   cases assert call **order**, not just presence.
5. **Order versions by `id`, never `saved_at`.** `unixepoch()` is
   second-resolution; two saves in one second tie.
6. **Zustand `subscribe` receives `(state, prevState)`.** Detect transitions
   from both; never infer one from a single state. The store is a **module
   singleton** — reset it in `beforeEach` or state leaks between tests.
7. **Fake timers:** `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()`
   in `afterEach`, and advance with `vi.advanceTimersByTimeAsync` because the
   write is awaited.
8. **Main window only.** `App.jsx` guards output and stage windows; autosave
   inside them would have three processes writing the same row.
9. **A fresh E2E profile is not empty.** Main seeds a sample presentation and
   the renderer seeds four hymns ~1s after load. Select rows by title
   (`'Untitled Presentation'`), never `LIMIT 1`, exactly as `recovery.spec.ts`
   does.
10. **E2E teardown is `app.exit(0)` + wait for exit**, never `app.close()`, and
    never `app.process()` after exit.
11. **Commitlint** rejects non-conventional types and sentence-case subjects.
    Headers over 100 chars warn only.
12. **Never `git add -A`.** One bad pathspec aborts the whole add and
    lint-staged then commits whatever was already staged.
13. **`src/main.jsx` renders under `React.StrictMode`**, so `App.jsx` effects
    mount → unmount → mount in dev. `startAutosave` must **replace** any
    controller already registered rather than assume it is the first, or the
    dev-mode double-mount leaves an orphaned timer.
14. **`electron/db/__tests__/` is not in the placement table**
    (`testing-standards.mdc` lists `electron/main/__tests__` for the IPC seam),
    but A2 already created it and four suites live there. Put the two new query
    tests beside their siblings; do not create a new directory, and note the
    table gap in the PR.
15. **Fetch before branching**, and rebase a stacked branch by SHA
    (`git rebase --onto origin/main <old-base-sha>`) after its base is squashed.

---

## Findings for Ethan — discovered while planning, NOT fixed here

Each was found by reading the code or by the two independent reviews of this
plan. None is caused by A5; all are recorded so they are not lost.

1. **`Editor.jsx:305` is a duplicate save path** that bypasses
   `saveCurrentPresentation`. Slice 1 makes it delegate, which is the minimal
   fix; the deeper question — why the editor has its own save at all — is a
   follow-up.
2. **`setPresentation` silently clears `requiresInitialSave`** (fact 11), so
   today, inserting a slide into a brand-new presentation and then choosing
   Discard leaves the unwanted presentation behind. Pre-existing bug, fixed in
   slice 1 because autosave makes it choose between two destructive branches.
3. **`default_background_id` is dead.** `normalizePresentation` hard-nulls it on
   every path (`backgrounds.js:33-34`), so every manual save already erases it —
   `CLAUDE.md`'s "older rows may not have `default_background_id` populated"
   known issue is caused by this, not by missing backfill. Autosave makes the
   erasure automatic rather than save-triggered. **Decision needed:** drop the
   column, or stop nulling it. Excluded from `CONTENT_FIELDS` meanwhile.
4. **`normalizePresentation` is non-deterministic for id-less content** — it
   mints `uuid()`s (`textBoxes.js:120,147`). Harmless today; under a
   content-key design it is a live hazard, which is why todo 1 case 9 exists.
5. **`case 'file:open'` navigates Home without `resolveUnsavedChanges`**
   (`appCommands.js:43-46`), unlike `file:close`. A dirty document can be
   abandoned with no prompt. Autosave mitigates the data loss (rule 7 flushes),
   but the missing guard is still wrong.
6. **Renaming or deleting from Home while the editor holds the same
   presentation.** Rename is handled (write path 6). Delete is only *contained*:
   rule 5 stops autosave when the row is gone. Properly clearing the editor
   store on navigation is a follow-up.
7. **`Save As…` abandons the source document's divergence.** In Word/Keynote the
   source stays at its last saved state; here it keeps whatever was autosaved.
   Recoverable in principle from its versions, but there is no UI. Follow-up.
8. **Song editing has no autosave and no journal.** `SongEditorModal.jsx:309`
   keeps its own local dirty flag over the separate `songs` table. **Explicitly
   out of scope for A5** — worth its own plan.
9. **`undo`/`redo` set `isDirty: true` unconditionally** (`editorStore.js:142,158`),
   so undoing back to the saved state still reads "Unsaved changes". Cosmetic.
10. **`⌘S` resets selection to slide 1 and clears undo history** (fact 3). A
    pre-existing annoyance that this plan makes more frequent by promoting `⌘S`
    to a routine gesture. Follow-up.

**Environmental note:** one review could not run `vitest` (`webidl.util.markAsUncloneable
is not a function`). That is Node 20; this repo requires Node 22 (`.nvmrc`).
`source ~/.nvm/nvm.sh && nvm use 22` first. The 308/308 gate result stands.

**Migration rollback** is free and should be stated in the PR:
`migrationRunner.ts:140-142` writes `presenterpro.backup-v4-<ts>.db` before
applying migration 5, so the upgrade is recoverable by restoring that file. The
new backup counts against the keep-3 prune.

---

## Required findings report (every PR body)

1. Gate results (`passed/total`) and E2E results, two consecutive runs.
2. The todo-1 / todo-9 failure output, proving tests were written first.
3. Every `VERSION_EXEMPT_PRESENTATION_IDS` entry — must be empty unless reported.
4. Every file changed outside this plan's blast-radius table, even if justified.
5. Every behaviour-change test edit, named: `migrations.spec.ts` (todo 4),
   `unsavedChanges.test.ts` (todo 9), `recovery.spec.ts` (todo 14), and the
   `deletePresentation` journal-cascade change (slice 1).
6. The 52-capture result. Any moved baseline is a finding, not a recapture.
7. Any suspected pre-existing regression discovered but NOT fixed.

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; `toEqual` on whole payloads and on the exact set of tables `deletePresentation` touches; dialog actions compared as the exact ordered array; call **order** asserted in todo 9 |
| List sampling designed against | Counted exhaustive lists throughout: familiarity mirrors 8, semantics 8 rows, version rules 5, **write paths 7**, subscription rules 9, revert steps 7, slice-1 unit cases 9+8+6+2+9+4+2+2 = **42**, slice-2 unit cases 4+9+5+4 = **22**, E2E 5+4+3, manual steps 5, slice-3 removals 14, migration edit sites 8. Counts were re-derived by an independent auditor, not by the author |
| Quantifier erosion designed against | Todo 1 case 1 iterates `CONTENT_FIELDS` and fails loudly when the list is empty; the query tests compare the whole set of tables touched; the ESLint `no-unused-vars` ratchet (todo 13) names any symbol left behind |
| Sanctioned escape hatch | `VERSION_EXEMPT_PRESENTATION_IDS`, initially empty, asserted empty by todo 1 and reported in every PR |
| Bounded blast radius | Three per-slice file tables (slice 1 now names the four existing test files migration 5 breaks, and slice 3 names `realSqlite.queries.test.ts`) plus a 13-entry do-not-touch list with two explicit carve-outs (`Editor.jsx` delegation, `TitleBar.jsx` two-line flag fix); an explicit STOP if a history UI starts appearing |
| File-specific pitfall notes | 15 notes, each naming a concrete file or mechanism |
| Exact paths, no improvisation | Every file named in full; "do not create test directories outside the placement table" |
| Per-todo verification | Every todo names its command |
| Snapshot policy inline | Todos 6/12/15: the 52 CI captures must not move; a moved baseline is a finding and is **never** recaptured to go green. Todo 6 spells out the stash/capture/compare pair, because a bare local `VISUAL=1` run writes to `.local-snapshots` and proves nothing (`playwright.config.ts:19-21`); CI is the verdict |
| Preconditions for conditional UI | `Revert to Last Save` is gated on `presentation && isDirty && !requiresInitialSave`; todo 5 seeds each of those states explicitly rather than concluding the control is absent |
| Structural floor under snapshots | Todo 5 pairs each revert assertion with a slide **count** and a version **row count** read from SQLite, so an empty or garbage DB cannot pass |
| IPC contract pinning | 4 channels named with their exact `INVOKE_METHODS` keys and payloads; the existing `ipcChannels.test.ts` + `assertComplete()` enforce contract/main/preload/renderer agreement on all four sides |
| Manual verification steps | Todo 17 — 5 exact click-paths in `npm run dev`, macOS, including a real `kill -9` |
| Required findings report | 7-item report, required in every PR body |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 before 2; todo 9 before 10; failure output pasted as proof in both |
| 2 | Behavior-change test edits | Todos 4, 9, 14 and the slice-1 cascade — each stated as failing-old / passing-new and listed in findings item 5 |
| 3 | No weakened assertions | Clause verbatim; exact `toEqual` comparisons mandated; order and count declared per comparison; todo 13's deletions are of tests for deleted code, stated explicitly |
| 4 | Coverage floor | **64** unit cases + 12 E2E cases across **5** new source modules; at least one case per new exported function. `unsavedChanges.js` goes from 0 % to covered |
| 5 | Lint floor | No `.only` / `.skip` / assertion-free tests / `expect` in `if`-`catch`; todo 13 keeps `eslint . --max-warnings 0` clean and the suppressions file `{}` |
| 6 | Snapshot discipline | No test snapshots. The 52 **screenshot** baselines are covered by todos 6/12/15: never refreshed to pass, any movement reported as a finding |
| 7 | Completion gate | Todos 8, 12, 15, 18 — `npm run gate` with `type-check` / `lint` / `passed/total` and skipped counts |
| 8 | Vitest / jsdom mechanics | Store reset in `beforeEach`; fake timers with `afterEach` restore and `advanceTimersByTimeAsync`; `@/utils/ipc` mocked, never `electron`; `better-sqlite3` never loaded — queries tested against a fake db; `MenuBar.test.tsx` carries `@vitest-environment jsdom` + `@testing-library/jest-dom/vitest` |
| 9 | Test placement | `src/utils/__tests__`, `src/components/layout/__tests__`, `src/pages/__tests__`, `e2e/` are from the placement table. `electron/db/__tests__` is **not** in that table (it lists `electron/main/__tests__` for the IPC seam) but was created by A2 and holds four suites; the two new query tests join them rather than starting a directory — pitfall 14, and flagged in the PR |
| 10 | Characterization before refactor | Todo 9 **stage A** pins `unsavedChanges.js`'s current behaviour (5 cases) and must pass unchanged on `main` before stage B rewrites Discard; `Editor.save.test.tsx` pins the failed-save alert before `handleSave` is redirected. Slice 3 deletes code outright rather than reshaping it |
