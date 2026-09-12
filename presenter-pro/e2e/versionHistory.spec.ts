import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { test, expect, launchApp, closeApp, dismissTutorialIfPresent } from './fixtures/launchApp';
import type { LaunchedApp } from './fixtures/launchApp';

// Plan A6: Version History, end to end against the built app.
//
// The assertion that matters most is THE INVARIANT — after a restore, the
// newest version must equal the document. Break it and every restored
// presentation opens "Unsaved changes" forever and Revert to Last Save targets
// the wrong thing. The first draft of the plan would have shipped that.

const CREATED_TITLE = 'Untitled Presentation';

function dbPathIn(dir: string): string {
  return path.join(dir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

function presentationId(dir: string): number {
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

/** Slide count of the NEWEST version — the other half of the invariant. */
function newestVersionSlideCount(dir: string): number {
  const rows = query<{ snapshot: string }>(
    dbPathIn(dir),
    `SELECT snapshot FROM presentation_versions
     WHERE presentation_id = ${presentationId(dir)}
     ORDER BY id DESC LIMIT 1`
  );
  expect(rows).toHaveLength(1);
  const sections = JSON.parse(rows[0]!.snapshot).sections as Array<{ slides: unknown[] }>;
  return sections.reduce((n, s) => n + s.slides.length, 0);
}

function versionCount(dir: string): number {
  return query<{ n: number }>(
    dbPathIn(dir),
    `SELECT COUNT(*) AS n FROM presentation_versions WHERE presentation_id = ${presentationId(dir)}`
  )[0]!.n;
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

/** The history panel, located structurally: it owns the Done button. */
function historyPanel(launched: LaunchedApp) {
  return launched.window
    .locator('div')
    .filter({ hasText: 'Version History' })
    .filter({ has: launched.window.getByRole('button', { name: 'Done', exact: true }) })
    .last();
}

async function openHistory(launched: LaunchedApp) {
  await launched.window.getByRole('button', { name: 'File' }).click();
  await launched.window.getByRole('button', { name: /Version History/ }).click();
  await expect(historyPanel(launched)).toBeVisible();
}

/**
 * Restore the OLDEST row and confirm.
 *
 * The row buttons and the confirmation button are both labelled "Restore", so
 * each is scoped to its own container — an unscoped locator would be ambiguous
 * and could click the wrong one.
 */
async function restoreOldest(launched: LaunchedApp): Promise<void> {
  await historyPanel(launched).getByRole('button', { name: 'Restore', exact: true }).last().click();

  const confirm = launched.window
    .locator('div')
    .filter({ hasText: 'Restore Version' })
    .filter({ has: launched.window.getByRole('button', { name: 'Restore', exact: true }) })
    .last();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
}

/** Save, add a slide, save again — leaving three versions of 1, 2 and 3 slides. */
async function buildHistory(launched: LaunchedApp): Promise<void> {
  await dismissTutorialIfPresent(launched.window);
  await launched.window.getByRole('button', { name: /blank presentation/i }).click();
  await expect(launched.window.locator('[data-slide-editing="true"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  await sendAppCommand(launched, 'file:save');
  await launched.window.waitForTimeout(1_200);

  for (let i = 0; i < 2; i += 1) {
    await sendAppCommand(launched, 'insert:newSlide');
    await launched.window.waitForTimeout(600);
    await sendAppCommand(launched, 'file:save');
    await launched.window.waitForTimeout(1_200);
  }
}

test.describe('version history', () => {
  test('lists a version per save, newest first', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await buildHistory(app);
      expect(versionCount(dir)).toBe(3); // open + two saves that changed content

      await openHistory(app);
      await expect(app.window.locator('[data-version-row]')).toHaveCount(3);
      await expect(app.window.getByText('Current')).toBeVisible();
    } finally {
      await closeApp(app);
    }
  });

  test('restoring an older version changes the document AND keeps the invariant', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await buildHistory(app);
      expect(slideCount(dir)).toBe(3);

      await openHistory(app);
      // The oldest row is the one-slide version from before either insert.
      await restoreOldest(app);
      await expect.poll(() => slideCount(dir), { timeout: 15_000 }).toBe(1);

      // THE INVARIANT: the newest version must equal the document, or the
      // presentation opens dirty forever and Revert targets the wrong state.
      expect(newestVersionSlideCount(dir)).toBe(1);
    } finally {
      await closeApp(app);
    }
  });

  test('restoring is undoable: the pre-restore state stays reachable', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await buildHistory(app);
      const before = versionCount(dir);

      await openHistory(app);
      await restoreOldest(app);
      await expect.poll(() => slideCount(dir), { timeout: 15_000 }).toBe(1);

      // The three-slide state is preserved as a version, so it can be restored
      // back — that is what "restoring is undoable" means here.
      expect(versionCount(dir)).toBeGreaterThan(before);
      const snapshots = query<{ snapshot: string }>(
        dbPathIn(dir),
        `SELECT snapshot FROM presentation_versions WHERE presentation_id = ${presentationId(dir)}`
      );
      const counts = snapshots.map((r) => {
        const sections = JSON.parse(r.snapshot).sections as Array<{ slides: unknown[] }>;
        return sections.reduce((n, s) => n + s.slides.length, 0);
      });
      expect(counts).toContain(3);
    } finally {
      await closeApp(app);
    }
  });

  test('is disabled while presenting', async () => {
    const app = await launchApp();
    try {
      await buildHistory(app);
      await sendAppCommand(app, 'present:start');
      await app.window.waitForTimeout(1_500);

      await app.window.getByRole('button', { name: 'File' }).click();
      // Restoring mid-service would leave the output on a slide that no longer
      // exists and send the next spacebar to slide 1 of the deck.
      await expect(app.window.getByRole('button', { name: /Version History/ })).toBeDisabled();
    } finally {
      await closeApp(app);
    }
  });
});
