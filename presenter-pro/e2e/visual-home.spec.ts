import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { CAPTURE, STRICT, homeMasks } from './fixtures/visual';

// Plan E2 addendum (for E4 slice 1). Home has four sidebar tabs and the
// three main captures only see the first. These cover the rest: the New tab
// (hero template cards), Recent (the longer list), Open (the searchable
// library) and Open with a search that matches nothing (the empty state).
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

test.describe('visual baseline — home tabs', () => {
  test('new, recent, open and open-empty tabs match their baselines', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);
    await page.waitForTimeout(1_000);

    const sidebar = page.locator('[data-tour="home-sidebar"]');
    const tab = async (name: string) => {
      await sidebar.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(600);
    };

    await tab('New');
    await expect(page).toHaveScreenshot('home-new.png', { mask: homeMasks(page), ...STRICT });

    await tab('Recent');
    await expect(page.getByRole('heading', { name: 'Recent Presentations' })).toBeVisible();
    await expect(page).toHaveScreenshot('home-recent.png', { mask: homeMasks(page), ...STRICT });

    // Open is the searchable library: the search field, then the empty state
    // when nothing matches.
    await tab('Open');
    const search = page.getByPlaceholder(/Search presentations/);
    await expect(search).toBeVisible();
    await expect(page).toHaveScreenshot('home-open.png', { mask: homeMasks(page), ...STRICT });

    await search.fill('nothing matches this');
    await expect(page.getByText('No presentations match that search')).toBeVisible();
    await expect(page).toHaveScreenshot('home-open-empty.png', {
      mask: homeMasks(page),
      ...STRICT,
    });
  });
});
