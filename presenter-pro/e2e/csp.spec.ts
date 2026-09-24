import path from 'node:path';
import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import type { Page } from '@playwright/test';

// Plan C2. The built renderer declares a Content-Security-Policy, and the
// app's real flows produce no violation under it: Home, the editor with a
// real image set as a slide background (served through the app's own media
// scheme), the output window and the stage display.

const CSP_NOISE = /Content.Security.Policy|Refused to|violates the following/i;

function listen(page: Page, sink: string[], label: string): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning')
      sink.push(`${label} [${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => sink.push(`${label} [pageerror] ${err.message}`));
}

test.describe('renderer Content-Security-Policy', () => {
  test('the built app declares a policy and its flows raise no violation', async ({ launched }) => {
    const { app, window: page } = launched;
    const messages: string[] = [];
    listen(page, messages, 'main');
    await page.setViewportSize({ width: 1200, height: 660 });

    const meta = await page.evaluate(
      () =>
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? null
    );
    expect(meta, 'the built index.html carries a CSP meta').not.toBeNull();
    expect(meta).toContain("script-src 'self'");

    await dismissTutorialIfPresent(page);
    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });

    // A real image through the media scheme, as a slide background.
    const icon = path.resolve(__dirname, '..', 'public', 'icons', 'app-icon.png');
    await page.evaluate(async (file) => {
      await window.electronAPI.createMedia({ name: 'Icon', type: 'image', file_path: file });
    }, icon);
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Media Library', exact: true }).click();
    // The View menu closes on the click; press Escape only if its entry lingers.
    // An unconditional Escape would now close the media library itself (P4).
    const mediaEntry = page.getByRole('button', { name: 'Media Library', exact: true });
    if (await mediaEntry.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    const card = page.getByTitle('Icon');
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toBeVisible();
    await card.click();
    // The detail pane's explicit action (plan #155-P4) closes the library itself.
    await page.getByRole('button', { name: 'Set slide background', exact: true }).click();
    const closeMedia = page.getByRole('button', { name: 'Close media library' });
    if (await closeMedia.isVisible().catch(() => false)) await closeMedia.click();
    await page.waitForTimeout(500);

    // Output window and stage display, both from the same built HTML.
    // Listen before opening, or a fast window's event is missed (plan E2E1).
    const outputOpened = app.waitForEvent('window', { timeout: 15_000 });
    await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false }));
    const output = await outputOpened;
    listen(output, messages, 'output');
    await output.waitForLoadState('load');
    expect(
      await output.evaluate(() =>
        Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))
      )
    ).toBe(true);
    const stageOpened = app.waitForEvent('window', { timeout: 15_000 });
    await page.evaluate(() =>
      window.electronAPI.openStageDisplayWindow({ useConfiguredDisplay: false })
    );
    const stage = await stageOpened;
    listen(stage, messages, 'stage');
    await stage.waitForLoadState('load');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.electronAPI.closeStageDisplayWindow());
    await page.evaluate(() => window.electronAPI.stopPresenting());

    const violations = messages.filter((m) => CSP_NOISE.test(m));
    expect(violations, 'no CSP violation and no Electron CSP warning').toEqual([]);
  });
});
