function getMedia(db) {
  // Second-resolution created_at ties need a tie-breaker or order flips
  // between calls (MAIN-B16).
  return db.prepare('SELECT * FROM media ORDER BY created_at DESC, id DESC').all();
}

// MAIN-B15: media import used to fetch every row (`getMedia`) and `.find()`
// in JS per imported file — O(rows) per file, growing as the library grows.
// This uses `idx_media_canonical_path` (migration 1) instead. `.get`, not
// `.all` + `[0]`: canonical_path lookups are 0-or-1 row.
function findMediaByCanonicalPath(db, canonicalPath) {
  return db.prepare('SELECT * FROM media WHERE canonical_path = ?').get(canonicalPath);
}

function getMediaFolders(db) {
  // id ASC is a free extra tie-breaker for the rare case two folders share
  // both name and created_at second (MAIN-B16).
  return db
    .prepare('SELECT * FROM media_folders ORDER BY lower(name) ASC, created_at ASC, id ASC')
    .all();
}

// Both spellings are accepted (the column name, and the camelCase the
// renderer's folder model uses) so a caller using either gets the folder it
// asked for instead of a silent root. `?? null`: a bare undefined bind throws.
function resolveParentId(fields, fallback) {
  if (fields.parent_id !== undefined) return fields.parent_id ?? null;
  if (fields.parentId !== undefined) return fields.parentId ?? null;
  return fallback ?? null;
}

function createMediaFolder(db, fields = {}) {
  const stmt = db.prepare(`
    INSERT INTO media_folders (name, parent_id)
    VALUES (?, ?)
  `);
  const result = stmt.run(fields.name, resolveParentId(fields, null));
  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(result.lastInsertRowid);
}

// Every folder below `id`, excluding `id` itself, ordered by id. UNION, never
// UNION ALL: the dedup terminates even when a corrupt parent_id forms a cycle
// (plan #155-P1, S2).
function getMediaFolderDescendants(db, id) {
  return db
    .prepare(
      `
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM media_folders WHERE parent_id = ?
      UNION
      SELECT mf.id
        FROM media_folders mf
        JOIN descendants d ON mf.parent_id = d.id
    )
    SELECT id FROM descendants ORDER BY id
  `
    )
    .all(id);
}

function updateMediaFolder(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id);
  if (!current) return null;

  // Resolve each column explicitly: a {...current, ...updates} spread would
  // never map the parentId alias onto parent_id (plan #155-P1, S1).
  const name = updates.name ?? current.name;
  const parentId = resolveParentId(updates, current.parent_id);

  // Write-time legality, so a bad move can never strand a subtree where no
  // root reaches it (review of PR #172). The depth cap stays a UI rule.
  if (parentId !== null && parentId !== current.parent_id) {
    if (parentId === id) {
      throw new Error('A folder cannot be moved into itself.');
    }
    if (!db.prepare('SELECT 1 FROM media_folders WHERE id = ?').get(parentId)) {
      throw new Error('The destination folder does not exist.');
    }
    if (getMediaFolderDescendants(db, id).some((row) => row.id === parentId)) {
      throw new Error('A folder cannot be moved into its own subtree.');
    }
  }

  db.prepare(
    `
    UPDATE media_folders
    SET name = ?, parent_id = ?
    WHERE id = ?
  `
  ).run(name, parentId, id);

  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id);
}

// The whole subtree — the folder, every descendant folder, and every media
// row in any of them — in one transaction, as two fixed statements. The CTE is
// seeded with the folder itself, so no id list is built in JS and the
// parameter count never grows with the tree. Media first, while the folders
// that name them still exist. UNION dedup makes a corrupt cycle terminate.
// Files on disk are never touched (media is referenced in place).
const SUBTREE_CTE = `
    WITH RECURSIVE subtree(id) AS (
      SELECT ?
      UNION
      SELECT mf.id
        FROM media_folders mf
        JOIN subtree s ON mf.parent_id = s.id
    )`;

function deleteMediaFolder(db, id) {
  const tx = db.transaction((folderId) => {
    db.prepare(`${SUBTREE_CTE} DELETE FROM media WHERE folder_id IN (SELECT id FROM subtree)`).run(
      folderId
    );
    db.prepare(`${SUBTREE_CTE} DELETE FROM media_folders WHERE id IN (SELECT id FROM subtree)`).run(
      folderId
    );
  });
  tx(id);
}

function createMedia(
  db,
  { name, type, file_path, canonical_path, thumbnail_path, duration, tags, folder_id }
) {
  const stmt = db.prepare(`
    INSERT INTO media (name, type, file_path, canonical_path, thumbnail_path, duration, tags, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name,
    type,
    file_path,
    canonical_path || null,
    thumbnail_path || null,
    duration || null,
    tags || null,
    folder_id ?? null
  );
  return db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid);
}

function updateMedia(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  if (!current) return null;

  const next = { ...current, ...updates };
  db.prepare(
    `
    UPDATE media
    SET name = ?, type = ?, file_path = ?, canonical_path = ?, thumbnail_path = ?, duration = ?, tags = ?, folder_id = ?
    WHERE id = ?
  `
  ).run(
    next.name,
    next.type,
    next.file_path,
    next.canonical_path || null,
    next.thumbnail_path || null,
    next.duration || null,
    next.tags || null,
    next.folder_id ?? null,
    id
  );

  return db.prepare('SELECT * FROM media WHERE id = ?').get(id);
}

function deleteMedia(db, id) {
  db.prepare('DELETE FROM media WHERE id = ?').run(id);
}

module.exports = {
  getMedia,
  findMediaByCanonicalPath,
  getMediaFolders,
  createMediaFolder,
  updateMediaFolder,
  getMediaFolderDescendants,
  deleteMediaFolder,
  createMedia,
  updateMedia,
  deleteMedia,
};
