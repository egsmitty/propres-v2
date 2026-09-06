import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Mechanical guard for phase7 finding #11.
//
// Editor.jsx used to register a `beforeunload` handler that called
// window.confirm() to guard unsaved changes. It broke closing the app entirely:
//
//   1. Chromium SUPPRESSES window.confirm() inside a beforeunload handler, so
//      it returned falsy, so the handler called e.preventDefault() — silently
//      cancelling every close with no dialog ever shown.
//   2. It was a competing duplicate of the real guard. Unsaved changes are
//      owned by the main-process handshake: BrowserWindow 'close' →
//      'window:requestClose' → resolveUnsavedChanges() → DialogHost.
//
// Electron fires the BrowserWindow 'close' event BEFORE beforeunload, so the
// renderer handler ran last and vetoed a close the main process had already
// approved — including a quit.
//
// There must be exactly ONE unsaved-changes guard. This test fails if a second
// one is reintroduced in the renderer.

const dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Strip comments before asserting. Without this, the comment in Editor.jsx that
 * *explains* why there is no beforeunload handler would itself fail the test —
 * these assertions are about code, not prose.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const RENDERER_SOURCES = ['Editor.jsx', 'Home.jsx'].map((file) => ({
  file,
  source: stripComments(readFileSync(resolve(dirname, '..', file), 'utf8')),
}));

describe('unsaved-changes guard ownership', () => {
  it.each(RENDERER_SOURCES)('$file registers no beforeunload handler', ({ source }) => {
    // A beforeunload listener in the renderer can veto a close the main process
    // already allowed, which is how the app became unquittable.
    expect(source).not.toContain('beforeunload');
  });

  it.each(RENDERER_SOURCES)('$file does not use window.confirm', ({ source }) => {
    // Native confirm/alert are suppressed in some Electron contexts and do not
    // match the app's dialog styling. Use showDialog/confirmDialog from
    // src/utils/dialog.js, which DialogHost renders.
    expect(source).not.toMatch(/\bwindow\.confirm\s*\(/);
  });

  it('routes the close guard through resolveUnsavedChanges only', () => {
    const appCommands = readFileSync(resolve(dirname, '../../utils/appCommands.js'), 'utf8');
    // The single owner of the decision, reached via the main-process handshake.
    expect(appCommands).toContain("case 'window:requestClose'");
    expect(appCommands).toContain('resolveUnsavedChanges(');
  });
});
