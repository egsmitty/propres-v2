import { test, expect, FATAL_STDERR_MARKERS } from './fixtures/launchApp';

// The highest-value E2E in the suite. A missing rollup entry once shipped an
// app that crashed on launch with "Cannot find module" while `npm run build`
// reported SUCCESS. Unit tests cannot see that; only launching the built
// artifact can.

test.describe('launch', () => {
  test('starts the built app and opens exactly one window', async ({ launched }) => {
    // Exactly one, not "at least one": output/stage windows must NOT open on
    // launch, and a duplicated main window is a bug.
    expect(launched.app.windows()).toHaveLength(1);
  });

  test('the main window has a title', async ({ launched }) => {
    const title = await launched.window.title();
    expect(title.trim().length).toBeGreaterThan(0);
  });

  test('emits no fatal main-process error during startup', async ({ launched }) => {
    // Give the main process a moment to finish its async startup (DB open,
    // migrations, seeding) so a late failure is captured, not missed.
    await launched.window.waitForLoadState('load');
    await launched.window.waitForTimeout(1_000);

    const stderr = launched.stderr();
    // Collect-then-assert so a failure names every marker present at once.
    const present = FATAL_STDERR_MARKERS.filter((marker) => stderr.includes(marker));
    expect(present, `fatal markers found in stderr:\n${stderr}`).toEqual([]);
  });
});
