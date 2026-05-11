function getPresentations(db) {
  return db.prepare('SELECT * FROM presentations ORDER BY updated_at DESC').all().map(parse)
}

function getPresentation(db, id) {
  const row = db.prepare('SELECT * FROM presentations WHERE id = ?').get(id)
  return row ? parse(row) : null
}

function createPresentation(
  db,
  {
    title,
    sections,
    defaultBackgroundId,
    default_background_id,
    aspectRatio,
    aspect_ratio,
    customAspectWidth,
    custom_aspect_width,
    customAspectHeight,
    custom_aspect_height,
  }
) {
  const stmt = db.prepare(`
    INSERT INTO presentations (
      title,
      sections,
      default_background_id,
      aspect_ratio,
      custom_aspect_width,
      custom_aspect_height
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null,
    aspectRatio ?? aspect_ratio ?? '16:9',
    customAspectWidth ?? custom_aspect_width ?? null,
    customAspectHeight ?? custom_aspect_height ?? null
  )
  return getPresentation(db, result.lastInsertRowid)
}

function updatePresentation(
  db,
  id,
  {
    title,
    sections,
    defaultBackgroundId,
    default_background_id,
    aspectRatio,
    aspect_ratio,
    customAspectWidth,
    custom_aspect_width,
    customAspectHeight,
    custom_aspect_height,
  }
) {
  db.prepare(`
    UPDATE presentations
    SET title = ?,
        sections = ?,
        default_background_id = ?,
        aspect_ratio = ?,
        custom_aspect_width = ?,
        custom_aspect_height = ?,
        updated_at = unixepoch()
    WHERE id = ?
  `).run(
    title,
    JSON.stringify(sections || []),
    defaultBackgroundId ?? default_background_id ?? null,
    aspectRatio ?? aspect_ratio ?? '16:9',
    customAspectWidth ?? custom_aspect_width ?? null,
    customAspectHeight ?? custom_aspect_height ?? null,
    id
  )
  return getPresentation(db, id)
}

function touchPresentation(db, id) {
  db.prepare(`
    UPDATE presentations
    SET updated_at = unixepoch()
    WHERE id = ?
  `).run(id)
  return getPresentation(db, id)
}

function deletePresentation(db, id) {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id)
}

function parse(row) {
  const defaultBackgroundId = row.default_background_id ?? null
  const aspectRatio = row.aspect_ratio || '16:9'
  const customAspectWidth = row.custom_aspect_width ?? null
  const customAspectHeight = row.custom_aspect_height ?? null
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    defaultBackgroundId,
    aspectRatio,
    customAspectWidth,
    customAspectHeight,
  }
}

module.exports = { getPresentations, getPresentation, createPresentation, updatePresentation, touchPresentation, deletePresentation }
