import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { showPresenterPanel } from './fixtures/visual';
import type { Page } from '@playwright/test';

// Plan G2. The presenter's live preview was not 16:9, and no screenshot could
// ever have caught it: all 52 baselines are captured at one window size and one
// panel geometry, and the box is correct there.
//
// This measures the real box instead. `w-full` made the width definite, so
// `aspect-ratio` derived the height and `max-h-full` truncated it — and a
// definite width is never clamped back, because `aspect-ratio` transfers a max
// constraint only into an axis whose size is `auto`. The box therefore kept its
// full width and lost the height the ratio asked for.
//
// It breaks whenever the container is wider than `ratio x its height`, which is
// reachable from BOTH dividers: dragging the panel wider, and dragging the
// panel's own horizontal divider down. Both are asserted — and each one first
// asserts that the geometry actually REACHED that state, so a drag that failed
// to take cannot let the test pass on broken code.

/** The app's own 16:9 default; the seeded presentation uses it. */
const EXPECTED_RATIO = 1920 / 1080;

/** Sub-pixel rounding only. Widening this stops the test testing anything. */
const TOLERANCE = 0.02;

interface PreviewGeometry {
  ratio: number;
  /** True when the container is short-and-wide — the state that used to break. */
  containerIsWiderThanRatio: boolean;
  widthOverflow: number;
  heightOverflow: number;
}

async function openSeededPresentation(page: Page) {
  await dismissTutorialIfPresent(page);
  const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });
  await showPresenterPanel(page);
}

async function measurePreview(page: Page, ratio: number): Promise<PreviewGeometry> {
  const box = page.locator('[data-live-preview="true"]');
  await expect(box).toHaveCount(1);

  const geometry = await box.evaluate((node, expectedRatio) => {
    const parent = node.parentElement;
    if (!parent) return null;
    const rect = node.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      containerIsWiderThanRatio: bounds.width > bounds.height * expectedRatio,
      widthOverflow: rect.width - bounds.width,
      heightOverflow: rect.height - bounds.height,
    };
  }, ratio);

  if (!geometry) throw new Error('the live preview has no parent to measure against');
  return geometry;
}

/** Drag a handle, then let the 200ms width transition settle. */
async function dragHandle(page: Page, selector: string, dx: number, dy: number) {
  const handle = page.locator(selector);
  const rect = await handle.boundingBox();
  if (!rect) throw new Error(`no bounding box for ${selector}`);

  const startX = rect.x + rect.width / 2;
  const startY = rect.y + rect.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Two moves: the first begins the drag, the second lands it.
  await page.mouse.move(startX + dx / 2, startY + dy / 2);
  await page.mouse.move(startX + dx, startY + dy);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

function expectRatio(geometry: PreviewGeometry) {
  // The message carries the measured ratio, so a failure reports the shape the
  // box actually took rather than an abstract difference.
  expect(
    Math.abs(geometry.ratio - EXPECTED_RATIO),
    `measured ${geometry.ratio.toFixed(3)} : 1, expected ${EXPECTED_RATIO.toFixed(3)} : 1`
  ).toBeLessThanOrEqual(TOLERANCE);
  // A letterbox fills one axis and fits within the other; it never exceeds
  // either. One pixel of slack for sub-pixel rounding.
  expect(geometry.widthOverflow).toBeLessThanOrEqual(1);
  expect(geometry.heightOverflow).toBeLessThanOrEqual(1);
}

test.describe('presenter live preview keeps the presentation ratio', () => {
  test('at the default panel geometry', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize({ width: 1600, height: 900 });
    await openSeededPresentation(page);

    expectRatio(await measurePreview(page, EXPECTED_RATIO));
  });

  test('with the panel dragged wide', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize({ width: 1600, height: 900 });
    await openSeededPresentation(page);

    // The presenter panel's own left edge: the second column handle (the first
    // is the filmstrip's). Dragging it left widens the panel.
    await dragHandle(page, '[data-resize-handle="columns"] >> nth=1', -420, 0);

    const geometry = await measurePreview(page, EXPECTED_RATIO);
    // The precondition, asserted rather than assumed: if the drag did not
    // actually make the container short-and-wide, this test proves nothing and
    // must fail as a broken test rather than pass as a green one.
    expect(geometry.containerIsWiderThanRatio).toBe(true);
    expectRatio(geometry);
  });

  test('with the panel divider dragged down', async ({ launched }) => {
    const { window: page } = launched;
    await page.setViewportSize({ width: 1600, height: 900 });
    await openSeededPresentation(page);

    // The other way in, and the one the UX review missed: shrinking the
    // available height breaks the ratio at an ordinary panel width. The divider
    // sits below the preview, so dragging it UP shortens the preview's half.
    await dragHandle(page, '[data-resize-handle="presenter-divider"]', 0, -200);

    const geometry = await measurePreview(page, EXPECTED_RATIO);
    expect(geometry.containerIsWiderThanRatio).toBe(true);
    expectRatio(geometry);
  });
});
