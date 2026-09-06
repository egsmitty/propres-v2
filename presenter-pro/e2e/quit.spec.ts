import { test, expect, dismissTutorialIfPresent } from './fixtures/launchApp';

// phase7 finding #0: the app could not be quit for months because the close
// handler cancelled every quit. This is the end-to-end guard: a quit request
// with nothing unsaved must actually end the process.

test.describe('quit', () => {
  test('Cmd+Q with nothing unsaved fully exits the app', async ({ launched }) => {
    await dismissTutorialIfPresent(launched.window);

    // Watch the real OS process, not Playwright's `close` event: on Electron
    // exit that event races Playwright's own teardown and rejects with an
    // internal error, which would make a *successful* quit look like a failure.
    // Arm the listener BEFORE requesting the quit so a fast exit is not missed.
    const proc = launched.process;
    const exited = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('app did not exit within 15s — the quit was swallowed')),
        15_000
      );
      proc.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    await launched.app.evaluate(({ app }) => app.quit());

    // A timeout here is a FAIL, not a skip — that is the bug this test exists
    // to catch. Exit code 0 is a clean quit; anything else is a crash.
    await expect(exited).resolves.toBe(0);
  });
});
