function getMedia(db) {
  return db.prepare('SELECT * FROM media ORDER BY created_at DESC').all()
}

function getMediaFolders(db) {
  return db.prepare('SELECT * FROM media_folders ORDER BY lower(name) ASC, created_at ASC').all()
}

function createMediaFolder(db, { name }) {
  const stmt = db.prepare(`
    INSERT INTO media_folders (name)
    VALUES (?)
  `)
  const result = stmt.run(name)
  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(result.lastInsertRowid)
}

function updateMediaFolder(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id)
  if (!current) return null

  const next = { ...current, ...updates }
  db.prepare(`
    UPDATE media_folders
    SET name = ?
    WHERE id = ?
  `).run(next.name, id)

  return db.prepare('SELECT * FROM media_folders WHERE id = ?').get(id)
}

function deleteMediaFolder(db, id) {
  const tx = db.transaction((folderId) => {
    db.prepare('DELETE FROM media WHERE folder_id = ?').run(folderId)
    db.prepare('DELETE FROM media_folders WHERE id = ?').run(folderId)
  })
  tx(id)
}

function createMedia(db, { name, type, file_path, thumbnail_path, duration, tags, folder_id }) {
  const stmt = db.prepare(`
    INSERT INTO media (name, type, file_path, thumbnail_path, duration, tags, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(name, type, file_path, thumbnail_path || null, duration || null, tags || null, folder_id ?? null)
  return db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid)
}

function updateMedia(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
  if (!current) return null

  const next = { ...current, ...updates }
  db.prepare(`
    UPDATE media
    SET name = ?, type = ?, file_path = ?, thumbnail_path = ?, duration = ?, tags = ?, folder_id = ?
    WHERE id = ?
  `).run(
    next.name,
    next.type,
    next.file_path,
    next.thumbnail_path || null,
    next.duration || null,
    next.tags || null,
    next.folder_id ?? null,
    id
  )

  return db.prepare('SELECT * FROM media WHERE id = ?').get(id)
}

function deleteMedia(db, id) {
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
}

module.exports = {
  getMedia,
  getMediaFolders,
  createMediaFolder,
  updateMediaFolder,
  deleteMediaFolder,
  createMedia,
  updateMedia,
  deleteMedia,
}
