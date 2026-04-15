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

function deleteMedia(db, id) {
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
}

module.exports = { getMedia, createMedia, deleteMedia }
