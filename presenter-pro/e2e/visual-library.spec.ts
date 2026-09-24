import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, showPresenterPanel } from './fixtures/visual';

// Plan E2 addendum (for E4 slice 2), re-expressed for the modal library (plan
// #155-P4). The media library capture in visual-surfaces.spec.ts sees an empty
// library; most of the surface only renders with a folder and an item present:
// the folder tile, the item tile (selected, with the missing-file placeholder),
// the detail pane's actions, and the inside of a folder with its breadcrumb and
// Move-up tile. The item's file does not exist on purpose — the placeholder is
// deterministic, an image would not be.
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

test.describe('visual baseline — media library states', () => {
  test('a folder and an item, selected; then inside the folder', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);

    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);

    // Seed through the same door the app uses; the panel loads on open.
    await page.evaluate(async () => {
      await window.electronAPI.createMediaFolder({ name: 'Backgrounds' });
      await window.electronAPI.createMedia({
        name: 'Sunrise',
        type: 'image',
        file_path: '/nonexistent/presenterpro-e2e/sunrise.png',
      });
    });

    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Media Library', exact: true }).click();
    // The View menu closes on the click; press Escape only if its entry lingers.
    // An unconditional Escape would now close the media library itself (P4).
    const mediaEntry = page.getByRole('button', { name: 'Media Library', exact: true });
    if (await mediaEntry.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close media library' })).toBeVisible();
    await expect(page.getByText('Missing File')).toBeVisible();

    await page.getByTitle('Sunrise').click();
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('editor-media-library-items.png', STRICT);

    // A single click opens a folder tile; the Move-up tile marks being inside it.
    await page.getByText('Backgrounds', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Move up' })).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('editor-media-library-folder.png', STRICT);
  });
});
