#!/usr/bin/env node
// Verify that the BUILT app upgrades an existing database safely — against a
// COPY of it, never the original.
//
//   npm run build
//   node e2e/tools/verify-legacy-db.mjs "/path/to/presenterpro.db"
//
// Copies the database into a throwaway userData directory, launches the app
// there, waits for the main window (migrations run before it), then reports:
// row counts before vs after (must match), the schema_migrations rows, the
// tables and columns added, and the backup file written. Exits non-zero on
// any mismatch or fatal startup error.
//
// Use this before upgrading a real installation. It is the plan A1 "existing
// database" manual check, made mechanical.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(here, '../../out/main/index.js');
const TABLES = ['presentations', 'songs', 'media', 'media_folders', 'settings'];

function query(dbFile, sql) {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : [];
}

function tableNames(dbFile) {
  return query(
    dbFile,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((r) => r.name);
}

function counts(dbFile) {
  const present = new Set(tableNames(dbFile));
  const result = {};
  for (const t of TABLES)
    result[t] = present.has(t) ? query(dbFile, `SELECT COUNT(*) AS n FROM ${t}`)[0].n : null;
  return result;
}

function columns(dbFile, table) {
  return query(dbFile, `PRAGMA table_info(${table})`).map((r) => r.name);
}

async function main() {
  const source = process.argv[2];
  if (!source || !fs.existsSync(source)) {
    console.error('usage: node e2e/tools/verify-legacy-db.mjs <path-to-presenterpro.db>');
    process.exit(2);
  }
  if (!fs.existsSync(MAIN_ENTRY)) {
    console.error(`built app not found at ${MAIN_ENTRY} — run \`npm run build\` first`);
    process.exit(2);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppro-verify-'));
  const dbCopy = path.join(userDataDir, 'presenterpro.db');
  fs.copyFileSync(source, dbCopy);
  // Copy WAL/SHM sidecars too if present, so the copy is complete.
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, dbCopy + suffix);
  }

  const before = {
    counts: counts(dbCopy),
    tables: tableNames(dbCopy),
    columns: Object.fromEntries(tableNames(dbCopy).map((t) => [t, columns(dbCopy, t)])),
  };
  console.log(`source:   ${source}`);
  console.log(`copy:     ${dbCopy}`);
  console.log(`before:   tables=${before.tables.join(',')}`);
  console.log(`          counts=${JSON.stringify(before.counts)}`);

  const env = { ...process.env };
  delete env.ELECTRON_RENDERER_URL;
  let stderr = '';
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`], env });
  const proc = app.process();
  proc.stderr?.on('data', (c) => (stderr += c.toString()));

  let failed = false;
  try {
    const window = await app.firstWindow({ timeout: 60_000 });
    await window.waitForLoadState('load');

    const resolved = await app.evaluate(({ app: a }) => a.getPath('userData'));
    if (!fs.realpathSync.native(resolved).startsWith(fs.realpathSync.native(os.tmpdir()))) {
      throw new Error(`REFUSING: app resolved userData outside temp: ${resolved}`);
    }

    const after = { counts: counts(dbCopy), tables: tableNames(dbCopy) };
    const migrations = query(
      dbCopy,
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
    );
    const backups = fs
      .readdirSync(userDataDir)
      .filter((f) => /^presenterpro\.backup-v\d+-\d{8}T\d{6}Z\.db$/.test(f));

    console.log(`after:    tables=${after.tables.join(',')}`);
    console.log(`          counts=${JSON.stringify(after.counts)}`);
    console.log(`migrations recorded: ${JSON.stringify(migrations)}`);
    console.log(`backups written:     ${backups.join(', ') || '(none)'}`);
    for (const t of after.tables) {
      const added = columns(dbCopy, t).filter((c) => !(before.columns[t] ?? []).includes(c));
      if (added.length) console.log(`columns added to ${t}: ${added.join(', ')}`);
    }
    const tablesAdded = after.tables.filter((t) => !before.tables.includes(t));
    if (tablesAdded.length) console.log(`tables added: ${tablesAdded.join(', ')}`);

    // Every count that existed before must be identical after.
    for (const t of TABLES) {
      if (before.counts[t] !== null && before.counts[t] !== after.counts[t]) {
        console.error(`DATA MISMATCH in ${t}: before=${before.counts[t]} after=${after.counts[t]}`);
        failed = true;
      }
    }
    if (migrations.length !== 1 || migrations[0].version !== 1) {
      console.error(`expected exactly migration 1 recorded, got ${JSON.stringify(migrations)}`);
      failed = true;
    }
    if (backups.length !== 1) {
      console.error(`expected exactly one backup, found ${backups.length}`);
      failed = true;
    }
    for (const marker of [
      'Cannot find module',
      'UnhandledPromiseRejection',
      'Uncaught Exception',
    ]) {
      if (stderr.includes(marker)) {
        console.error(`fatal marker in stderr: ${marker}\n${stderr}`);
        failed = true;
      }
    }
  } finally {
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => undefined);
    await new Promise((resolve) =>
      proc.exitCode !== null ? resolve() : proc.once('exit', resolve)
    );
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: OK — safe to upgrade this database');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
