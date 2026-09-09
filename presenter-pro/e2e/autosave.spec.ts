import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  test,
  expect,
  launchApp,
  closeApp,
  crashApp,
  dismissTutorialIfPresent,
} from './fixtures/launchApp';
import type { LaunchedApp } from './fixtures/launchApp';

// Plan A5 slice 2: autosave, end to end against the built app. The row is
// inspected from outside with the sqlite3 CLI, as e2e/recovery.spec.ts does.

/** > AUTOSAVE_DEBOUNCE_MS (2s), with margin. Mirrors recovery.spec's JOURNAL_SETTLE_MS. */
const AUTOSAVE_SETTLE_MS = 3_500;

const CREATED_TITLE = 'Untitled Presentation';

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/** A fresh profile also holds main's seeded sample presentation, so select by title. */
function slideCount(dir: string): number {
  const rows = query<{ sections: string }>(
    dbPathIn(dir),
    `SELECT sections FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.sections) as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

function latestVersionSlideCount(dir: string): number {
  const rows = query<{ snapshot: string }>(
    dbPathIn(dir),
    `SELECT v.snapshot FROM presentation_versions v
     JOIN presentations p ON p.id = v.presentation_id
     WHERE p.title = '${CREATED_TITLE}'
     ORDER BY v.id DESC LIMIT 1`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.snapshot).sections as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

/**
 * Open a blank presentation and SAVE it, so `requiresInitialSave` is cleared.
 * Without that first save, Discard takes the delete branch rather than revert.
 */
async function openAndSave(launched: LaunchedApp): Promise<void> {
  await dismissTutorialIfPresent(launched.window);
  await launched.window.getByRole('button', { name: /blank presentation/i }).click();
  await sendAppCommand(launched, 'file:save');
  await launched.window.waitForTimeout(1_000);
}

function unsavedDialog(launched: LaunchedApp) {
  return launched.window
    .locator('div')
    .filter({ hasText: 'Unsaved Changes' })
    .filter({ has: launched.window.getByRole('button', { name: 'Discard', exact: true }) })
    .last();
}

test.describe('autosave', () => {
  test('reaches the row while the document still reports unsaved', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openAndSave(app);
      expect(slideCount(dir)).toBe(1);

      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);

      // The edit is in the record...
      expect(slideCount(dir)).toBe(2);
      // ...but Save still means something: the document is not committed.
      await expect(app.window.getByText('Unsaved changes')).toBeVisible();
    } finally {
      await closeApp(app);
    }
  });

  test('a crash keeps the work, with no recovery prompt', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await openAndSave(first);
    await sendAppCommand(first, 'insert:newSlide');
    await first.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
    expect(slideCount(dir)).toBe(2);

    await crashApp(first);

    const second = await launchApp({ userDataDir: dir });
    try {
      await second.window.waitForTimeout(2_000);
      // Autosave replaces the journal's prompt: the work is simply there.
      await expect(second.window.getByText('Recover Unsaved Work')).toBeHidden();
      expect(slideCount(dir)).toBe(2);
    } finally {
      await closeApp(second);
    }
  });

  test('Discard reverts the row to the last save', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;

    await openAndSave(app);
    await sendAppCommand(app, 'insert:newSlide');
    await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
    expect(slideCount(dir)).toBe(2);

    await app.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const dialog = unsavedDialog(app);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();

    // Discard closes the window, so the revert lands as the app is going away.
    // Poll the database rather than the page — waiting on a destroyed window
    // throws, and that failure would look like a product bug.
    // Discard is honest again: the autosaved edit is undone in the record.
    await expect.poll(() => slideCount(dir), { timeout: 15_000 }).toBe(1);
  });

  test('Save commits a version that matches the live row', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openAndSave(app);
      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
      expect(latestVersionSlideCount(dir)).toBe(1); // autosave never versions

      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_500);

      expect(latestVersionSlideCount(dir)).toBe(2);
      expect(slideCount(dir)).toBe(2);
    } finally {
      await closeApp(app);
    }
  });
});
