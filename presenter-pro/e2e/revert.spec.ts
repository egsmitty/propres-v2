import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { test, expect, launchApp, closeApp, dismissTutorialIfPresent } from './fixtures/launchApp';
import type { LaunchedApp } from './fixtures/launchApp';

// Plan A5 slice 1: restore points and File ▸ Revert to Last Save, end to end
// against the built app. The database is inspected from outside with the
// sqlite3 CLI, as e2e/recovery.spec.ts does.
//
// The menu is driven through the IN-APP MenuBar rather than `app:command`,
// because two of these cases assert the item is *disabled* — a state only the
// in-app menu exposes. Playwright cannot inspect a native macOS menu.

const CREATED_TITLE = 'Untitled Presentation';

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/**
 * A fresh profile also holds the sample presentation main's seed() inserts, so
 * select by the title createNewPresentation assigns rather than assuming one row.
 */
function createdPresentationId(dir: string): number {
  const rows = query<{ id: number }>(
    dbPathIn(dir),
    `SELECT id FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

function slideCount(dir: string): number {
  const rows = query<{ sections: string }>(
    dbPathIn(dir),
    `SELECT sections FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.sections) as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

/** Slide count of the NEWEST version — the other half of THE INVARIANT. */
function newestVersionSlideCount(dir: string): number {
  const rows = query<{ snapshot: string }>(
    dbPathIn(dir),
    `SELECT snapshot FROM presentation_versions
     WHERE presentation_id = ${createdPresentationId(dir)}
     ORDER BY id DESC LIMIT 1`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.snapshot).sections as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

function versionCount(dir: string): number {
  const id = createdPresentationId(dir);
  const rows = query<{ n: number }>(
    dbPathIn(dir),
    `SELECT COUNT(*) AS n FROM presentation_versions WHERE presentation_id = ${id}`
  );
  return rows[0]!.n;
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

/** Open the in-app File menu and return the Revert item. */
async function fileMenuRevertItem(launched: LaunchedApp) {
  await launched.window.getByRole('button', { name: 'File' }).click();
  return launched.window.getByRole('button', { name: /Revert to Last Save/ });
}

async function openBlankPresentation(launched: LaunchedApp): Promise<void> {
  await dismissTutorialIfPresent(launched.window);
  await launched.window.getByRole('button', { name: /blank presentation/i }).click();
}

function revertDialog(launched: LaunchedApp) {
  return launched.window
    .locator('div')
    .filter({ hasText: 'Revert to Last Save' })
    .filter({ has: launched.window.getByRole('button', { name: 'Revert', exact: true }) })
    .last();
}

test.describe('revert to last save', () => {
  test('reverts the row to the last saved state', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openBlankPresentation(app);
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      expect(slideCount(dir)).toBe(1);

      await sendAppCommand(app, 'insert:newSlide');
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      expect(slideCount(dir)).toBe(2);

      // Now dirty again, one slide further on.
      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(500);

      const item = await fileMenuRevertItem(app);
      await expect(item).toBeEnabled();
      await item.click();

      const dialog = revertDialog(app);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Revert', exact: true }).click();
      await app.window.waitForTimeout(1_000);

      expect(slideCount(dir)).toBe(2);
    } finally {
      await closeApp(app);
    }
  });

  test('cancelling the confirmation changes nothing', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openBlankPresentation(app);
      // Each app:command is async in the renderer; give every one time to land
      // before the next, or a save can commit before the insert it follows.
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(500);
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      expect(slideCount(dir)).toBe(2);

      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(500);

      const item = await fileMenuRevertItem(app);
      await item.click();
      const dialog = revertDialog(app);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await app.window.waitForTimeout(500);

      expect(slideCount(dir)).toBe(2);
    } finally {
      await closeApp(app);
    }
  });

  test('is disabled immediately after a save', async () => {
    const app = await launchApp();
    try {
      await openBlankPresentation(app);
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);

      await expect(await fileMenuRevertItem(app)).toBeDisabled();
    } finally {
      await closeApp(app);
    }
  });

  test('is disabled on a presentation that has never been saved', async () => {
    const app = await launchApp();
    try {
      await openBlankPresentation(app);
      // requiresInitialSave is set: there is no last save to revert to.
      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(500);

      await expect(await fileMenuRevertItem(app)).toBeDisabled();
    } finally {
      await closeApp(app);
    }
  });

  test('a revert preserves the pre-revert state AND re-anchors the newest version', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openBlankPresentation(app);
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      // Opening captured the first restore point; a content-identical save
      // appends nothing, which is what keeps reflexive Cmd-S from pruning.
      const afterFirstSave = versionCount(dir);
      expect(afterFirstSave).toBe(1);

      await sendAppCommand(app, 'insert:newSlide');
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      expect(versionCount(dir)).toBe(2);

      await sendAppCommand(app, 'insert:newSlide');
      await app.window.waitForTimeout(500);
      const item = await fileMenuRevertItem(app);
      await item.click();
      await revertDialog(app).getByRole('button', { name: 'Revert', exact: true }).click();
      await app.window.waitForTimeout(1_000);

      // BEHAVIOUR CHANGE (plan A6). A5's rule was "reverting never appends".
      // A revert now writes TWO rows: the pre-revert state, so the revert is
      // itself recoverable, and the restored content, which is what keeps THE
      // INVARIANT — the newest version must equal the document, or this
      // presentation opens "Unsaved changes" forever and Revert to Last Save
      // starts targeting the state it just discarded.
      expect(versionCount(dir)).toBe(4);
      expect(newestVersionSlideCount(dir)).toBe(slideCount(dir));
    } finally {
      await closeApp(app);
    }
  });
});
