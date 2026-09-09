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

// Plan A5, todo 17 — the manual verification click-paths, made mechanical.
//
// Everything else in the A5 suite dirties a document by sending `app:command`,
// which exercises the store but NOT the path a real user takes. These specs
// type on the keyboard instead, and cover the one branch nothing else reaches:
// Discard on a never-saved presentation must DELETE the row, not revert it.
//
// The charter's rule is that a finding ends in a mechanical check or it
// regrows. A manual pass proves the app worked once, on one machine; these
// prove it on every future commit.

const AUTOSAVE_SETTLE_MS = 3_500;
const CREATED_TITLE = 'Untitled Presentation';
const TYPED = 'Welcome to Sunday worship';

function dbPathIn(userDataDir: string): string {
  return path.join(userDataDir, 'presenterpro.db');
}

function query<T = Record<string, unknown>>(dbFile: string, sql: string): T[] {
  const out = execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/** Rows the app created, selected by title — a fresh profile also holds main's seed. */
function createdRows(dir: string) {
  return query<{ sections: string }>(
    dbPathIn(dir),
    `SELECT sections FROM presentations WHERE title = '${CREATED_TITLE}'`
  );
}

/** Every piece of body text in the created presentation, flattened. */
function bodiesInRow(dir: string): string {
  const rows = createdRows(dir);
  expect(rows).toHaveLength(1);
  return JSON.stringify(JSON.parse(rows[0]!.sections));
}

async function sendAppCommand(launched: LaunchedApp, command: string): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, cmd) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', cmd);
  }, command);
}

/**
 * Open a blank presentation and get a caret into its slide.
 *
 * `data-slide-editing` means the slide is SELECTED for editing with its box
 * active — it does not mean there is a caret. The inline contentEditable only
 * mounts on a double-click (`handleTextBoxDoubleClick` in Canvas.jsx), so
 * typing before `data-slide-text-editor` exists goes nowhere. That distinction
 * is exactly what a manual pass would have caught by eye and what the other
 * specs, which never type, cannot see.
 */
async function openBlankAndStartTyping(launched: LaunchedApp): Promise<void> {
  const page = launched.window;
  await dismissTutorialIfPresent(page);
  await page.getByRole('button', { name: /blank presentation/i }).click();
  await expect(page.locator('[data-slide-editing="true"]')).toHaveCount(1, { timeout: 15_000 });

  await page.locator('[data-textbox-root="true"]').first().dblclick();
  await expect(page.locator('[data-slide-text-editor="true"]')).toHaveCount(1, {
    timeout: 10_000,
  });
}

test.describe('autosave, driven by real typing', () => {
  test('typed text reaches the row while the document still reports unsaved', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;
    try {
      await openBlankAndStartTyping(app);
      await sendAppCommand(app, 'file:save');
      await app.window.waitForTimeout(1_000);
      expect(bodiesInRow(dir)).not.toContain(TYPED);

      await app.window.keyboard.type(TYPED);
      await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);

      // Typing goes through updateSlideBody → commitTextBoxMutation, a different
      // store path from insert:newSlide. Autosave must see it too.
      expect(bodiesInRow(dir)).toContain(TYPED);
      // ...and Save still means something.
      await expect(app.window.getByText('Unsaved changes')).toBeVisible();
    } finally {
      await closeApp(app);
    }
  });

  test('a crash mid-sentence keeps the typing, with no recovery prompt', async () => {
    const first = await launchApp();
    const dir = first.userDataDir;
    await openBlankAndStartTyping(first);
    await sendAppCommand(first, 'file:save');
    await first.window.waitForTimeout(1_000);

    await first.window.keyboard.type(TYPED);
    await first.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
    expect(bodiesInRow(dir)).toContain(TYPED);

    await crashApp(first);

    const second = await launchApp({ userDataDir: dir });
    try {
      await second.window.waitForTimeout(2_000);
      // The whole point of retiring the journal: no prompt, the work is there.
      await expect(second.window.getByText('Recover Unsaved Work')).toBeHidden();
      expect(bodiesInRow(dir)).toContain(TYPED);
    } finally {
      await closeApp(second);
    }
  });

  test('Discard on a NEVER-SAVED presentation deletes the row rather than reverting it', async () => {
    const app = await launchApp();
    const dir = app.userDataDir;

    await dismissTutorialIfPresent(app.window);
    await app.window.getByRole('button', { name: /blank presentation/i }).click();
    await expect(app.window.locator('[data-slide-editing="true"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    // Deliberately NO save: requiresInitialSave stays set.
    //
    // Inserting a slide used to clear that flag, because setPresentation resets
    // it unless told otherwise (plan A5, fact 11). With autosave that decides
    // between two DESTRUCTIVE Discard branches — delete the row versus revert
    // it — so this is the case that proves the fix.
    await sendAppCommand(app, 'insert:newSlide');
    await app.window.waitForTimeout(AUTOSAVE_SETTLE_MS);
    expect(createdRows(dir)).toHaveLength(1);

    await app.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const panel = app.window
      .locator('div')
      .filter({ hasText: 'Unsaved Changes' })
      .filter({ has: app.window.getByRole('button', { name: 'Discard', exact: true }) })
      .last();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Discard', exact: true }).click();

    // Discard closes the window, so poll the database rather than the page.
    // The presentation must be GONE — a revert here would leave an unwanted
    // presentation sitting in Recent forever.
    await expect.poll(() => createdRows(dir).length, { timeout: 15_000 }).toBe(0);
  });
});
