import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';

// Plan E2 — the screenshot baseline that makes style refactors verifiable.
// Three screens at the app's default window sizes: Home, the editor with the
// seeded presentation, and the output window in windowed preview mode.
// Baselines live in e2e/visual.spec.ts-snapshots/ (per platform) and are
// updated deliberately with `npx playwright test e2e/visual.spec.ts
// --update-snapshots` when a change is *meant* to be visible.

/** Row dates ("Sep 6, 2026") change daily; they are masked, not compared. */
const DATE_TEXT = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
/** VISUAL_STRICT=1: exact comparison (0 differing pixels) for verifying refactors locally. */
const STRICT = process.env.VISUAL_STRICT === '1' ? { maxDiffPixels: 0 } : {};

test.describe('visual baseline', () => {
  test('home, editor, and output window match their baselines', async ({ launched }) => {
    const { app, window: page } = launched;
    // Deterministic geometry: CI runners have small displays and Electron clamps
    // the 1400×800 default window to fit, so the capture size is pinned to a
    // content size every machine can honour (the app's minimum is 1200×700).
    await page.setViewportSize({ width: 1200, height: 660 });
    await dismissTutorialIfPresent(page);
    await page.waitForTimeout(1_500); // seeding + thumbnails settle

    await expect(page).toHaveScreenshot('home.png', {
      mask: [page.getByText(DATE_TEXT)],
      fullPage: false,
      ...STRICT,
    });

    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editing]')).toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(1_000);
    await expect(page).toHaveScreenshot('editor.png', { fullPage: false, ...STRICT });

    await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false }));
    const output = await app.waitForEvent('window', { timeout: 15_000 });
    await output.waitForLoadState('load');
    await output.setViewportSize({ width: 1024, height: 576 });
    await output.waitForTimeout(1_000);
    await expect(output).toHaveScreenshot('output.png', { fullPage: false, ...STRICT });

    await page.evaluate(() => window.electronAPI.stopPresenting());
  });
});
