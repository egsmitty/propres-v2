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
      canonical_path TEXT,
      thumbnail_path TEXT,
      duration INTEGER,
      tags TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
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
  try { db.exec('ALTER TABLE presentations ADD COLUMN custom_aspect_width INTEGER') } catch (_) {}
  try { db.exec('ALTER TABLE presentations ADD COLUMN custom_aspect_height INTEGER') } catch (_) {}
  try { db.exec('ALTER TABLE songs ADD COLUMN song_order TEXT') } catch (_) {}
  try { db.exec('ALTER TABLE media ADD COLUMN folder_id INTEGER') } catch (_) {}
  try { db.exec('ALTER TABLE media ADD COLUMN canonical_path TEXT') } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_media_canonical_path ON media(canonical_path)') } catch (_) {}
}

module.exports = { runMigrations }
