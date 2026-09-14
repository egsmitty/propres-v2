import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';
import { showPresenterPanel } from './fixtures/visual';
import type { Page } from '@playwright/test';

// Plan ED36. One slide, drawn at several sizes, must be the SAME slide: the
// same box geometry in native space, the same computed text styles, and the
// same number of wrapped lines. Before this plan each site scaled its own
// numbers (and clamped padding to a screen-pixel floor), so a thumbnail could
// wrap a lyric where the wall did not.
//
// Every site renders through `SlideRender`, which lays the slide out at native
// size and scales the stage with one transform. So dividing a box's screen
// rect by the site's scale must give the same native rect everywhere, and
// computed styles (which ignore transforms) must be identical strings.
//
// This spec cannot run against the old code — its seams did not exist — so it
// lands green. Its red is the measured plan table: on the old code the
// filmstrip thumbnail's padding computed to `4px 4px 4px 4px` and the
// presenter grid's to `5px 7px 5px 7px` (each site had its own screen-pixel
// floor), with font sizes that differed by rounding.
//
// Preconditions: the seeded presentation is open (its first slide selected),
// the presenter panel is shown (the live preview and the grid do not exist
// otherwise) and the Service Order is expanded (a collapsed section has no
// thumbnails — the first CI run failed on exactly that).
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

/** Native-space geometry may differ by sub-pixel rounding only. */
const GEOMETRY_TOLERANCE_PX = 1;

/** The editor-window sites compared; the reference is the first. The projector
 *  (`output`, in its own window) is added in the test body — slice 2. */
const SITES = ['thumbnail', 'presenter-live', 'presenter-grid'] as const;

interface BoxFacts {
  id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  padding: string;
  textShadow: string;
  boxShadow: string;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  lines: number;
}

interface SiteFacts {
  scale: number;
  boxes: BoxFacts[];
}

async function openSeededPresentation(page: Page) {
  await dismissTutorialIfPresent(page);
  const row = page.getByRole('button', { name: /Sunday Morning Service/ }).first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-slide-editing]')).toHaveCount(1, { timeout: 15_000 });
  await showPresenterPanel(page);
  // Precondition: the Service Order starts with every section collapsed, and a
  // collapsed section mounts no thumbnails (`Filmstrip.jsx`, plan D2 #9).
  await page.getByRole('button', { name: 'Expand All', exact: true }).click();
  await expect(page.locator('[data-slide-render="thumbnail"]').first()).toBeVisible({
    timeout: 15_000,
  });
}

async function measureSite(page: Page, site: string): Promise<SiteFacts> {
  const frame = page.locator(`[data-slide-render="${site}"]`).first();
  // The stage is hidden (and the scale empty) until the frame is measured.
  await expect(frame).toHaveAttribute('data-slide-scale', /^[0-9.]+$/, { timeout: 15_000 });

  return frame.evaluate((node) => {
    const round1 = (value: number) => Math.round(value * 10) / 10;
    const scale = Number(node.getAttribute('data-slide-scale'));
    const stage = node.querySelector('[data-slide-stage]');
    if (!stage) throw new Error(`no stage inside ${node.getAttribute('data-slide-render')}`);
    const origin = stage.getBoundingClientRect();

    const boxes = Array.from(node.querySelectorAll('[data-textbox-view]')).map((box) => {
      const rect = box.getBoundingClientRect();
      const content = box.firstElementChild as HTMLElement | null;
      if (!content) throw new Error('a text box has no content element');
      const style = getComputedStyle(content);
      // Rendered lines = clusters of client-rect tops. The range also yields a
      // rect for the wrapping block (whose top is the first line's, give or
      // take sub-pixel jitter), so tops closer than half a line are one line.
      // Client rects are in screen space (already scaled): a native line of
      // `lineHeight` px is `lineHeight * scale` px apart here.
      const range = document.createRange();
      range.selectNodeContents(content);
      const halfLine = (Number.parseFloat(style.lineHeight) * scale) / 2;
      const tops = Array.from(range.getClientRects())
        .filter((line) => line.height > 0)
        .map((line) => line.top)
        .sort((a, b) => a - b);
      let lines = 0;
      let lastTop = Number.NEGATIVE_INFINITY;
      for (const top of tops) {
        if (top - lastTop > halfLine) lines += 1;
        lastTop = top;
      }
      return {
        id: box.getAttribute('data-text-box-id'),
        x: round1((rect.left - origin.left) / scale),
        y: round1((rect.top - origin.top) / scale),
        w: round1(rect.width / scale),
        h: round1(rect.height / scale),
        padding: style.padding,
        textShadow: style.textShadow,
        boxShadow: style.boxShadow,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontFamily: style.fontFamily,
        lines,
      };
    });
    return { scale, boxes };
  });
}

function styleFacts(box: BoxFacts) {
  const { x, y, w, h, ...rest } = box;
  void x;
  void y;
  void w;
  void h;
  return rest;
}

test.describe('render fidelity', () => {
  test('the same slide has the same boxes, styles and line count at every site', async ({
    launched,
  }) => {
    const { app, window: page } = launched;
    await openSeededPresentation(page);

    const measured = new Map<string, SiteFacts>();
    for (const site of SITES) {
      measured.set(site, await measureSite(page, site));
    }

    // Slice 2: the projector. Listen for the window BEFORE pressing F5 (plan
    // E2E1), then wait for the live banner — the presenting flag flips only
    // after the output window's ready handshake.
    const opened = app.waitForEvent('window', { timeout: 15_000 });
    await page.keyboard.press('F5');
    const output = await opened;
    await output.waitForLoadState('domcontentloaded');
    await expect(page.getByText(/^Presenting/)).toBeVisible({ timeout: 15_000 });
    measured.set('output', await measureSite(output, 'output'));

    const reference = measured.get(SITES[0])!;

    // Structural floor: the seeded first slide has one box with four lines of
    // "Amazing Grace". An empty measurement means the harness failed, never
    // that the slide has no text.
    expect(reference.scale).toBeGreaterThan(0);
    expect(reference.boxes).toHaveLength(1);
    expect(reference.boxes[0]!.lines).toBeGreaterThanOrEqual(2);

    const others = [...SITES.slice(1), 'output'];
    expect(others).toHaveLength(3);
    for (const site of others) {
      const facts = measured.get(site)!;
      expect(facts.scale, site).toBeGreaterThan(0);
      // Exact: the same number of boxes, in the same order, with identical
      // computed styles and line counts.
      expect(facts.boxes.map(styleFacts), site).toEqual(reference.boxes.map(styleFacts));
      facts.boxes.forEach((box, index) => {
        const expected = reference.boxes[index]!;
        for (const key of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(box[key] - expected[key]), `${site} ${key}`).toBeLessThanOrEqual(
            GEOMETRY_TOLERANCE_PX
          );
        }
      });
    }
  });
});
