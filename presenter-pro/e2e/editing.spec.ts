import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';

// Plan D2 slice 4. The "enter editing when an empty slide is selected"
// decision moved from a Canvas effect into the editor store. This drives it
// through the real UI: mount case, explicit exit, insert-without-editing,
// and re-entry by navigating back onto the empty slide.

// The store's "editing" state is reflected on the canvas root; the selected
// text box on its root. (The inline contentEditable only opens on a
// double-click or Enter — that is a different, later step.)
const EDITING = '[data-text-editing="true"]';
const SELECTED_BOX = '[data-textbox-root="true"][data-selected="true"]';

test.describe('slide text editing', () => {
  test('a blank presentation opens editing its empty slide; a new slide is selected but not edited; navigating back re-enters editing', async ({
    launched,
  }) => {
    const { window: page } = launched;
    await dismissTutorialIfPresent(page);

    await page.getByRole('button', { name: /blank presentation/i }).click();
    // Mount case: the blank presentation's single empty slide is in text-editing
    // mode with its one box selected.
    await expect(page.locator(EDITING)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(SELECTED_BOX)).toHaveCount(1);

    // Insert → New Slide selects the new (empty) slide WITHOUT editing it,
    // but with its box selected so the toolbar has a target.
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByText('New Slide', { exact: true }).click();
    await expect(page.locator(EDITING)).toHaveCount(0);
    await expect(page.locator(SELECTED_BOX)).toHaveCount(1);

    // Navigating back onto the empty first slide re-enters editing.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(EDITING)).toHaveCount(1, { timeout: 5_000 });
  });
});
