# Executable Plan A2 — Crash-Recovery Journal

**Workstream:** A (Data safety) · **Depends on:** A1 (merged, #29)
**Decision (Ethan, 2026-09-06):** journal first. Save keeps its meaning; autosave
waits for persistent undo history.
**Executor:** follow this literally. If something is unclear or blocked, STOP and
report — do not improvise.

Written per `.cursor/rules/writing-executable-plans.mdc`. Ends with a complete
Compliance Manifest.

---

## What this delivers

A volunteer building a service order loses everything to one crash. After
this plan: while a presentation has unsaved edits, the app continuously writes
a **journal** snapshot to SQLite; on the next launch after a crash it asks
**"Recover unsaved work for 'Sunday Morning'?" — [Later] [Discard] [Recover]**. Save
still means save; nothing is written to the real record without the user.

Facts this design rests on (verified in code, 2026-09-06):

- Every presentation in the editor already has a database row — `createNewPresentation`
  inserts it before the editor opens (`presentationCommands.js:105`). So the
  journal only has to cover *dirty edits*, never a presentation with no id.
- `isDirty` is set by the store's edit actions; `saveCurrentPresentation()`
  calls `updatePresentation` then `setDirty(false)`; discard on a new
  presentation deletes the row.
- The renderer talks to main only through `src/utils/ipc.js` (envelope
  `{ success, data, error }`); preload exposes one wrapper per channel.
- A1's runner is live: adding a table is now **migration 2**, a real use of it.

## Anti-weakening clause (verbatim, non-negotiable)

> If an assertion fails, the bug is elsewhere — never loosen the assertion to
> pass. Fix the root cause or record it as a suspected regression.

## Bounded blast radius

**You may create or modify only these files:**

| File | Action |
|---|---|
| `presenter-pro/electron/db/migrations.js` | modify — append migration 2 only |
| `presenter-pro/electron/db/queries/journal.js` | create |
| `presenter-pro/electron/db/__tests__/journalQueries.test.ts` | create |
| `presenter-pro/electron/main/index.js` | modify — add 3 `ipcMain.handle` blocks beside the presentations handlers; nothing else |
| `presenter-pro/electron/main/__tests__/ipcChannels.test.ts` | create (drift guard) |
| `presenter-pro/electron/preload/index.js` | modify — add 3 wrappers |
| `presenter-pro/electron.vite.config.js` | modify — add `db/queries/journal` entry |
| `presenter-pro/src/utils/ipc.js` | modify — add 3 wrappers |
| `presenter-pro/src/utils/recoveryJournal.ts` | create (pure policy) |
| `presenter-pro/src/utils/recoveryJournalSync.ts` | create (store subscription + startup prompt) |
| `presenter-pro/src/utils/__tests__/recoveryJournal.test.ts` | create |
| `presenter-pro/src/utils/__tests__/recoveryJournalSync.test.ts` | create |
| `presenter-pro/src/App.jsx` | modify — one startup call in the main-window branch |
| `presenter-pro/e2e/recovery.spec.ts` | create |
| `presenter-pro/e2e/migrations.spec.ts` | modify — expected migration list becomes `[1, 2]` (behaviour-change edit, see manifest) |
| `presenter-pro/e2e/fixtures/launchApp.ts` | modify — add `crashApp()` |
| `presenter-pro/vitest.config.mjs` | modify — raise thresholds only |
| `tasks/phase7-remediation.md` | modify — record outcome |

**Do NOT modify:** `editorStore.js` (subscribe to it; do not change it),
`presentationCommands.js`, `unsavedChanges.js`, `Dialog.jsx`, `Home.jsx`,
any other existing test, `eslint-suppressions.json` (unless pruning becomes
necessary — then report it).

Do not create new test directories beyond those named above.

---

## Design

### Storage — migration 2

```sql
CREATE TABLE IF NOT EXISTS presentation_journal (
  presentation_id INTEGER PRIMARY KEY,
  snapshot        TEXT    NOT NULL,   -- JSON of the in-memory presentation
  saved_at        INTEGER NOT NULL,   -- unix seconds, when the journal was written
  base_updated_at INTEGER             -- presentations.updated_at the snapshot was based on
)
```

One row per presentation: the latest snapshot. Appended to `MIGRATIONS` as
`{ version: 2, name: 'presentation-journal', up }` using `CREATE TABLE IF NOT
EXISTS` (idempotent by inspection, like migration 1). **Never edit migration 1.**

### `queries/journal.js` — CJS, mirrors `queries/presentations.js`

```js
writeJournal(db, { presentationId, snapshot, baseUpdatedAt })  // upsert
listJournals(db)        // [{ presentation_id, saved_at, base_updated_at, snapshot }]
deleteJournal(db, presentationId)
```

### IPC — three channels, envelope preserved

| Channel | Preload wrapper | Renderer wrapper |
|---|---|---|
| `db:journal:write` | `writeJournal(data)` | `writeJournal(data)` |
| `db:journal:list` | `listJournals()` | `listJournals()` |
| `db:journal:delete` | `deleteJournal(id)` | `deleteJournal(id)` |

Handlers follow the exact style of `db:presentations:update` (try / envelope /
catch → `{ success: false, error }`).

### `recoveryJournal.ts` — pure policy, fully tested

```ts
export interface JournalRow { presentation_id: number; saved_at: number; base_updated_at: number | null; snapshot: string }
export interface PresentationRow { id: number; title: string; updated_at: number }

/** Journals that may be offered for recovery, with a reason for every rejection. */
export function selectRecoverable(journals: JournalRow[], presentations: PresentationRow[]):
  { recoverable: Array<{ journal: JournalRow; presentation: PresentationRow }>;
    stale: Array<{ journal: JournalRow; reason: 'presentation-missing' | 'saved-since' }> };

/** Trailing debounce with a max wait: returns the delay before the next write. */
export function nextWriteDelayMs(input: { now: number; lastChangeAt: number; lastWriteAt: number | null }): number;
export const JOURNAL_DEBOUNCE_MS = 2_000;
export const JOURNAL_MAX_WAIT_MS = 10_000;
```

Rules — **all 4, exhaustive**:
1. A journal whose presentation no longer exists is stale (`presentation-missing`).
2. A journal whose `base_updated_at` differs from the presentation's current
   `updated_at` is stale (`saved-since`) — the user saved after the snapshot.
3. Otherwise it is recoverable.
4. Write delay is `JOURNAL_DEBOUNCE_MS` after the last change, but never later
   than `JOURNAL_MAX_WAIT_MS` after the last write while changes continue.

### `recoveryJournalSync.ts` — the wiring

```ts
export function startRecoveryJournalSync(deps?): () => void   // returns stop()
export async function offerRecoveryOnStartup(deps?): Promise<void>
```

- Subscribes to `useEditorStore` (`subscribe` is Zustand's; **do not modify the
  store**). On a change where `isDirty && presentation`, schedule a write per
  `nextWriteDelayMs`. When `isDirty` goes `true → false` (save or discard),
  cancel any pending write and `deleteJournal(presentationId)`. When
  `presentationId` changes, cancel pending writes for the old one.
- A write sends `{ presentationId, snapshot: JSON.stringify(presentation),
  baseUpdatedAt: presentation.updated_at ?? null }`.
- `offerRecoveryOnStartup`: `listJournals()` + `getPresentations()` →
  `selectRecoverable`. Delete every stale journal silently. For each
  recoverable one (in practice one), `showDialog` with title
  `Recover Unsaved Work`, description naming the presentation title, actions
  exactly `[Discard, Recover]` with Recover primary. **Recover** →
  `loadPresentationIntoEditor(JSON.parse(snapshot))`, then `setDirty(true)`
  and `setRequiresInitialSave(false)`; the journal row is **kept** until the
  user saves (a second crash must still be recoverable). **Discard** →
  `deleteJournal`.
- `deps` are injectable (ipc functions, dialog, store, `now`) so the unit tests
  use fakes. Defaults wire the real modules.
- Runs in the **main window only** — call it from `App.jsx` inside the existing
  main-window startup effect (the one already guarded by
  `isPresenterWindow || isOutputWindow || isStageDisplayWindow`).

### Sanctioned escape hatch

Exactly one, initially empty, in `recoveryJournalSync.ts`:

```ts
/**
 * Presentation ids never journaled. Every entry REQUIRES a justifying comment
 * and must be reported. Do not add entries to make something pass.
 */
export const JOURNAL_EXEMPT_PRESENTATION_IDS: ReadonlyArray<number> = [];
```

---

## Todos

- [x] **1. Failing tests first (TDD — complete before todo 2).** Three unit files:

      `src/utils/__tests__/recoveryJournal.test.ts` — **all 7, exhaustive:**
      1. `selectRecoverable`: journal with no matching presentation → stale `presentation-missing`
      2. `base_updated_at` ≠ `updated_at` → stale `saved-since`
      3. matching and equal → recoverable, paired with its presentation
      4. mixed input → recoverable and stale partitions are exact (`toEqual` on both arrays; count and order matter)
      5. `nextWriteDelayMs`: first change, never written → `JOURNAL_DEBOUNCE_MS`
      6. continuous changes, last write 9s ago → `≤ 1000` (max-wait caps it)
      7. continuous changes, last write 10s+ ago → `0` (write now)

      `src/utils/__tests__/recoveryJournalSync.test.ts` (fake timers, fake ipc,
      real store reset per `writing-tests.mdc` B) — **all 6, exhaustive:**
      1. no write while the store is clean
      2. one write `JOURNAL_DEBOUNCE_MS` after a dirty change, with the exact payload (`toEqual`)
      3. rapid changes coalesce into one write
      4. `isDirty` true → false cancels a pending write and calls `deleteJournal(id)` exactly once
      5. `offerRecoveryOnStartup` deletes stale journals without prompting
      6. Recover loads the snapshot, marks dirty, keeps the journal; Discard deletes it — assert both, with the dialog's action list exactly `['Discard', 'Recover']`

      `electron/db/__tests__/journalQueries.test.ts` (fake db, like
      `migrationRunner.test.ts`) — **all 3, exhaustive:** write is an upsert
      (`INSERT ... ON CONFLICT(presentation_id) DO UPDATE`), list returns rows,
      delete targets the id.

      `electron/main/__tests__/ipcChannels.test.ts` — the drift guard the
      IPC-pinning rule requires: parse every `ipcMain.handle('…')` /
      `ipcMain.on('…')` in `electron/main/index.js` and every
      `ipcRenderer.invoke('…')` / `.send('…')` in `electron/preload/index.js`;
      assert the two **sets are equal** (`toEqual` on sorted arrays, so a
      channel present on only one side names itself). This locks in today's
      zero-drift state and covers the three new channels.

      *Verify:* `npx vitest run src/utils/__tests__/recoveryJournal* electron/db/__tests__/journalQueries.test.ts electron/main/__tests__/ipcChannels.test.ts` — must FAIL (modules absent). Paste the failure output as proof.

- [x] **2. Implement** `recoveryJournal.ts`, `recoveryJournalSync.ts`,
      `queries/journal.js`, migration 2, the three IPC handlers, the preload
      and `ipc.js` wrappers, and the `App.jsx` startup call.
      *Verify:* the todo-1 command passes, all suites.

- [x] **3. Rollup entry** `db/queries/journal` in `electron.vite.config.js`
      (CommonJS main leaves the relative `require` external — without this the
      packaged app crashes at startup and the build still reports SUCCESS).
      *Verify:* `npm run build && ls out/db/queries/` shows `journal.js`.

- [x] **4. Update `e2e/migrations.spec.ts`**: every expected
      `schema_migrations` list becomes `[{1,'baseline-schema'},{2,'presentation-journal'}]`
      (fresh, legacy, second-launch specs). This is a **behaviour-change test
      edit**: it fails under the old code (only v1 recorded) and passes under
      the new. Say so in the summary.

- [x] **5. Add `crashApp(launched)` to the fixture** — SIGKILL + wait for exit,
      profile kept. This is the one legitimate use of SIGKILL: simulating a
      crash. Then write `e2e/recovery.spec.ts` — **all 3, exhaustive:**
      1. *Crash then Recover:* launch → Blank Presentation → dismiss tutorial →
         make it dirty by sending the app command
         `insert:newSlide` to the window (`webContents.send('app:command', …)`
         via `app.evaluate`) → wait `> JOURNAL_DEBOUNCE_MS` → assert one
         `presentation_journal` row (sqlite3) → `crashApp` → relaunch same
         profile → dialog `Recover Unsaved Work` with buttons exactly
         `['Discard', 'Recover']` → click Recover → editor is showing and the
         journal row **still exists** → send `file:save` → journal row gone and
         the saved `sections` JSON contains 2 slides.
      2. *Crash then Discard:* same until the dialog → Discard → journal row
         gone, saved `sections` still has 1 slide.
      3. *Clean save leaves no journal:* dirty → wait → row exists → `file:save`
         → row gone; relaunch → no dialog.
      *Verify:* `npm run test:e2e` — all specs, run **twice** in a row.

- [x] **6. Record the outcome** in `tasks/phase7-remediation.md` (data-safety
      item) and add the journal to `CLAUDE.md`'s "Architectural Decisions" is
      **not** in scope — leave `CLAUDE.md` alone; note it in the summary for
      the Architect.

- [x] **7. Raise coverage thresholds** to just below the new measured floor.

- [x] **8. Run the completion gate and report.** `npm run gate` — report
      `type-check`, `lint`, vitest `passed/total`; then E2E `passed/total`.

---

## Pitfall notes

- **Do not journal on `requiresInitialSave` alone.** A blank presentation with
  no edits already exists in the database; journaling it is noise and the
  recovery prompt would fire for nothing.
- **Zustand `subscribe` receives `(state, prevState)`.** Detect the
  `true → false` dirty transition from both; never infer it from a single
  state.
- **Fake timers:** `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()`
  in `afterEach`; advance with `vi.advanceTimersByTimeAsync` because the
  write is `await`ed.
- **`webContents.send` from `app.evaluate`:** the E2E dirties the document via
  the same `app:command` channel the native menu uses — no canvas typing.
- **The recovery dialog must not appear in the output/stage windows.** Call
  the startup offer only inside the main-window branch of `App.jsx`.
- **Migration list well-formedness is tested** — appending version 2 after 1
  is the only valid shape.

## Required findings report

1. Gate results (`passed/total`) and E2E results (two consecutive runs)
2. Todo-1 failure output, proving tests were written first
3. Every `JOURNAL_EXEMPT_PRESENTATION_IDS` entry — must be empty unless reported
4. Every file changed outside the blast radius, even if justified
5. The behaviour-change test edits (todo 4), stated explicitly
6. Any suspected pre-existing regression discovered but NOT fixed

---

## Compliance Manifest

### `writing-executable-plans.mdc`

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; `toEqual` on whole partitions/lists; dialog actions compared as the exact ordered array |
| List sampling designed against | Counted exhaustive lists: policy rules 4, unit cases 7 + 6 + 3, E2E specs 3, channels 3 |
| Quantifier erosion designed against | The IPC drift guard compares whole channel *sets*; partitions assert both arrays, not one |
| Sanctioned escape hatch | `JOURNAL_EXEMPT_PRESENTATION_IDS`, initially empty, entries reported |
| Bounded blast radius | 18-file table with an explicit do-not-touch list (the store is subscribed to, not edited) |
| File-specific pitfall notes | `requiresInitialSave` trap; `subscribe(state, prev)`; fake-timer mechanics; `webContents.send` for E2E; window gating; migration ordering |
| Exact paths, no improvisation | Every file named in full |
| Per-todo verification | Each todo names its command |
| Snapshot policy inline | `N/A — no test snapshots` |
| Preconditions for conditional UI | The recovery dialog requires a journal row whose `base_updated_at` matches; E2E seeds that state by crashing a dirty app |
| Structural floor under snapshots | `N/A — no test snapshots` |
| IPC contract pinning | Three channels named; `ipcChannels.test.ts` asserts main and preload sets are equal |
| Manual verification steps | E2E specs 1–3 are the click-paths; additionally the Architect should crash the app mid-edit once by hand (`kill -9`) and confirm the prompt |
| Required findings report | Six-item report specified above |

### `testing-standards.mdc` — all 10 items

| # | Item | Disposition |
|---|---|---|
| 1 | TDD ordering | Todo 1 (fail) strictly precedes todo 2; failure output required |
| 2 | Behavior-change test edits | Todo 4: `migrations.spec.ts` expected list `[1]` → `[1, 2]`, stated as failing-old / passing-new |
| 3 | No weakened assertions | Clause verbatim; exact lists mandated |
| 4 | Coverage floor | 16 unit cases + 3 E2E + drift guard across 5 new modules |
| 5 | Lint floor | No `.only`/`.skip`/assertion-free/conditional-expect |
| 6 | Snapshot discipline | `N/A — no test snapshots` |
| 7 | Completion gate | Todo 8 |
| 8 | Vitest/jsdom mechanics | Store reset per test (skeleton B); fake timers with `afterEach` restore; `@/utils/ipc` mocked, never `electron`; queries tested via fake db |
| 9 | Test placement | `src/utils/__tests__`, `electron/db/__tests__`, `electron/main/__tests__`, `e2e/` per the table |
| 10 | Characterization before refactor | `N/A — nothing existing is refactored; the store is subscribed to, unchanged` |
