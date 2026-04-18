function getPresentations(db) {
  return db.prepare('SELECT * FROM presentations ORDER BY updated_at DESC').all().map(parse)
}

function getPresentation(db, id) {
  const row = db.prepare('SELECT * FROM presentations WHERE id = ?').get(id)
  return row ? parse(row) : null
}

function createPresentation(db, { title, sections, defaultBackgroundId, default_background_id, aspectRatio, aspect_ratio }) {
  const stmt = db.prepare(`
    INSERT INTO presentations (title, sections, default_background_id, aspect_ratio)
    VALUES (?, ?, ?, ?)
  `)
  const result = stmt.run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null,
    aspectRatio ?? aspect_ratio ?? '16:9'
  )
  return getPresentation(db, result.lastInsertRowid)
}

function updatePresentation(db, id, { title, sections, defaultBackgroundId, default_background_id, aspectRatio, aspect_ratio }) {
  db.prepare(`
    UPDATE presentations
    SET title = ?, sections = ?, default_background_id = ?, aspect_ratio = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null,
    aspectRatio ?? aspect_ratio ?? '16:9',
    id
  )
  return getPresentation(db, id)
}

function deletePresentation(db, id) {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id)
}

function parse(row) {
  const defaultBackgroundId = row.default_background_id ?? null
  const aspectRatio = row.aspect_ratio || '16:9'
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    defaultBackgroundId,
    aspectRatio,
  }
}

module.exports = { getPresentations, getPresentation, createPresentation, updatePresentation, deletePresentation }
