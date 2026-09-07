import { expect, type Locator, type Page } from '@playwright/test';

// Shared setup for the screenshot specs (plan E2). Everything here exists to
// make a capture deterministic across machines; see plan-E2 "Decisions".

/** VISUAL_STRICT=1: exact comparison (0 differing pixels) for verifying refactors locally. */
export const STRICT = process.env.VISUAL_STRICT === '1' ? { maxDiffPixels: 0 } : {};

/** Row dates ("Sep 6, 2026") change daily; they are masked, not compared. */
export const DATE_TEXT = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;

/** Capture size every machine can honour (the app's minimum is 1200×700). */
export const CAPTURE = { width: 1200, height: 660 };

/**
 * Home shows the OS account name and its initial on the profile card, so the
 * card is machine-specific by design. Masked together with the row dates.
 */
export function homeMasks(page: Page): Locator[] {
  return [page.getByText(DATE_TEXT), page.locator('[data-profile-card="true"]')];
}

/**
 * The presenter panel decides open/closed once, from the window width at
 * store init (open at ≥1400px). CI runners clamp the window below that and a
 * developer's display does not, so the editor is captured with the panel
 * explicitly shown — its own surface is part of the baseline.
 */
export async function showPresenterPanel(page: Page): Promise<void> {
  const show = page.getByRole('button', { name: 'Show presenter panel' });
  if (await show.isVisible().catch(() => false)) {
    await show.click();
  }
  await expect(show).toHaveCount(0);
}
