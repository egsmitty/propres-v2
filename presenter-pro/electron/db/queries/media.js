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

function createMediaFolder(db, { name, parentId } = {}) {
  const stmt = db.prepare(`
    INSERT INTO media_folders (name, parent_id)
    VALUES (?, ?)
  `);
  // parentId ?? null: a bare undefined bind throws in better-sqlite3, and a
  // missing parent means the root.
  const result = stmt.run(name, parentId ?? null);
  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(result.lastInsertRowid);
}

function updateMediaFolder(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id);
  if (!current) return null;

  // A plain {...current, ...updates} spread never maps the `parentId` alias
  // onto the `parent_id` column, and binding a bare `undefined` throws. Resolve
  // each column explicitly and bind `?? null` so a rename keeps the parent and a
  // move keeps the name (plan #155-P1, S1).
  const name = updates.name ?? current.name;
  const rawParent =
    updates.parent_id !== undefined
      ? updates.parent_id
      : updates.parentId !== undefined
        ? updates.parentId
        : current.parent_id;

  db.prepare(
    `
    UPDATE media_folders
    SET name = ?, parent_id = ?
    WHERE id = ?
  `
  ).run(name, rawParent ?? null, id);

  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id);
}

// Every folder below `id` (excluding `id` itself). UNION, never UNION ALL: the
// dedup terminates even when a corrupt parent_id forms a cycle, so the cascade
// below is safe without a move-legality guard at the data layer (plan #155-P1,
// S2). The cascade re-adds `id` itself.
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
    SELECT id FROM descendants
  `
    )
    .all(id);
}

function deleteMediaFolder(db, id) {
  const tx = db.transaction((folderId) => {
    const ids = [folderId, ...getMediaFolderDescendants(db, folderId).map((row) => row.id)];
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`DELETE FROM media WHERE folder_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM media_folders WHERE id IN (${placeholders})`).run(...ids);
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
