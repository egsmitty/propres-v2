const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db;
let closed = false;

/**
 * MAIN-B14: `npm run dev` and the installed app used to share one database
 * file (`presenterpro.db`) — every edit while developing wrote straight into
 * the same file the packaged app reads. Runs under the electron-vite dev
 * server (the only thing that sets ELECTRON_RENDERER_URL) now get a sibling
 * `-dev` file. Deliberately NOT keyed on `app.isPackaged`: `npm run preview`
 * and Playwright E2E are unpackaged too, and every E2E spec reads
 * `userData/presenterpro.db` — the first version of this fix moved them to the
 * -dev file and E2E failed with "no such table". Pure so it is unit-testable
 * without Electron.
 */
function resolveDbFileName(usesDevServer) {
  return usesDevServer ? 'presenterpro-dev.db' : 'presenterpro.db';
}

/** Pure: combine the userData directory with the run's db filename. */
function getDbPath(userDataDir, usesDevServer) {
  return path.join(userDataDir, resolveDbFileName(usesDevServer));
}

function getDb() {
  if (!db) {
    const dbPath = getDbPath(app.getPath('userData'), Boolean(process.env.ELECTRON_RENDERER_URL));
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * MAIN-B11: checkpoint the WAL and close the handle on quit, so a quit never
 * leaves `-wal`/`-shm` files behind. Guarded to run at most once and never
 * throws — a failure here must not block or hang app quit.
 */
function closeDb() {
  if (!db || closed) return;
  closed = true;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (err) {
    console.error('[db] failed to checkpoint/close on quit:', err);
  }
}

/** Test-only seam: inject a fake db so closeDb() is testable without Electron. */
function __setDbForTesting(fakeDb) {
  db = fakeDb;
  closed = false;
}

module.exports = { getDb, closeDb, getDbPath, resolveDbFileName, __setDbForTesting };
