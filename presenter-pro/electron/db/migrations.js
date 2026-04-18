function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      ccli TEXT,
      tags TEXT,
      slides TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      duration INTEGER,
      tags TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sections TEXT NOT NULL,
      default_background_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Add aspect_ratio column if it doesn't exist (safe to re-run)
  try { db.exec("ALTER TABLE presentations ADD COLUMN aspect_ratio TEXT DEFAULT '16:9'") } catch (_) {}
}

module.exports = { runMigrations }
