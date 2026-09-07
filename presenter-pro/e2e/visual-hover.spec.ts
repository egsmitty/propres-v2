import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import type { Locator, Page } from '@playwright/test';
import { CAPTURE, STRICT, showPresenterPanel } from './fixtures/visual';

// Plan E4b. Every hover look the app draws with a mouse-enter handler,
// captured hovered and clipped to the control (plus a margin), so the
// handlers can become `hover:` classes and be proven unchanged.
//
// Baselines come from the CI runner and the spec is skipped locally unless
// VISUAL=1 — see visual.spec.ts for the why and the local workflow.

const PAD = 12;

async function hovered(page: Page, target: Locator, name: string): Promise<void> {
  await target.hover();
  await page.waitForTimeout(250);
  const box = await target.boundingBox();
  if (!box) throw new Error(`no bounding box for ${name}`);
  const size = page.viewportSize() ?? CAPTURE;
  const x = Math.max(0, box.x - PAD);
  const y = Math.max(0, box.y - PAD);
  const clip = {
    x,
    y,
    width: Math.min(size.width - x, box.width + PAD * 2),
    height: Math.min(size.height - y, box.height + PAD * 2),
  };
  await expect(page).toHaveScreenshot(name, { clip, ...STRICT });
}

test.describe('visual baseline — hover states', () => {
  test('home', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize(CAPTURE);

    // Tutorial close button, before the tour is dismissed.
    await expect(page.getByRole('button', { name: 'Skip Tour' })).toBeVisible({ timeout: 15_000 });
    await hovered(
      page,
      page.getByRole('button', { name: 'Close tutorial' }),
      'hover-tutorial-close.png'
    );
    await dismissTutorialIfPresent(page);
    await page.waitForTimeout(800);

    const sidebar = page.locator('[data-tour="home-sidebar"]');
    await hovered(
      page,
      sidebar.getByRole('button', { name: 'New', exact: true }),
      'hover-home-sidebar-tab.png'
    );
    await hovered(
      page,
      page.getByRole('button', { name: 'Show Tutorial' }),
      'hover-home-show-tutorial.png'
    );
    await hovered(
      page,
      page.getByRole('button', { name: /Basic Worship Service/ }).first(),
      'hover-home-template-card.png'
    );
    // The pin button lives inside the presentation row; hover the row first.
    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.hover();
    await hovered(
      page,
      page.getByRole('button', { name: 'Pin presentation' }).first(),
      'hover-home-pin.png'
    );

    await row.click({ button: 'right' });
    await expect(page.locator('[data-context-menu="true"]')).toBeVisible();
    await hovered(
      page,
      page.locator('[data-context-menu="true"]').getByRole('button', { name: 'Open', exact: true }),
      'hover-context-menu-item.png'
    );
    await page.keyboard.press('Escape');
  });

  test('editor', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize(CAPTURE);
    await dismissTutorialIfPresent(page);
    const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editing]')).toHaveCount(1, { timeout: 15_000 });
    await showPresenterPanel(page);
    await page.waitForTimeout(500);

    // Chrome.
    await hovered(page, page.getByTitle('Back to Home'), 'hover-title-back.png');
    await hovered(
      page,
      page.getByRole('button', { name: 'Rename', exact: true }),
      'hover-title-rename.png'
    );
    await hovered(
      page,
      page.getByRole('button', { name: 'Text Box', exact: true }),
      'hover-toolbar-button.png'
    );
    await hovered(page, page.getByTitle('Present (F5)'), 'hover-toolbar-present.png');
    await hovered(
      page,
      page.getByRole('button', { name: 'Expand All', exact: true }),
      'hover-filmstrip-expand-all.png'
    );
    await hovered(
      page,
      page.getByRole('button', { name: 'Set Background', exact: true }),
      'hover-canvas-set-background.png'
    );
    await hovered(
      page,
      page.locator('[data-resize-handle="columns"]').first(),
      'hover-column-resize.png'
    );
    await hovered(
      page,
      page.locator('[data-resize-handle="presenter-divider"]'),
      'hover-presenter-divider.png'
    );

    // Section header's add-slide button appears on hover of the header.
    const header = page.getByTitle('Add slide to this section').first();
    await header.hover({ force: true });
    await hovered(page, header, 'hover-section-add-slide.png');

    // Menu item, with the View menu open.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await hovered(
      page,
      page.getByRole('button', { name: 'Song Library', exact: true }),
      'hover-menu-item.png'
    );
    // The menu bar does not close on Escape; the trigger toggles it.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Song Library', exact: true })).toBeHidden();

    // Text mode: select the text box.
    await page.locator('[data-textbox-root]').first().click();
    await expect(page.locator('[data-textbox-root][data-selected="true"]')).toHaveCount(1);
    await page.waitForTimeout(400);
    await hovered(page, page.getByTitle('Bold (Cmd/Ctrl+B)'), 'hover-toolbar-icon-button.png');
    await hovered(page, page.getByTitle('Increase font size'), 'hover-toolbar-stepper.png');
    await hovered(page, page.getByTitle('Font family'), 'hover-toolbar-dropdown.png');
    await page.getByTitle('Font size presets').click();
    await hovered(
      page,
      page.getByRole('button', { name: /^\d+$/ }).first(),
      'hover-toolbar-dropdown-item.png'
    );
    await page.keyboard.press('Escape');

    // Song library.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Song Library', exact: true }).click();
    await page.keyboard.press('Escape');
    const songs = page.locator('[data-panel="song-library"]');
    await expect(songs).toBeVisible();
    await hovered(
      page,
      page.getByRole('button', { name: 'Close song library' }),
      'hover-song-library-close.png'
    );
    await hovered(
      page,
      page.getByRole('button', { name: 'New Song', exact: true }),
      'hover-song-library-new.png'
    );
    await hovered(
      page,
      songs.getByRole('button', { name: 'Insert', exact: true }).first(),
      'hover-song-card-insert.png'
    );
    await hovered(page, songs.getByTitle('Edit Song').first(), 'hover-song-card-edit.png');
    await hovered(page, songs.getByTitle('Delete Song').first(), 'hover-song-card-delete.png');
    await hovered(
      page,
      songs.getByTitle('Edit Song').first().locator('..'),
      'hover-song-card-row.png'
    );

    // Song editor close.
    await songs.getByTitle('Edit Song').first().click();
    await expect(page.getByPlaceholder('Song title')).toBeVisible();
    await hovered(
      page,
      page.getByRole('button', { name: 'Close song editor' }),
      'hover-song-editor-close.png'
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Close song library' }).click();

    // Media library close.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Media Library', exact: true }).click();
    await page.keyboard.press('Escape');
    await hovered(
      page,
      page.getByRole('button', { name: 'Close media library' }),
      'hover-media-library-close.png'
    );
    await page.getByRole('button', { name: 'Close media library' }).click();

    // Shortcuts overlay close, through the Help menu (the ? shortcut yields
    // while a text box is selected).
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('button', { name: /^Keyboard Shortcuts/ }).click();
    await expect(page.getByText('Show this overlay')).toBeVisible();
    await hovered(
      page,
      page.getByRole('button', { name: 'Close shortcuts' }),
      'hover-shortcuts-close.png'
    );
    await page.keyboard.press('Escape');
  });
});
