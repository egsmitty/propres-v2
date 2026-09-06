import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  launchApp,
  closeApp,
  crashApp,
  dismissTutorialIfPresent,
  type LaunchedApp,
} from './fixtures/launchApp';

// Plan A2: the crash-recovery journal, end to end against the built app. The
// crash is a real SIGKILL of the main process; the journal is inspected from
// outside with the sqlite3 CLI; the document is dirtied through the same
// `app:command` channel the native menu uses, so no canvas typing is needed.

const JOURNAL_SETTLE_MS = 3_500; // > JOURNAL_DEBOUNCE_MS (2s) with margin

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

function journalRows(dir: string) {
  return query<{ presentation_id: number }>(
    dbPathIn(dir),
    'SELECT presentation_id FROM presentation_journal'
  );
}

/**
 * Slide count of the presentation the spec created. A fresh profile also holds
 * the sample presentation main's seed() inserts, so select by the title
 * createNewPresentation assigns rather than assuming a single row.
 */
const CREATED_TITLE = 'Untitled Presentation';
function slideCountOfCreatedPresentation(dir: string): number {
  const rows = query<{ sections: string }>(
    dbPathIn(dir),
    `SELECT sections FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.sections) as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

/** Open a blank presentation and add a slide, so the document is dirty. */
async function makeDirtyPresentation(launched: LaunchedApp): Promise<void> {
  await dismissTutorialIfPresent(launched.window);
  await launched.window.getByRole('button', { name: /blank presentation/i }).click();
  await sendAppCommand(launched, 'insert:newSlide');
  await launched.window.waitForTimeout(JOURNAL_SETTLE_MS);
}

function recoveryDialog(window: Page) {
  return window
    .locator('div')
    .filter({ hasText: 'Recover Unsaved Work' })
    .filter({ has: window.getByRole('button', { name: 'Recover', exact: true }) })
    .last();
}

test.describe('crash recovery', () => {
  test('crash then Recover restores the unsaved edit', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await makeDirtyPresentation(first);
    expect(journalRows(dir)).toHaveLength(1);
    expect(slideCountOfCreatedPresentation(dir)).toBe(1); // nothing saved yet

    await crashApp(first);

    const second = await launchApp({ userDataDir: dir });
    try {
      const dialog = recoveryDialog(second.window);
      await expect(dialog).toBeVisible();
      const labels = (await dialog.getByRole('button').allTextContents()).map((s) => s.trim());
      expect(labels).toEqual(['Later', 'Discard', 'Recover']);

      await dialog.getByRole('button', { name: 'Recover', exact: true }).click();
      await expect(dialog).toBeHidden();
      // Recovered work is unsaved: the journal must survive until a save.
      expect(journalRows(dir)).toHaveLength(1);

      await sendAppCommand(second, 'file:save');
      await second.window.waitForTimeout(1_000);
      expect(journalRows(dir)).toEqual([]);
      expect(slideCountOfCreatedPresentation(dir)).toBe(2);
    } finally {
      await closeApp(second);
    }
  });

  test('crash then Discard drops the journal and leaves the saved record alone', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await makeDirtyPresentation(first);
    await crashApp(first);

    const second = await launchApp({ userDataDir: dir });
    try {
      const dialog = recoveryDialog(second.window);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(journalRows(dir)).toEqual([]);
      expect(slideCountOfCreatedPresentation(dir)).toBe(1);
    } finally {
      await closeApp(second);
    }
  });

  test('a clean save leaves no journal and no prompt on the next launch', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await makeDirtyPresentation(first);
    expect(journalRows(dir)).toHaveLength(1);

    await sendAppCommand(first, 'file:save');
    await first.window.waitForTimeout(1_000);
    expect(journalRows(dir)).toEqual([]);
    await closeApp(first, { keepUserData: true });

    const second = await launchApp({ userDataDir: dir });
    try {
      await second.window.waitForTimeout(2_000);
      await expect(recoveryDialog(second.window)).toHaveCount(0);
    } finally {
      await closeApp(second);
    }
  });
});
