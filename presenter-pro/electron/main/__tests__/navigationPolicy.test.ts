import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'url';
import { isAllowedNavigation } from '../navigationPolicy';

// SEC-1 (tasks/fable-pass-2-audit.md): no setWindowOpenHandler / will-navigate
// guard exists today. The audit keeps the 10-line web-contents-created deny as
// hardening (its data-loss scenario was downgraded — see the audit entry —
// this is defense in depth, not a fix for a proven exploit).
//
// This is the pure decision function behind that guard: given a navigation
// target and the two places a legitimate navigation may point (the
// electron-vite dev server, or the built renderer's own index.html), decide
// allow/deny. index.js only wires this up — see
// electron/main/__tests__/navigationHardeningWiring.test.ts.

const APP_INDEX_PATH = '/Applications/PresenterPro.app/Contents/Resources/out/renderer/index.html';
const APP_INDEX_HREF = pathToFileURL(APP_INDEX_PATH).href;

describe('isAllowedNavigation', () => {
  describe('dev server (ELECTRON_RENDERER_URL set — npm run dev / HMR)', () => {
    const options = { rendererDevUrl: 'http://localhost:5173', appIndexPath: APP_INDEX_PATH };

    it('allows the dev server root', () => {
      expect(isAllowedNavigation('http://localhost:5173/', options)).toBe(true);
    });

    it('allows a hash-routed dev server URL (output/stage-display windows)', () => {
      expect(isAllowedNavigation('http://localhost:5173/#/output', options)).toBe(true);
      expect(isAllowedNavigation('http://localhost:5173/#/stage-display', options)).toBe(true);
    });

    it('denies a different port on the same host', () => {
      expect(isAllowedNavigation('http://localhost:5174/', options)).toBe(false);
    });

    it('denies a different scheme against the same host:port', () => {
      expect(isAllowedNavigation('https://localhost:5173/', options)).toBe(false);
    });

    it('denies an unrelated origin', () => {
      expect(isAllowedNavigation('https://evil.example.com/', options)).toBe(false);
    });
  });

  describe('built renderer (no dev URL — packaged app, npm run preview, Playwright E2E)', () => {
    const options = { rendererDevUrl: null, appIndexPath: APP_INDEX_PATH };

    it('allows the built index.html with no hash', () => {
      expect(isAllowedNavigation(APP_INDEX_HREF, options)).toBe(true);
    });

    it('allows the built index.html with the output hash', () => {
      expect(isAllowedNavigation(`${APP_INDEX_HREF}#/output`, options)).toBe(true);
    });

    it('allows the built index.html with the stage-display hash', () => {
      expect(isAllowedNavigation(`${APP_INDEX_HREF}#/stage-display`, options)).toBe(true);
    });

    it('allows the built index.html with a query string', () => {
      expect(isAllowedNavigation(`${APP_INDEX_HREF}?foo=bar`, options)).toBe(true);
    });

    it('denies a different file in the same directory', () => {
      const other = pathToFileURL(
        '/Applications/PresenterPro.app/Contents/Resources/out/renderer/other.html'
      ).href;
      expect(isAllowedNavigation(other, options)).toBe(false);
    });

    it('denies an unrelated absolute file path', () => {
      expect(isAllowedNavigation(pathToFileURL('/etc/passwd').href, options)).toBe(false);
    });

    it('denies a dev-server URL when no dev URL is configured', () => {
      expect(isAllowedNavigation('http://localhost:5173/', options)).toBe(false);
    });
  });

  describe('always denied', () => {
    const options = { rendererDevUrl: 'http://localhost:5173', appIndexPath: APP_INDEX_PATH };

    it('denies an arbitrary http(s) origin', () => {
      expect(isAllowedNavigation('https://attacker.example.com/phish', options)).toBe(false);
    });

    it('denies a javascript: URL', () => {
      expect(isAllowedNavigation('javascript:alert(1)', options)).toBe(false);
    });

    it('denies a data: URL', () => {
      expect(isAllowedNavigation('data:text/html,<script>alert(1)</script>', options)).toBe(false);
    });

    it('denies an unparsable string', () => {
      expect(isAllowedNavigation('not a url at all', options)).toBe(false);
    });

    it('denies an empty string', () => {
      expect(isAllowedNavigation('', options)).toBe(false);
    });
  });
});
