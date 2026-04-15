function getMedia(db) {
  return db.prepare('SELECT * FROM media ORDER BY created_at DESC').all()
}

function createMedia(db, { name, type, file_path, thumbnail_path, duration, tags }) {
  const stmt = db.prepare(`
    INSERT INTO media (name, type, file_path, thumbnail_path, duration, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(name, type, file_path, thumbnail_path || null, duration || null, tags || null)
  return db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid)
}

function updateMedia(db, id, updates = {}) {
  const current = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
  if (!current) return null

  const next = { ...current, ...updates }
  db.prepare(`
    UPDATE media
    SET name = ?, type = ?, file_path = ?, thumbnail_path = ?, duration = ?, tags = ?
    WHERE id = ?
  `).run(
    next.name,
    next.type,
    next.file_path,
    next.thumbnail_path || null,
    next.duration || null,
    next.tags || null,
    id
  )

  return db.prepare('SELECT * FROM media WHERE id = ?').get(id)
}

function deleteMedia(db, id) {
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
}

module.exports = { getMedia, createMedia, updateMedia, deleteMedia }
