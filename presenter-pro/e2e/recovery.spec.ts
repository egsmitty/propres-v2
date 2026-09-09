import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  launchApp,
  closeApp,
  dismissTutorialIfPresent,
  type LaunchedApp,
} from './fixtures/launchApp';

// Plan A5 slice 3. The crash-recovery journal's WRITER is gone: autosave puts
// edits into the real record within seconds, and every autosave bumps
// `presentations.updated_at`, which would make `selectRecoverable` call every
// journal row stale before it was ever read. A shadow copy that can never fire
// is worse than none.
//
// What remains is the drain: a journal left in a profile by a pre-autosave
// build is still offered once, then removed. These specs prove both halves —
// nothing is written, and a pre-existing row still works.

const CREATED_TITLE = 'Untitled Presentation';
const AUTOSAVE_SETTLE_MS = 3_500;

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

function exec(dbFile: string, sql: string): void {
  execFileSync('sqlite3', [dbFile, sql], { encoding: 'utf8' });
}

function journalRows(dir: string) {
  return query<{ presentation_id: number }>(
    dbPathIn(dir),
    'SELECT presentation_id FROM presentation_journal'
  );
}

function createdPresentation(dir: string): { id: number; updated_at: number; sections: string } {
  const rows = query<{ id: number; updated_at: number; sections: string }>(
    dbPathIn(dir),
    `SELECT id, updated_at, sections FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

function recoveryDialog(window: Page) {
  return window
    .locator('div')
    .filter({ hasText: 'Recover Unsaved Work' })
    .filter({ has: window.getByRole('button', { name: 'Recover', exact: true }) })
    .last();
}

test.describe('crash recovery journal', () => {
  test('editing writes no journal row — the writer is gone', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await dismissTutorialIfPresent(app.window);
      await app.window.getByRole('button', { name: /blank presentation/i }).click();
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);

      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);

      // The edit is safe in the record instead.
      expect(journalRows(dir)).toEqual([]);
      const sections = JSON.parse(createdPresentation(dir).sections) as Array<{
        slides: unknown[];
      }>;
      expect(sections.reduce((n, s) => n + s.slides.length, 0)).toBe(2);
    } finally {
      await closeApp(app);
    }
  });

  test('a journal left by an older build is still offered and recovered', async () => {
    // Launch once to create a presentation, then seed a journal row against it
    // exactly as a pre-autosave build would have left one.
    const first = await launchApp();
    const dir = first.userDataDir;
    await dismissTutorialIfPresent(first.window);
    await first.window.getByRole('button', { name: /blank presentation/i }).click();
    await sendAppCommand(first, 'file:save');
    await first.window.waitForTimeout(1_000);
    const row = createdPresentation(dir);
    // keepUserData: closeApp deletes the throwaway profile by default, and the
    // next launch has to reuse this one to find the seeded journal.
    await closeApp(first, { keepUserData: true });

    const recovered = JSON.parse(row.sections) as Array<{ slides: unknown[] }>;
    recovered[0]!.slides.push({ ...(recovered[0]!.slides[0] as object), id: 'recovered-slide' });
    const snapshot = JSON.stringify({ id: row.id, title: CREATED_TITLE, sections: recovered });
    exec(
      dbPathIn(dir),
      `INSERT INTO presentation_journal (presentation_id, snapshot, saved_at, base_updated_at)
       VALUES (${row.id}, '${snapshot.replace(/'/g, "''")}', unixepoch(), ${row.updated_at})`
    );
    expect(journalRows(dir)).toHaveLength(1);

    const second = await launchApp({ userDataDir: dir });
    try {
      const dialog = recoveryDialog(second.window);
      await expect(dialog).toBeVisible();
      const labels = (await dialog.getByRole('button').allTextContents()).map((s) => s.trim());
      expect(labels).toEqual(['Later', 'Discard', 'Recover']);

      await dialog.getByRole('button', { name: 'Recover', exact: true }).click();
      await expect(dialog).toBeHidden();
      // Recovered work is unsaved, so autosave commits it to the record.
      await second.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
      const after = JSON.parse(createdPresentation(dir).sections) as Array<{ slides: unknown[] }>;
      expect(after.reduce((n, s) => n + s.slides.length, 0)).toBe(2);
    } finally {
      await closeApp(second);
    }
  });

  test('Discard drops a legacy journal and leaves the record alone', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await dismissTutorialIfPresent(first.window);
    await first.window.getByRole('button', { name: /blank presentation/i }).click();
    await sendAppCommand(first, 'file:save');
    await first.window.waitForTimeout(1_000);
    const row = createdPresentation(dir);
    // keepUserData: closeApp deletes the throwaway profile by default, and the
    // next launch has to reuse this one to find the seeded journal.
    await closeApp(first, { keepUserData: true });

    exec(
      dbPathIn(dir),
      `INSERT INTO presentation_journal (presentation_id, snapshot, saved_at, base_updated_at)
       VALUES (${row.id}, '{"id":${row.id},"sections":[]}', unixepoch(), ${row.updated_at})`
    );

    const second = await launchApp({ userDataDir: dir });
    try {
      const dialog = recoveryDialog(second.window);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
      await expect(dialog).toBeHidden();

      expect(journalRows(dir)).toEqual([]);
      const after = JSON.parse(createdPresentation(dir).sections) as Array<{ slides: unknown[] }>;
      expect(after.reduce((n, s) => n + s.slides.length, 0)).toBe(1);
    } finally {
      await closeApp(second);
    }
  });
});
