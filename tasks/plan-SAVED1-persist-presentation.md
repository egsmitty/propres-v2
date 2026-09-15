# Executable Plan SAVED1 — one row writer: `persistPresentation`

**Audit item:** SAVE-D1 · P2 · [F] — "Eight separate row writers with different
rules (normalize before/after, `data:null`, capture check, store sync). One
`persistPresentation(id, doc, {commit})`." Independent of D6 (the save-model
decision): whichever way D6 goes, one writer is fewer places for it to change.

Written per `.cursor/rules/writing-executable-plans.mdc`. Branch base `main` @
`8e34fca`. One PR.

---

## Measured (read on 2026-09-14, `main` @ `8e34fca`)

Nine call sites write a `presentations` row through the IPC wrapper. Three are
**creates** (`createPresentation`): new (`presentationCommands.js:147`),
template (`:212`), Save As (`:311`) — each followed by
`openPresentationInEditor`, which normalizes and derives the dirty flag. They
are one verb with one rule and are **out of scope**. Six are **updates**
(`updatePresentation`), and each applies its own subset of the same five
rules:

| #   | Site                                                                 | Rejected IPC call           | `!success`                                        | `data == null`                                             | Normalize after                                                             | Capture (commit)                                                                                         | Store sync                                                                                                          |
| --- | -------------------------------------------------------------------- | --------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Save — `saveCurrentPresentation` (`presentationCommands.js:223-262`) | unhandled (would reject)    | alert "Save Failed", return `{success:false}`     | alert "no longer exists"                                   | via `syncSavedPresentation` (store) or `normalizePresentation(result.data)` | yes; failure → alert "Restore Point Not Saved"                                                           | S2 rule: sync only if the store still holds the object sent, else `setRequiresInitialSave(false)`, `setDirty(true)` |
| 2   | Gate save — `resolveUnsavedChanges` (`unsavedChanges.js:64-92`)      | unhandled                   | `success === false` → alert                       | alert "no longer exists"                                   | `normalizePresentation(saveResult.data)` for the capture only               | yes; failure → alert, return false                                                                       | `setDirty(false)`, `setRequiresInitialSave(false)`                                                                  |
| 3   | Rename from Home — `renamePresentationById` (`:588-606`)             | unhandled                   | returns the envelope, no alert                    | not checked (`result.data` truthy guards the capture only) | `normalizePresentation(result.data)` for the capture                        | yes; failure → alert "Restore Point Not Saved"                                                           | none (editor store untouched)                                                                                       |
| 4   | Autosave — `write` (`autosaveSync.ts:105-156`)                       | caught → treated as failure | failure count + threshold alert; key NOT recorded | stop + alert "Presentation Deleted"                        | none (row content not read back)                                            | **never** — autosave does not commit                                                                     | none; `lastWrittenKey`                                                                                              |
| 5   | Restore — `restoreVersion` (`presentationVersionsSync.ts:135-197`)   | unhandled                   | alert "Restore Failed"                            | `!result.data` → same alert                                | `normalizePresentation(result.data)`                                        | capture **before** (current) and **after** (normalized); after-failure → alert "Restore Point Not Saved" | `applyRestored` (setPresentation, select first slide, clean flags, navigate)                                        |
| 6   | Revert — `revertToLatestVersion` (`:207-270`)                        | unhandled                   | alert "Revert Failed"                             | same alert                                                 | `normalizePresentation(result.data)`                                        | capture before (unless Discard) and after                                                                | `applyRestored`                                                                                                     |

Other facts the design depends on:

- **`captureVersion`** (`presentationVersionsSync.ts:83-107`) is already the
  single version writer: exempt ids, no-op when the newest snapshot is
  identical, `result?.success === true` only (D1). Every "commit" above is a
  call to it with a normalized document.
- **The four failure messages are pinned** by `presentationCommands.saveErrors.test.ts`,
  `presentationCommands.saveRaces.test.ts`, `unsavedChanges.captureFailure.test.ts`,
  `unsavedChanges.freshState.test.ts`, `autosaveSync.failures.test.ts`,
  `presentationVersionsSync.captureResult.test.ts`, `presentationVersionsSync.test.ts`
  and `presentationCommands.deleteLive.test.ts` (15 files touch these paths).
  They must pass **unchanged**: the caller-specific dialogs and store effects
  are behaviour the users see and the tests describe.
- **Dependency injection:** `autosaveSync` and `presentationVersionsSync` take
  `deps.updatePresentation` (tests inject fakes); `presentationCommands` and
  `unsavedChanges` import the wrapper directly and tests `vi.mock('@/utils/ipc')`.
- **`normalizePresentation`** (`backgrounds.js:10`) is idempotent and cheap;
  the store's `setPresentation`/`syncSavedPresentation` apply it again.
- No site normalizes **before** writing: the store's document is already
  normalized on every path that sets it, and the version snapshots are stored
  normalized. So "normalize before/after" in the audit is really "after,
  sometimes, for the capture" — the inconsistency is whether the _caller_ sees
  a normalized document back.

## Decisions

1. **One writer, `src/utils/persistPresentation.ts`:**
   `persistPresentation(id, document, { commit = false, deps })` →
   `{ ok: true, presentation, committed }` | `{ ok: false, reason: 'failed' | 'missing', error }`.
   It owns the five rules exactly once: a rejected IPC call becomes
   `failed`; `!success` → `failed` with the envelope's error (or a default);
   `data == null` → `missing`; the returned row is normalized once; with
   `commit`, `captureVersion(normalized)` runs and its boolean is `committed`.
   `deps` defaults to the real wrapper and `captureVersion`; injectable for
   the two modules that already inject.
2. **Callers keep their dialogs and their store effects.** The messages,
   their titles and the store transitions are what the 15 test files pin and
   what the user sees; they differ _on purpose_ (Save syncs the store only if
   nothing was typed meanwhile — S2; the gate returns `false` on a failed
   capture; autosave counts failures and never commits; restore/revert
   replace the document). This plan removes the duplicated _mechanics_, not
   the _policies_. The audit's "one writer" is satisfied mechanically: after
   this plan `updatePresentation(` is called from exactly one file under
   `src/` (Decision 4).
3. **Every existing test passes unchanged.** This is a refactor with a
   characterization suite already in place (15 files); no assertion moves.
   The new writer gets its own unit suite (Todo 1). If any existing test goes
   red, the extraction is wrong — fix the extraction, never the test.
4. **Mechanical proof of "one writer":** a source-text test asserts the set
   of files under `src/` (excluding `__tests__`) containing `updatePresentation(`
   is exactly `['src/utils/ipc.ts', 'src/utils/persistPresentation.ts']`, and
   that `deps.updatePresentation` appears in none of the six former sites.
5. **Not in scope:** the three creates; `captureVersion` itself; D6; any
   dialog copy; `openPresentationInEditor`; the store. No IPC channel changes.
   No rows or snapshots are rewritten — every write is the same write.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

Every comparison is exact: outcomes compared as whole objects with `toEqual`;
the file set compared as a sorted array with its length.

## Blast radius

**May change:** `src/utils/persistPresentation.ts` (new),
`src/utils/__tests__/persistPresentation.test.ts` (new),
`src/utils/__tests__/persistPresentation.oneWriter.test.ts` (new, source-text),
`src/utils/presentationCommands.js` (sites 1 and 3 only),
`src/utils/unsavedChanges.js` (site 2 only), `src/utils/autosaveSync.ts`
(site 4 only; `AutosaveDeps.updatePresentation` becomes `persist`),
`src/utils/presentationVersionsSync.ts` (sites 5 and 6 only;
`VersionDeps.updatePresentation` becomes `persist`), and — only because those
two modules' tests inject the dependency by name — the injected fakes in
`autosaveSync*.test.ts` and `presentationVersionsSync*.test.ts` are renamed
from `updatePresentation` to `persist` with **identical behaviour and no
assertion changed** (Todo 5 states the rule). This plan, the charter row, the
notes entry.

**May not change:** any dialog message or title; any store action; `ipc.ts`;
`captureVersion`; `openPresentationInEditor`; the three creates; any
assertion in the 15 pinned test files; any E2E spec.

## Todos

- [ ] 1. **Writer characterization (red).** `src/utils/__tests__/persistPresentation.test.ts`
      against a stub module exporting `persistPresentation` that returns
      `{ ok: false, reason: 'failed', error: '' }` (so the red is on assertions).
      This table is exhaustive — all 8, each asserting the **whole** outcome
      object with `toEqual` and the exact calls made:
  1. the wrapper rejects → `{ ok: false, reason: 'failed', error: <message> }`; `captureVersion` not called.
  2. `{ success: false, error: 'boom' }` → `{ ok: false, reason: 'failed', error: 'boom' }`.
  3. `{ success: false }` (no error) → `error: 'Failed to save your presentation.'`.
  4. `null` envelope → `failed` with the default error.
  5. `{ success: true, data: null }` → `{ ok: false, reason: 'missing', error: 'This presentation no longer exists, so it could not be saved.' }`.
  6. `{ success: true, data: row }` without `commit` → `{ ok: true, presentation: normalizePresentation(row), committed: false }`; `captureVersion` not called.
  7. with `commit: true` and `captureVersion` → `true`: `committed: true`, and `captureVersion` was called once with **exactly** the normalized row.
  8. with `commit: true` and `captureVersion` → `false`: `{ ok: true, …, committed: false }` (the row is written; the caller decides what to say).
     Verify: `npx vitest run src/utils/__tests__/persistPresentation.test.ts`.
- [ ] 2. Write `persistPresentation.ts` (Decision 1). Green on Todo 1.
- [ ] 3. **One-writer guard (red).** `persistPresentation.oneWriter.test.ts`:
      walk `src/` (skip `__tests__`), collect files containing `updatePresentation(`,
      assert the sorted list equals `['src/utils/ipc.ts', 'src/utils/persistPresentation.ts']`
      (length 2). Red now: six more files match.
- [ ] 4. Move site 1 (Save) and site 3 (Rename) onto the writer. Save:
      `const outcome = await persistPresentation(id, presentation, { commit: false })`;
      its `failed`/`missing` branches raise the **same** two alerts and return the
      same shapes; then the S2 branch decides sync vs. keep-newer, and the capture
      runs as today (`commit` is not used here because the capture's input depends
      on the S2 branch — that policy stays in the caller). Rename: `commit: true`,
      alert on `committed === false` as today. Verify:
      `npx vitest run src/utils/__tests__/presentationCommands` — all green,
      unchanged.
- [ ] 5. Move site 2 (gate save) with `commit: true`; sites 5 and 6 (restore,
      revert) with `commit: false` (their two captures bracket the write and stay
      where they are); site 4 (autosave) with `commit: false`. `AutosaveDeps` and
      `VersionDeps` replace `updatePresentation` with `persist` (same signature
      family: `(id, doc, options) => Promise<PersistOutcome>`); the tests that
      inject `updatePresentation` fakes now inject `persist` fakes returning the
      equivalent outcome — a dependency rename, stated in the commit, with no
      assertion changed. Verify: `npx vitest run src/utils/__tests__/autosaveSync src/utils/__tests__/presentationVersionsSync src/utils/__tests__/unsavedChanges`.
- [ ] 6. Todo 3 green. `npm run gate` (report type-check, lint, passed/total,
      skipped); `npm run format:check`. No baseline is affected.
- [ ] 7. Findings report in the PR body: suspected regressions; the
      dependency renames; anything the six sites did that the writer does not
      (there should be nothing). **Manual check owed** (not run — no app launches
      while Ethan is at the machine): ⌘S with a typed edit in flight still keeps
      the newer text (S2); Discard on a never-saved presentation still deletes it;
      Restore from Version History still works and is undoable.

## Compliance Manifest

### writing-executable-plans.mdc (15 items)

| Item                                          | Disposition                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion weakening designed against          | Clause verbatim; whole-object `toEqual` in Todo 1; exact file list with length in Todo 3                                                                        |
| List sampling designed against                | Todo 1 "all 8"; Todo 3 asserts the array and its length; the site table numbers all six                                                                         |
| Quantifier erosion designed against           | "One writer" is a source-walk over every file under `src/` (Todo 3), not a claim                                                                                |
| Sanctioned escape hatch                       | None — the allowed-files list in Todo 3 is the exact expected set, not an exemption list                                                                        |
| Bounded blast radius                          | Blast radius section, six sites named by line, a may-not-change list                                                                                            |
| File-specific pitfall notes                   | Measured: two modules inject `updatePresentation` by name (Todo 5); Save's capture input depends on the S2 branch (Todo 4); autosave must never commit (Todo 5) |
| Exact paths                                   | Blast radius; no new test directories                                                                                                                           |
| Per-todo verification                         | Todos 1, 3, 4, 5 name their vitest command; gate at Todo 6                                                                                                      |
| Snapshot policy inline                        | N/A — no snapshots or baselines are touched                                                                                                                     |
| Preconditions for conditional UI              | N/A — no UI; the writer is pure over an injected wrapper                                                                                                        |
| Structural floor under every snapshot         | N/A — no snapshots                                                                                                                                              |
| IPC contract pinning                          | N/A — no channel changes; the wrapper is the same call                                                                                                          |
| Manual verification steps                     | Todo 7 (owed, not run)                                                                                                                                          |
| Required findings report                      | Todo 7                                                                                                                                                          |
| Data rewrites state their backup and rollback | N/A — every write is the same write; no row or snapshot is rewritten                                                                                            |

### testing-standards.mdc (10 items)

| #   | Item                             | Disposition                                                                                                                                  |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TDD ordering                     | Todos 1→2, 3→(4,5,6)                                                                                                                         |
| 2   | Behavior-change test edits       | None. Todo 5's fake renames (`updatePresentation` → `persist`) are dependency-name edits with identical behaviour, named in the commit       |
| 3   | No weakened assertions           | Clause verbatim; whole-object `toEqual`; exact list                                                                                          |
| 4   | Coverage floor                   | Todo 1 covers every branch of the writer (8 cases)                                                                                           |
| 5   | Lint floor                       | No `.only`/`.skip`; `eslint --max-warnings 0` in the gate                                                                                    |
| 6   | Snapshot discipline              | N/A — no snapshots                                                                                                                           |
| 7   | Completion gate                  | Todo 6                                                                                                                                       |
| 8   | Vitest / jsdom mechanics         | Node environment for the writer (no DOM); `@/utils/ipc` mocked or injected; stores reset where the existing suites already do                |
| 9   | Test placement                   | `src/utils/__tests__/`                                                                                                                       |
| 10  | Characterization before refactor | The 15 existing files ARE the characterization and must pass unchanged (Decision 3); Todo 1 characterizes the new seam before the sites move |

---

## Status at pause (2026-09-14) — fresh review verdict: FAIL; fix these before Todo 4

Done on this branch (WIP, no PR): Todos 1–3. `persistPresentation.ts` was
already reshaped after the review (blockers 2 and 5 below): the outcome carries
the envelope's error **verbatim** (possibly none), `missing` carries no message,
and `commit` is a **capture function passed in by the caller**, so the module
imports nothing from the version/autosave modules (no cycle). 8 cases green;
the one-writer guard is red by design until the six sites move.

Blockers from the review, all still to apply to the plan text / Todos 4–5:

1. **The Measured claim "tests inject `deps.updatePresentation` fakes" is
   false.** No test and no production caller overrides those `deps`; all 14
   renderer test files `vi.mock('@/utils/ipc')`. Drop the rename from Todo 5
   and the blast radius. Instead keep `AutosaveDeps`/`VersionDeps` as they are
   and pass the dep through: `persistPresentation(id, doc, { deps: { updatePresentation: deps.updatePresentation }, commit: … })`
   (the guard regex `updatePresentation\(` does not match the value reference).
   Re-disposition manifest "File-specific pitfall notes" and testing #2.
2. _(done in code)_ Callers keep their own fallbacks:
   `presentationVersionsSync.ts:178` "Failed to restore that version.",
   `:249` "Failed to revert your presentation.", `autosaveSync.ts:130`
   "unknown error". Add tests pinning those three fallback strings — nothing
   pins them today.
3. **Site 2 behaviour change must be named or avoided:** `unsavedChanges.js:65`
   uses `success === false`, so a `null` envelope today alerts "no longer
   exists"; through the writer it would be `failed`. Preserve or declare it
   under testing #2 with a case.
4. **Return shapes:** `saveCurrentPresentation` still returns
   `{ success: true, data }` / `{ success: false, error }`
   (`presentationCommands.saveErrors.test.ts:91-99` asserts `result?.success`);
   `renamePresentationById` still returns an envelope (`Home.jsx:235` reads
   `result?.success`).
5. _(done in code)_ Import cycle `persistPresentation → presentationVersionsSync
→ autosaveSync → persistPresentation` avoided by injecting `commit`.

Suggestions: itemize the 14+1 test files; name `touchPresentation` (4 sites)
as an out-of-scope row writer and scope "one writer" to the update verb; fix
the range `presentationCommands.js:218-272`; refresh stale comments
`src/pages/editorSave.js:8-13` and `src/utils/presentationVersions.ts:15`;
say whether the coverage ratchet (`vitest.config.mjs:65-70`) is raised.
Reviewer's bottom line: worth doing — the rejected-call try/catch exists only
in autosave today — but pitch it as "one place for the rejection and envelope
guard", not "five rules unified".

---

## Completed (2026-09-15) — Todos 4–7 done, all review blockers resolved

Branch merged `main` first (#148/#149, render/menu only — no save conflicts).
All six sites now go through `persistPresentation`; the one-writer guard is
green. Gate green (type-check, lint, 1071 tests, coverage well over threshold);
`format:check` clean.

How each review blocker was handled:

1. **False "tests inject `deps.updatePresentation`" claim.** No dep rename made.
   `AutosaveDeps`/`VersionDeps` are unchanged; autosave and restore/revert pass
   their existing dep through — `persistPresentation(id, doc, { deps: {
   updatePresentation: deps.updatePresentation }, … })` — and the module mock
   still drives the write. Autosave's dep is `Envelope<unknown>`, so it casts
   `as PersistDeps['updatePresentation']`; `VersionDeps` needs no cast.
2. **Fallback strings pinned.** New cases: restore "Failed to restore that
   version." and revert "Failed to revert your presentation."
   (`presentationVersionsSync.captureResult.test.ts`), autosave "unknown error"
   (`autosaveSync.failures.test.ts`).
3. **Gate `success === false` behaviour named.** Declared change: a
   null/undefined envelope at the gate now reads as a failed save, not a deleted
   row (matches Save). Pinned in `unsavedChanges.test.ts`, with the explicit
   `{ success: true, data: null }` still asserting "no longer exists".
4. **Return shapes kept.** `saveCurrentPresentation` returns
   `{ success: true, data }` / `{ success: false, error }`;
   `renamePresentationById` still returns an envelope Home reads `.success` on
   (a rename of a deleted row now returns `{ success: false }` — declared).
5. **No import cycle** — `commit` is a function passed in; the writer imports
   only `@/utils/backgrounds` and `@/utils/ipc`.

Also: the gate keeps its strict `outcome.committed === false` (was
`captured === false`); Save and Rename keep `!` against the real
`captureVersion`. Coverage ratchet not tightened.
