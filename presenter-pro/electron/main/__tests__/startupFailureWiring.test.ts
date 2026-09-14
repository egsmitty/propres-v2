import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Plan MB1 (audit MAIN-B1). The message is tested in startupFailure.test.ts;
// this proves the main process is WIRED to it. It reads source text for the
// same reason lifecycleListeners.test.ts does: electron/main/index.js pulls in
// `electron` and opens a database at import time.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(dirname, '../index.js'), 'utf8');
const VITE_CONFIG = readFileSync(resolve(dirname, '../../../electron.vite.config.js'), 'utf8');

function handlerBody(): string {
  const match = MAIN_SOURCE.match(/function handleStartupFailure\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  expect(match, 'handleStartupFailure must be a top-level function in index.js').not.toBeNull();
  return match?.[1] ?? '';
}

describe('startup failure wiring (MAIN-B1)', () => {
  it('catches a failed startup instead of leaving an unhandled rejection', () => {
    // Whitespace-tolerant (Prettier breaks the chain across lines), and the
    // `.catch` must hang off the same whenReady chain, not any promise.
    expect(MAIN_SOURCE).toMatch(
      /app\s*\.whenReady\(\)\s*\.then\([\s\S]*?\}\)\s*\.catch\(handleStartupFailure\);/
    );
  });

  it('builds the message from the tested module', () => {
    expect(MAIN_SOURCE).toContain("require('./startupFailure')");
    expect(handlerBody()).toContain('describeStartupFailure(');
  });

  it('shows the error box, then exits with a failure code', () => {
    const body = handlerBody();
    const shown = body.indexOf('dialog.showErrorBox(');
    const exited = body.indexOf('app.exit(1)');

    expect(shown).toBeGreaterThanOrEqual(0);
    expect(exited).toBeGreaterThanOrEqual(0);
    // Exiting first would take the dialog down with the process.
    expect(shown).toBeLessThan(exited);
  });

  it('emits startupFailure as its own entry point', () => {
    // CommonJS main: `require('./startupFailure')` stays external, so without
    // a rollup input the packaged app crashes on launch with "Cannot find
    // module" — exactly the no-window failure this plan exists to prevent.
    expect(VITE_CONFIG).toContain("'main/startupFailure'");
  });
});
