import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, showPresenterPanel } from './fixtures/visual';

// Plan E2 addendum (for E4 slice 7). The last three components outside the
// net: the song editor modal (opened on a library hymn), the shared Dialog
// (the unsaved-changes prompt on the way back Home) and the stage display
// window in windowed preview mode.
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

test.describe('visual baseline — song editor, dialog, stage display', () => {
  test('song editor modal, unsaved-changes dialog, stage display window', async ({ launched }) => {
    const { app, window: page } = launched;
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);

    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);

    // 1. Song editor modal on the first library hymn.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Song Library', exact: true }).click();
    await page.keyboard.press('Escape');
    const panel = page.locator('[data-panel="song-library"]');
    await panel.getByTitle('Edit Song').first().click();
    await expect(page.getByPlaceholder('Song title')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('song-editor-modal.png', STRICT);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByPlaceholder('Song title')).toHaveCount(0);

    // 2. Insert a song so the presentation is dirty; Home asks first.
    await panel.getByRole('button', { name: 'Insert', exact: true }).first().click();
    await expect(page.getByText(/\d+ arranged · \d+ available/)).toBeVisible();
    const closeSongs = page.getByRole('button', { name: 'Close song library' });
    if (await closeSongs.isVisible().catch(() => false)) await closeSongs.click();
    await page.getByTitle('Back to Home').click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dialog-unsaved-changes.png', STRICT);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toHaveCount(0);

    // 3. Stage display window, windowed preview, idle.
    await page.evaluate(() =>
      window.electronAPI.openStageDisplayWindow({ useConfiguredDisplay: false })
    );
    const stage = await app.waitForEvent('window', { timeout: 15_000 });
    await stage.waitForLoadState('load');
    await stage.setViewportSize({ width: 1024, height: 576 });
    await stage.waitForTimeout(1_000);
    await expect(stage).toHaveScreenshot('stage-display.png', { fullPage: false, ...STRICT });
    await page.evaluate(() => window.electronAPI.closeStageDisplayWindow());
  });
});
