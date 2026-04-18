function getSongs(db) {
  return db.prepare('SELECT * FROM songs ORDER BY title ASC').all().map(parse)
}

function getSong(db, id) {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
  return row ? parse(row) : null
}

function createSong(db, { title, artist, ccli, tags, slides, songOrder, song_order }) {
  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, ccli, tags, slides, song_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    title,
    artist || null,
    ccli || null,
    tags || null,
    slides,
    songOrder ?? song_order ?? null
  )
  return getSong(db, result.lastInsertRowid)
}

function updateSong(db, id, { title, artist, ccli, tags, slides, songOrder, song_order }) {
  db.prepare(`
    UPDATE songs
    SET title = ?, artist = ?, ccli = ?, tags = ?, slides = ?, song_order = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(title, artist || null, ccli || null, tags || null, slides, songOrder ?? song_order ?? null, id)
  return getSong(db, id)
}

function deleteSong(db, id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
}

function parse(row) {
  return {
    ...row,
    songOrder: row.song_order ?? null,
  }
}

module.exports = { getSongs, getSong, createSong, updateSong, deleteSong }
