import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';

// Plan E3. The live-operation path with no mouse: open a presentation from
// the keyboard, reach the shortcuts overlay, start and stop presenting.

test.describe('keyboard operability', () => {
  test('a presentation row opens with Enter, ? toggles the overlay, F5/Escape start and stop presenting', async ({
    launched,
  }) => {
    const { app, window: page } = launched;
    await dismissTutorialIfPresent(page);

    // The seeded "Sunday Morning Service" is listed as a keyboard-operable row.
    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editing]')).toHaveCount(1, { timeout: 15_000 });

    // Shortcuts overlay: ? opens, Escape closes.
    await page.keyboard.press('?');
    await expect(page.getByText('Show this overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Show this overlay')).toHaveCount(0);

    // F5 presents (the output window opens); Escape stops (it closes).
    await page.keyboard.press('F5');
    const output = await app.waitForEvent('window', { timeout: 15_000 });
    await output.waitForLoadState('domcontentloaded');
    expect(app.windows()).toHaveLength(2);
    // The presenting flag flips only after the output window's ready handshake;
    // the live banner is the visible signal that Escape will now stop.
    await expect(page.getByText(/^Presenting/)).toBeVisible({ timeout: 15_000 });
    const closed = output.waitForEvent('close', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await closed;
    expect(app.windows()).toHaveLength(1);
  });
});
