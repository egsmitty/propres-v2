function getSongs(db) {
  return db.prepare('SELECT * FROM songs ORDER BY title ASC').all()
}

function getSong(db, id) {
  return db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
}

function createSong(db, { title, artist, ccli, tags, slides }) {
  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, ccli, tags, slides)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(title, artist || null, ccli || null, tags || null, slides)
  return getSong(db, result.lastInsertRowid)
}

function updateSong(db, id, { title, artist, ccli, tags, slides }) {
  db.prepare(`
    UPDATE songs
    SET title = ?, artist = ?, ccli = ?, tags = ?, slides = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(title, artist || null, ccli || null, tags || null, slides, id)
  return getSong(db, id)
}

function deleteSong(db, id) {
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
}

module.exports = { getSongs, getSong, createSong, updateSong, deleteSong }
