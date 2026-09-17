# Executable Plan VH1 — Version History: Current marker + polish

**Issue:** #159. Four changes to the Version History surface, no change to how
versions are written/restored (that model is confirmed correct — Google-Docs
append). Branch base `main` @ `4dd3402` (#150 merged). One PR.

---

## Measured (read on 2026-09-16, `main` @ `4dd3402`)

- `VersionHistoryModal.jsx` marks "Current" by **guessing slide count**:
  `currentId = isDirty ? null : versions.find(v => v.slide_count === liveSlideCount)?.id`.
  Versions are ordered `id DESC` (newest first, `versions.js:listVersionSummaries`).
  When two versions share a slide count (routine at 2 versions), the guess lands
  on the wrong row or none — the just-saved version isn't marked Current. With 3+
  it usually lines up, hiding the bug.
- The app already guarantees **newest saved version == the committed row when the
  document is clean** (the A5/A6 invariant, upheld by save/restore/revert). So the
  correct Current, when not dirty, is simply the newest version — `versions[0]`.
- `versionLabels.formatVersionLabels` appends `(9:31:48 AM)` to any label that
  collides with another in the list. Under restore's before+after capture two
  versions can share the same second, so the disambiguator repeats identically —
  and the seconds are noise the user does not want.
- `commandRegistry` gates `file:versionHistory` on `editing(s) && !isPresenting`.
  Nothing stops it opening on a document with only its initial version, where
  there is nothing to restore. `CommandState` has no version-count signal.
- The modal is `w-[420px] max-h-[70vh]`.

## Decisions

1. **Current by identity, not slide count.** `currentId = isDirty ? null :
   versions[0]?.id`. When dirty, mark no row and show an "Unsaved changes" note at
   the top (honest: the working copy is not yet a version). Removes the
   `liveSlideCount` heuristic entirely.
2. **Drop the seconds disambiguator.** `formatVersionLabels` returns the plain
   per-row timestamp labels; no seconds are ever appended. Same-minute versions
   may share a label — they are still distinguishable by slide count, order and
   the Current marker. `formatVersionTimestamp` is unchanged.
3. **Gate Version History at ≤1 version.** Add `versionCount: number` to
   `CommandState`; `when: editing(s) && !isPresenting && versionCount > 1`.
   `versionCount` is a new editor-store field, set from
   `listVersionSummaries(id).length` when a presentation opens and refreshed after
   a successful save (the only editor path that can add a version and stay open).
   The modal also degrades gracefully if opened with ≤1 version.
4. **Larger modal** — `w-[560px] max-h-[80vh]`.
5. **Not in scope:** how versions are written/captured/restored; the diff/preview
   (issue #160); retention.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**May change:** `src/utils/versionLabels.ts`,
`src/components/editor/VersionHistoryModal.jsx`, `src/utils/commandRegistry.ts`,
`src/store/editorStore.js`, `src/components/layout/MenuBar.jsx`,
`src/utils/presentationCommands.js` (open + save set `versionCount`), and the
tests for those (`versionLabels.test.ts`, `VersionHistoryModal.test.tsx`,
`commandRegistry.test.ts`). This plan, the charter row, the notes entry.

**May not change:** `presentationVersionsSync` restore/revert/capture behaviour;
the `versions` DB queries; retention; any restore semantics.

## Todos

- [x] 1. **Red:** `versionLabels.test.ts` — same-minute rows render with NO
      seconds appended (fails on current code, which appends them).
- [x] 2. `versionLabels.ts` — drop `TIME_WITH_SECONDS` + the collision seconds;
      `formatVersionLabels` maps `formatVersionTimestamp`. Green on Todo 1.
- [x] 3. **Red:** `commandRegistry.test.ts` — `file:versionHistory` disabled when
      `versionCount <= 1`, enabled when `> 1` (editing, not presenting). Add
      `versionCount` to the EDITOR fixture.
- [x] 4. `commandRegistry.ts` + `editorStore.js` + `MenuBar.jsx` +
      `presentationCommands.js` — the `versionCount` field, `when` gate, and the
      open/save refresh. Green on Todo 3.
- [x] 5. **Red then green:** `VersionHistoryModal.test.tsx` — with two versions of
      the same slide count, the newest is marked Current (the old guess failed);
      an unsaved document shows the "Unsaved changes" note and marks no row.
- [x] 6. Modal sizing (`w-[560px] max-h-[80vh]`) and the ≤1-version graceful
      state. `npm run gate` + `npm run format:check`.
- [x] 7. PR body: findings, the named test changes (seconds removal), manual check
      owed (open Version History after a first save; confirm Current tracks).

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; identity assertions, not heuristics |
| Bounded blast radius | Named files + may-not-change list |
| Per-todo verification | Todos name their suites; gate at Todo 6 |
| Behavior-change test edits | Seconds removal named (Todo 1/2); registry fixture gains `versionCount` (Todo 3) |
| Required findings report | Todo 7 |
| Data rewrites | N/A — no rows rewritten |
