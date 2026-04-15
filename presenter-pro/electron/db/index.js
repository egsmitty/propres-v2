const path = require('path')
const { app } = require('electron')
const Database = require('better-sqlite3')

let db

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'presenterpro.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

module.exports = { getDb }
