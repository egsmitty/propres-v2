# Executable Plan #155-P1 — Nested media folders (data layer)

**Parent charter:** `plan-155-media-library-port.md` (Phase 1). **Issue:** #155.
The Builder media library nests folders (3 levels); ours has a **flat**
`media_folders` table. This PR gives the data layer nesting — a `parent_id`
column, folder create/rename/move carrying it, and a **recursive** cascade
delete — with zero UI change. It unblocks the ported browser (Phase 3) without
touching any renderer surface yet. Branch base `main` @ `748d8f5`. One PR.

---

## Measured (read 2026-09-23, `main` @ `748d8f5`)

- `electron/db/migrationList.ts`: `media_folders` is `(id, name, created_at)` —
  **no `parent_id`.** Latest migration `version: 5`. Column adds use the
  inspection-guarded `addColumnIfMissing`. The `MIGRATIONS` list is append-only.
- `electron/db/queries/media.js`:
  - `createMediaFolder(db, { name })` inserts `name` only.
  - `updateMediaFolder(db, id, updates)` merges `{...current, ...updates}` but the
    `UPDATE` **sets `name` only** — a `parent_id` in `updates` is silently dropped.
  - `deleteMediaFolder(db, id)` is a transaction that deletes **direct-child**
    media (`WHERE folder_id = ?`) then the folder. With nesting this **orphans
    every descendant folder and its media** (their `folder_id`/`parent_id` point
    at rows that no longer exist).
  - `getMediaFolders(db)` selects all rows ordered by `lower(name), created_at, id`.
- IPC needs **no change**: `db:mediaFolders:create` passes `data` straight to
  `createMediaFolder(db, data)`; `db:mediaFolders:update` passes `(id, data)`; the
  renderer wrappers `createMediaFolder(data)` / `updateMediaFolder(id, data)` take
  free-form `Fields`. New fields ride the existing objects.
- `media.folder_id` has no FK; integrity is app-enforced (matches today).

## Decisions

1. **Migration 6 adds `media_folders.parent_id INTEGER`** (nullable; `NULL` =
   root, matching the Builder's `parentId: null`). Existing folders become roots —
   correct, since today's model is one flat level. Guarded by `addColumnIfMissing`,
   appended as `{ version: 6, name: 'media-folder-nesting', up: mediaFolderNesting }`.
   No index (the tree is small; folder reads are already fully ordered in JS).
2. **`createMediaFolder(db, { name, parentId })`** inserts `(name, parent_id)`,
   `parentId ?? null`. Back-compatible: existing `{ name }` callers get root.
3. **`updateMediaFolder(db, id, { name?, parent_id?/parentId? })`** — do NOT rely
   on a `{...current, ...updates}` spread to carry the parent (the spread never
   maps the `parentId` alias onto the `parent_id` column, and a bare
   `undefined` bind throws in better-sqlite3). Coalesce explicitly:
   `rawParent = updates.parent_id !== undefined ? updates.parent_id : updates.parentId
   !== undefined ? updates.parentId : current.parent_id`, and bind `rawParent ?? null`.
   Name comes from `updates.name ?? current.name`. So a rename preserves the
   parent and a move preserves the name (S1).
4. **`getMediaFolderDescendants(db, id)`** — a recursive CTE returning the
   **descendant folder ids** (excluding `id` itself), used by the cascade. It uses
   **`UNION` (deduping), never `UNION ALL`** — dedup is also the cycle guard, so a
   corrupt `parent_id` loop still terminates and the whole cycle is collected (S2):
   ```sql
   WITH RECURSIVE descendants(id) AS (
     SELECT id FROM media_folders WHERE parent_id = ?
     UNION
     SELECT mf.id FROM media_folders mf
       JOIN descendants d ON mf.parent_id = d.id
   )
   SELECT id FROM descendants;
   ```
5. **`deleteMediaFolder(db, id)` recurses**: in one transaction, collect `id` +
   all descendants, delete every `media` row whose `folder_id` is in that set,
   then delete those `media_folders` rows. No disk deletion (media files are
   referenced in place — unchanged from today).
6. **Not in scope:** the depth-3 cap, the item cap, move-legality (`canMoveFolder`)
   — those live in the ported pure logic (Phase 2) and are enforced in the UI
   (Phase 3). The data layer stays mechanism-only. Any `parent_id` the DB is given
   is written; the UI won't offer an illegal one. This is safe **because the
   cascade CTE dedups** (decision 4): even a persisted cycle is deleted cleanly, so
   leaving legality to the UI cannot strand the data layer.

**Anti-weakening clause (verbatim):** _If an assertion fails, the bug is
elsewhere — never loosen the assertion to pass. Fix the root cause or record it
as a suspected regression._

## Blast radius

**May change:**
- `electron/db/migrationList.ts` (new migration 6 + list entry).
- `electron/db/queries/media.js` (the four functions + the new query in
  `module.exports`).
- `electron/db/__tests__/migrations.test.ts` — the frozen list assertion at
  `:48` becomes `[1,2,3,4,5,6]` with a name assertion for `media-folder-nesting`
  (B1). `TOLERATED_STATEMENT_FAILURES` stays `[]` (migration 6 tolerates none).
- `electron/db/__tests__/realSqlite.migrations.test.ts` — the "newer build"
  fixture that inserts version 6 (`~:145`) moves to **7** to avoid a PK collision
  with the real migration 6 (B2); the `applied`/`schema_migrations` list
  assertions (`~:76`) and the test title extend to include 6; the
  `COLUMNS_LEGACY_LACKS` list gains `['media_folders','parent_id']` (N1).
- new nesting query/cascade tests in `realSqlite.queries.test.ts` (or a new
  `mediaFolderNesting.test.ts`). This plan, the charter row, the notes entry.
- `e2e/migrations.spec.ts` — **found by CI, not by the fresh review**: three
  tests pin the recorded list at 1–5 (fresh install, legacy upgrade, no-op
  second launch) and its `COLUMNS_LEGACY_LACKS` says "the exact set". All
  extended to 6 / `media_folders.parent_id`. The unit gate cannot see E2E specs;
  any future migration must grep `e2e/` for `schema_migrations` too.

**May NOT change:** the `media` table shape, the protocol, serialization,
`MediaLibraryPanel.jsx`, any renderer file, the IPC contract/handlers/wrappers.
`realSqlite.queries.test.ts:281` (single-level cascade) **stays green** — a
subset of the recursive cascade, no edit (N2).

## Todos

- [x] 1. **Red:** a real-sqlite test. Primary RED (honest cause, S3): after
      migrating to head, `media_folders` has a `parent_id` column (PRAGMA) and a
      `createMediaFolder(db, { name, parentId })` round-trips the parent — both
      impossible on current code (no column; `parentId` ignored). Then the
      behavior cases (exercisable only after Todos 2–3): a rename keeps the parent;
      a **move to another parent** changes only `parent_id`; a **move to root**
      sets it `null`; `getMediaFolderDescendants` **excludes self**; a **3-deep
      chain** (root→child→grandchild) — deleting the child removes the grandchild
      **and the grandchild's media**, proving recursion; a **sibling subtree
      survives**; and a **cycle** persisted via the raw column (A↔B) is deleted
      cleanly without hanging (proves the `UNION` guard, S2/S4).
- [x] 2. Migration 6 `mediaFolderNesting` (`addColumnIfMissing`) + list entry;
      update `migrations.test.ts` (list → 1–6 + name, B1) and the
      `realSqlite.migrations.test.ts` assertions/fixture (future version → 7,
      `applied`/list → 1–6, `COLUMNS_LEGACY_LACKS` += `media_folders.parent_id`;
      B2/N1).
- [x] 3. `createMediaFolder` (parentId) + `updateMediaFolder` (explicit
      parentId/parent_id coalesce, bind `?? null`, S1) + `getMediaFolderDescendants`
      (recursive `UNION` CTE) + recursive `deleteMediaFolder`; export the new query.
- [x] 4. Green; then full gate from `presenter-pro/`.
- [x] 5. PR body: findings, the `deleteMediaFolder` behavior change named
      explicitly (now recurses through subfolders), the migration-6 note, the
      one-line dangling-`backgroundId` note (pre-existing, gracefully handled — N3),
      records.

## Compliance Manifest (writing-executable-plans.mdc)

| Item | Disposition |
|---|---|
| Assertion weakening designed against | Clause verbatim; cascade asserted by row absence AND sibling survival, not counts alone |
| Bounded blast radius | Two source files + tests; may-not-change list above |
| Per-todo verification | Todo 1 red proof; Todo 4 full gate |
| Behavior-change test edits | `deleteMediaFolder` now recurses — named in Todo 5 / PR. `migrations.test.ts` frozen list and the `realSqlite.migrations.test.ts` future-version fixture are updated for migration 6 (B1/B2, Todo 2). The single-level cascade test (`realSqlite.queries.test.ts:281`) stays green as a subset — not edited (N2). |
| Required findings report | Todo 5 |
| Data rewrites | None — migration only ADDS a nullable column; no existing row is rewritten |

## Review

**What changed.** The media-folder data layer now nests, with no UI change.
- Migration 6 `media-folder-nesting` adds a nullable `media_folders.parent_id`
  (`addColumnIfMissing`). Existing folders become roots.
- `queries/media.js`: `createMediaFolder` accepts `{ name, parentId }` (binds
  `parentId ?? null`); `updateMediaFolder` resolves `name` and `parent_id`
  explicitly (handles the `parentId` alias, binds `?? null`) so a rename keeps the
  parent and a move keeps the name; a new `getMediaFolderDescendants` uses a
  deduping `WITH RECURSIVE … UNION` CTE; `deleteMediaFolder` now cascades through
  the whole subtree (folder + all descendants + all their media) in one
  transaction. UNION dedup makes the cascade terminate even on a corrupt cycle.

**Behavior change named.** `deleteMediaFolder` used to delete only direct-child
media; it now recurses through subfolders. This is required — nesting would
otherwise orphan descendant folders and media.

**Dangling `backgroundId` (N3).** Deleting descendant media can leave a
slide/section `backgroundId` pointing at a gone id. This is a pre-existing,
gracefully-handled condition (`getMediaAssetUrl(null)` → `''`, lazy resolution
against the media list), identical to today's `deleteMedia`; this PR introduces
no new class of dangling reference.

**Tests.** New `electron/db/__tests__/mediaFolderNesting.test.ts` (7 cases: column
present, create-under-parent + root default, rename-keeps-parent + move,
move-to-root, descendants-exclude-self, 3-deep recursive cascade with sibling
survival, cycle-safety). All red on current code first, green after. Migration
tests updated for version 6: `migrations.test.ts` frozen list → 1–6 + a name
assertion; `realSqlite.migrations.test.ts` applied/list/no-op-count → 1–6, the
"from-the-future" fixture moved to version 7 (avoids a PK collision), and
`COLUMNS_LEGACY_LACKS` += `media_folders.parent_id`. The single-level cascade
test stayed green untouched (a subset of the recursive cascade).

**Gate:** type-check ✓ · lint ✓ · vitest 1111/1111 passed (0 skipped) ·
prettier ✓. **E2E:** the first CI run failed on `e2e/migrations.spec.ts` (three
version-list pins at 1–5); fixed on the branch, CI is the proof.

**Fresh review.** A pre-implementation review caught two blockers (the frozen
migration-list test, the version-6 fixture collision) and the `updateMediaFolder`
alias/undefined-bind + `UNION`-vs-`UNION ALL` hardening — all folded in before
coding.
