function getPresentations(db) {
  return db.prepare('SELECT * FROM presentations ORDER BY updated_at DESC').all().map(parse)
}

function getPresentation(db, id) {
  const row = db.prepare('SELECT * FROM presentations WHERE id = ?').get(id)
  return row ? parse(row) : null
}

function createPresentation(db, { title, sections, defaultBackgroundId, default_background_id }) {
  const stmt = db.prepare(`
    INSERT INTO presentations (title, sections, default_background_id)
    VALUES (?, ?, ?)
  `)
  const result = stmt.run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null
  )
  return getPresentation(db, result.lastInsertRowid)
}

function updatePresentation(db, id, { title, sections, defaultBackgroundId, default_background_id }) {
  db.prepare(`
    UPDATE presentations
    SET title = ?, sections = ?, default_background_id = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null,
    id
  )
  return getPresentation(db, id)
}

function deletePresentation(db, id) {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id)
}

function parse(row) {
  const defaultBackgroundId = row.default_background_id ?? null
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    defaultBackgroundId,
  }
}

module.exports = { getPresentations, getPresentation, createPresentation, updatePresentation, deletePresentation }
