import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, homeMasks, showPresenterPanel } from './fixtures/visual';

// Plan E2 — the screenshot baseline that makes style refactors verifiable.
// Three screens at the app's default window sizes: Home, the editor with the
// seeded presentation, and the output window in windowed preview mode.
//
// Baselines in e2e/visual.spec.ts-snapshots/ are produced by the CI runner
// (E2E workflow → "Run workflow" with update_baselines), never by a laptop:
// scrollbar style, font hinting and the OS account name all differ between
// machines. Locally the spec is skipped unless VISUAL=1; run it with
// --update-snapshots before a refactor and VISUAL_STRICT=1 after to prove the
// refactor changed nothing — see tasks/plan-E2-screenshot-baseline.md.

test.describe('visual baseline', () => {
  test('home, editor, and output window match their baselines', async ({ launched }) => {
    const { app, window: page } = launched;
    // Deterministic geometry: CI runners have small displays and Electron clamps
    // the 1400×800 default window to fit, so the capture size is pinned.
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);
    await page.waitForTimeout(1_500); // seeding + thumbnails settle

    await expect(page).toHaveScreenshot('home.png', {
      mask: homeMasks(page),
      fullPage: false,
      ...STRICT,
    });

    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);
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
