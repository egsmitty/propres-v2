import type { Page } from '@playwright/test';
import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';

// phase7 finding #11: a renderer `beforeunload` guard silently vetoed every
// close with no dialog. This proves the STYLED Unsaved Changes dialog (the
// main-process handshake → DialogHost) actually appears, offers exactly the
// three expected actions, and that Cancel leaves the window alive.

/** Exact, ordered button labels of the Unsaved Changes dialog. */
const EXPECTED_ACTIONS = ['Cancel', 'Discard', 'Save'];

/**
 * A freshly created blank presentation has `requiresInitialSave` set, so it
 * already counts as unsaved — no canvas typing needed, which removes the most
 * fragile step this spec could have.
 */
async function openBlankPresentation(window: Page): Promise<void> {
  await dismissTutorialIfPresent(window);
  await window.getByRole('button', { name: /blank presentation/i }).click();
}

/**
 * The dialog has no landmark role, so locate its panel structurally: the
 * innermost element that contains both the title and a Discard button.
 */
function dialogPanel(window: Page) {
  return window
    .locator('div')
    .filter({ hasText: 'Unsaved Changes' })
    .filter({ has: window.getByRole('button', { name: 'Discard', exact: true }) })
    .last();
}

test.describe('unsaved changes', () => {
  test('closing the window prompts with exactly Cancel / Discard / Save', async ({ launched }) => {
    await openBlankPresentation(launched.window);

    await launched.app.evaluate(({ BrowserWindow }) => {
      const [main] = BrowserWindow.getAllWindows();
      main?.close();
    });

    const panel = dialogPanel(launched.window);
    await expect(panel).toBeVisible();

    // Order and count both matter — compare the whole list, never toContain.
    const labels = (await panel.getByRole('button').allTextContents()).map((s) => s.trim());
    expect(labels).toEqual(EXPECTED_ACTIONS);
  });

  test('Cancel keeps the window open', async ({ launched }) => {
    await openBlankPresentation(launched.window);

    await launched.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });

    const panel = dialogPanel(launched.window);
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel).toBeHidden();

    expect(launched.window.isClosed()).toBe(false);
    expect(launched.app.windows()).toHaveLength(1);
  });

  test('Cancel on a quit keeps the app running', async ({ launched }) => {
    // The deferred-quit path: before-quit hands off to the same handshake, and
    // cancelling must cancel the QUIT, not just the window close — otherwise a
    // later window close would silently end the app.
    await openBlankPresentation(launched.window);

    let exited = false;
    launched.app.on('close', () => {
      exited = true;
    });

    await launched.app.evaluate(({ app }) => app.quit());

    const panel = dialogPanel(launched.window);
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel).toBeHidden();

    // Give a wrongly-uncancelled quit time to happen, then assert it did not.
    await launched.window.waitForTimeout(1_500);
    expect(exited).toBe(false);
    expect(launched.window.isClosed()).toBe(false);
  });
});
