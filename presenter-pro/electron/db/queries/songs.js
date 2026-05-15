function getSongs(db) {
  return db.prepare('SELECT * FROM songs ORDER BY title ASC').all().map(parse)
}

function getSong(db, id) {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
  return row ? parse(row) : null
}

function getSongByBuiltInKey(db, builtInKey) {
  if (!builtInKey) return null
  const row = db.prepare('SELECT * FROM songs WHERE built_in_key = ?').get(builtInKey)
  return row ? parse(row) : null
}

function createSong(db, { title, artist, ccli, tags, slides, songOrder, song_order, songGroups, song_groups, builtInKey, built_in_key }) {
  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, ccli, tags, slides, song_order, song_groups, built_in_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    title,
    artist || null,
    ccli || null,
    tags || null,
    slides,
    songOrder ?? song_order ?? null,
    songGroups ?? song_groups ?? null,
    builtInKey ?? built_in_key ?? null
  )
  return getSong(db, result.lastInsertRowid)
}

function updateSong(db, id, { title, artist, ccli, tags, slides, songOrder, song_order, songGroups, song_groups, builtInKey, built_in_key }) {
  db.prepare(`
    UPDATE songs
    SET title = ?, artist = ?, ccli = ?, tags = ?, slides = ?, song_order = ?, song_groups = ?, built_in_key = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(
    title,
    artist || null,
    ccli || null,
    tags || null,
    slides,
    songOrder ?? song_order ?? null,
    songGroups ?? song_groups ?? null,
    builtInKey ?? built_in_key ?? null,
    id
  )
  return getSong(db, id)
}

function deleteSong(db, id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
}

function parse(row) {
  return {
    ...row,
    songOrder: row.song_order ?? null,
    songGroups: row.song_groups ?? null,
    builtInKey: row.built_in_key ?? null,
  }
}

module.exports = { getSongs, getSong, getSongByBuiltInKey, createSong, updateSong, deleteSong }
