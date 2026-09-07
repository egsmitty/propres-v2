import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, showPresenterPanel } from './fixtures/visual';

// Plan E2 addendum (for E4 slice 3). The editor capture sees one state: a
// slide, nothing selected. The canvas has three more states that carry
// their own styling: a text box selected (resize and rotation handles), a song section linked to a library song (the song
// order tray replaces the background footer), and a slide whose background
// media file is missing (the canvas overlay).
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

test.describe('visual baseline — editor states', () => {
  test('selected text box, song order tray, missing background media', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);

    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);

    // 1. A selected text box, not editing: the resize and rotation handles.
    await page.locator('[data-textbox-root]').first().click();
    await expect(page.locator('[data-textbox-root][data-selected="true"]')).toHaveCount(1);
    // A box with content selects without opening the inline editor. (The
    // canvas root's data-text-editing flag means "this slide is the one being
    // edited", not "the inline text editor is open".)
    await expect(page.locator('[data-slide-text-editor]')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('editor-textbox-selected.png', STRICT);

    // 2. Insert a library song: the new section is linked, so the song order
    //    tray renders under the canvas.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Song Library', exact: true }).click();
    await page.keyboard.press('Escape');
    const panel = page.locator('[data-panel="song-library"]');
    await panel.getByRole('button', { name: 'Insert', exact: true }).first().click();
    await expect(page.getByText(/\d+ arranged · \d+ available/)).toBeVisible();
    // Inserting closes the panel by itself when it can; close it if it stayed.
    const closeSongs = page.getByRole('button', { name: 'Close song library' });
    if (await closeSongs.isVisible().catch(() => false)) await closeSongs.click();
    await expect(closeSongs).toHaveCount(0);
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('editor-song-order-tray.png', STRICT);

    // 3. A missing media file as the slide background: the canvas overlay.
    await page.evaluate(async () => {
      await window.electronAPI.createMedia({
        name: 'Sunrise',
        type: 'image',
        file_path: '/nonexistent/presenterpro-e2e/sunrise.png',
      });
    });
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Media Library', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByTitle('Sunrise').click();
    await page.getByRole('button', { name: 'Use', exact: true }).click();
    await page.getByRole('button', { name: 'Set Slide Background', exact: true }).click();
    const closeMedia = page.getByRole('button', { name: 'Close media library' });
    if (await closeMedia.isVisible().catch(() => false)) await closeMedia.click();
    await expect(closeMedia).toHaveCount(0);
    // The tray hides so the canvas (and its overlay) is in view; this also
    // captures the tray's collapsed header.
    await page.getByRole('button', { name: /Hide$/ }).click();
    await expect(page.getByText('Missing media file')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('editor-missing-background.png', STRICT);
  });
});
