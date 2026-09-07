import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, homeMasks, showPresenterPanel } from './fixtures/visual';

// Plan E2 (surfaces). The on-demand surfaces the three main captures cannot
// see: the tutorial, both library panels, both settings modals, the shortcuts
// overlay, a context menu, and the editor while presenting. Together with
// visual.spec.ts this covers every component that carries inline styles, so
// the inline-style → class refactor (E4) can be proven pixel-for-pixel.
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

test.describe('visual baseline — surfaces', () => {
  test('tutorial, context menu, library panels, settings modals, overlay, presenting', async ({
    launched,
  }) => {
    const { app, window: page } = launched;
    await page.setViewportSize(CAPTURE);

    // 1. Onboarding tutorial, first step, before it is dismissed.
    await expect(page.getByRole('button', { name: 'Skip Tour' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot('tutorial.png', {
      mask: homeMasks(page),
      ...STRICT,
    });
    await dismissTutorialIfPresent(page);
    await page.waitForTimeout(1_000);

    // 2. Context menu on a presentation row.
    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.click({ button: 'right' });
    await expect(page.locator('[data-context-menu="true"]')).toBeVisible();
    await expect(page).toHaveScreenshot('home-context-menu.png', {
      mask: homeMasks(page),
      ...STRICT,
    });
    await page.keyboard.press('Escape');

    // Into the editor.
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);
    await page.waitForTimeout(800);

    const menu = async (menuLabel: string, item: string) => {
      await page.getByRole('button', { name: menuLabel, exact: true }).click({ timeout: 5_000 });
      // Menu items are buttons; panel titles are not, so the role disambiguates.
      const entry = page.getByRole('button', { name: item, exact: true });
      await entry.click({ timeout: 5_000 });
      // The popup can outlive the click; make sure nothing covers the bar.
      if (await entry.isVisible().catch(() => false)) await page.keyboard.press('Escape');
      await expect(entry).toBeHidden({ timeout: 5_000 });
      await page.waitForTimeout(600);
    };

    // 3. Song library panel.
    await menu('View', 'Song Library');
    await expect(page).toHaveScreenshot('editor-song-library.png', STRICT);
    await page.getByRole('button', { name: 'Close song library' }).click();
    await page.waitForTimeout(400);

    // 4. Media library panel.
    await menu('View', 'Media Library');
    await expect(page).toHaveScreenshot('editor-media-library.png', STRICT);
    await page.getByRole('button', { name: 'Close media library' }).click();
    await page.waitForTimeout(400);

    // 5. Presentation settings modal.
    await menu('Edit', 'Presentation Settings…');
    await expect(page).toHaveScreenshot('presentation-settings.png', STRICT);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-backdrop="true"]')).toHaveCount(0);
    await page.waitForTimeout(300);

    // 6. Output settings modal.
    await menu('Edit', 'Output Settings…');
    await expect(page).toHaveScreenshot('output-settings.png', STRICT);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-backdrop="true"]')).toHaveCount(0);
    await page.waitForTimeout(300);

    // 7. Shortcuts overlay.
    await page.keyboard.press('?');
    await expect(page.getByText('Show this overlay')).toBeVisible();
    await expect(page).toHaveScreenshot('shortcuts-overlay.png', STRICT);
    await page.keyboard.press('Escape');

    // 8. The editor while presenting (live banner, presenter panel live state).
    await page.keyboard.press('F5');
    const output = await app.waitForEvent('window', { timeout: 15_000 });
    await output.waitForLoadState('load');
    await expect(page.getByText(/^Presenting/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('editor-presenting.png', STRICT);
    const closed = output.waitForEvent('close', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await closed;
  });
});
