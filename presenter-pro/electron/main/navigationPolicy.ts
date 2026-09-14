import { pathToFileURL } from 'url';

/**
 * SEC-1 (tasks/fable-pass-2-audit.md): hardening only — the audit downgraded
 * this item's data-loss scenario (Electron's `navigateOnDragDrop` already
 * defaults to false, so a stray drag-drop cannot navigate the app away from
 * itself), but kept the guard because no `setWindowOpenHandler` /
 * `will-navigate` check existed at all.
 *
 * This is the pure allow/deny decision behind `web-contents-created` in
 * index.js. It is deliberately electron-free (no `BrowserWindow`, no
 * `contents`) so it can be unit-tested without loading Electron — see
 * electron/main/__tests__/navigationPolicy.test.ts. index.js only wires it up
 * (electron/main/__tests__/navigationHardeningWiring.test.ts pins that).
 */
export interface NavigationPolicyOptions {
  /**
   * `process.env.ELECTRON_RENDERER_URL`, or null/undefined when unset
   * (packaged app, `npm run preview`, Playwright E2E — all of which load the
   * built renderer from disk instead). When set, same-origin navigations to
   * it are allowed so `npm run dev` HMR keeps working.
   */
  rendererDevUrl?: string | null;
  /**
   * Absolute filesystem path to the built renderer's `index.html` that this
   * window actually loads (main, output, and stage-display windows all load
   * the same file, routed by URL hash — see rendererLoading.test.ts).
   */
  appIndexPath: string;
}

/**
 * Whether a top-level navigation to `targetUrl` may proceed.
 *
 * Allowed:
 *  - same protocol + host as `rendererDevUrl`, when set (path/hash/query
 *    ignored — the output and stage-display windows are routed by hash:
 *    `#/output`, `#/stage-display`)
 *  - a `file:` URL whose path is exactly `appIndexPath` (hash/query ignored
 *    for the same reason)
 *
 * Denied: any other http(s) origin, any other `file:` path, any other
 * scheme (`javascript:`, `data:`, …), and anything `new URL()` cannot parse.
 */
export function isAllowedNavigation(
  targetUrl: string,
  { rendererDevUrl, appIndexPath }: NavigationPolicyOptions
): boolean {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  if (rendererDevUrl) {
    try {
      const dev = new URL(rendererDevUrl);
      if (target.protocol === dev.protocol && target.host === dev.host) {
        return true;
      }
    } catch {
      // An unparsable rendererDevUrl can never match; fall through to deny.
    }
  }

  if (target.protocol === 'file:') {
    const expected = pathToFileURL(appIndexPath);
    return target.pathname === expected.pathname;
  }

  return false;
}
