import { defineConfig } from '@playwright/test';

// End-to-end tests drive the REAL Electron app built into out/. They cover the
// paths unit tests structurally cannot reach — window lifecycle, quitting, the
// close handshake — which is where most of this project's real bugs have lived.
//
// `npm run test:e2e` builds first; Playwright launches out/main/index.js, not
// the dev server. See e2e/fixtures/launchApp.ts for the isolation guarantees.
export default defineConfig({
  testDir: './e2e',
  // One Electron instance at a time. Parallel instances would race on the
  // output display and on file locks; there is nothing to gain.
  workers: 1,
  fullyParallel: false,
  // A retry hides flakiness instead of surfacing it. Zero locally; one in CI
  // only so a transient runner hiccup does not mask a real signal — the retry
  // is visible in the report either way.
  retries: process.env.CI ? 1 : 0,
  // Must exceed the fixture's 60s first-window allowance plus the spec itself.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'e2e/.artifacts',
  use: {
    trace: 'retain-on-failure',
  },
});
