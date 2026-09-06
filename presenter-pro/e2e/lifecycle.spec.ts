import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { test, expect, launchApp, closeApp, dismissTutorialIfPresent } from './fixtures/launchApp';

// Plan C1 — process lifecycle on a live machine.
//
// These are the three things that go wrong in front of a congregation:
//   1. a volunteer double-clicks the icon and a second copy opens on the same
//      database (the single-instance lock must hand focus to the running copy),
//   2. the presenting flow must actually open and tear down the output window,
//   3. the output renderer crashes and the projector goes blank (main must
//      reload it, not leave it dead).

const require = createRequire(__filename);
const ELECTRON_BINARY = require('electron') as string;
const MAIN_ENTRY = path.resolve(__dirname, '../out/main/index.js');

test.describe('lifecycle', () => {
  test('a second instance on the same profile exits and leaves the first running', async () => {
    const first = await launchApp();
    try {
      await dismissTutorialIfPresent(first.window);

      const second = spawn(ELECTRON_BINARY, [MAIN_ENTRY, `--user-data-dir=${first.userDataDir}`], {
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RENDERER_URL: '' },
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('second instance did not exit within 15s')),
          15_000
        );
        second.on('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      expect(exitCode).toBe(0);
      // The first copy is untouched: still one window, still responsive.
      expect(first.app.windows()).toHaveLength(1);
      expect(await first.window.evaluate(() => document.readyState)).toBe('complete');
    } finally {
      await closeApp(first);
    }
  });

  test('presenting opens the output window and stopping tears it down', async ({ launched }) => {
    // `page`, not `window`: inside evaluate() `window` must be the browser global.
    const { app, window: page } = launched;
    await dismissTutorialIfPresent(page);

    await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false }));
    const output = await app.waitForEvent('window', { timeout: 15_000 });
    await output.waitForLoadState('domcontentloaded');
    expect(output.url()).toContain('#/output');
    expect(app.windows()).toHaveLength(2);

    const closed = output.waitForEvent('close', { timeout: 15_000 });
    await page.evaluate(() => window.electronAPI.stopPresenting());
    await closed;
    expect(app.windows()).toHaveLength(1);
  });

  test('a crashed output renderer is reloaded, not left blank', async ({ launched }) => {
    // `page`, not `window`: inside evaluate() `window` must be the browser global.
    const { app, window: page } = launched;
    await dismissTutorialIfPresent(page);

    await page.evaluate(() => window.electronAPI.openOutputWindow({ useConfiguredDisplay: false }));
    const output = await app.waitForEvent('window', { timeout: 15_000 });
    await output.waitForLoadState('domcontentloaded');

    // Kill the output renderer the way a real crash would.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('#/output')
      );
      win?.webContents.forcefullyCrashRenderer();
    });

    // Main must reload it: the window still exists, and its renderer is alive again.
    await expect
      .poll(
        () =>
          app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().includes('#/output')
            );
            return win ? !win.webContents.isCrashed() && !win.webContents.isLoading() : 'gone';
          }),
        { timeout: 15_000 }
      )
      .toBe(true);
    expect(app.windows()).toHaveLength(2);

    await page.evaluate(() => window.electronAPI.stopPresenting());
  });
});
