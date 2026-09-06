const fs = require('fs');
const path = require('path');
const { runMigrations: run, BACKUP_FILE_PATTERN } = require('./migrationRunner');
const { MIGRATIONS, TOLERATED_STATEMENT_FAILURES } = require('./migrationList');

// CommonJS shell the main process requires at startup. The migration LIST
// lives in migrationList.ts (typed, unit-tested); the RUNNER in
// migrationRunner.ts (tested through an injected fake). This file only wires
// the real filesystem. No error handling here on purpose: a failed migration
// must surface at startup, never look like success.

/** Real filesystem implementation of the runner's BackupStore seam. */
function createBackupStore(dir) {
  return {
    list: () =>
      fs
        .readdirSync(dir)
        .filter((file) => BACKUP_FILE_PATTERN.test(file))
        .map((file) => path.join(dir, file)),
    remove: (file) => fs.unlinkSync(file),
  };
}

/**
 * Bring `db` up to date. Synchronous: the main process calls this during
 * `ready`, before any window exists.
 */
function runMigrations(db) {
  const backupDir = path.dirname(db.name);
  return run(db, MIGRATIONS, { backupDir, backups: createBackupStore(backupDir) });
}

module.exports = { runMigrations, MIGRATIONS, TOLERATED_STATEMENT_FAILURES };
