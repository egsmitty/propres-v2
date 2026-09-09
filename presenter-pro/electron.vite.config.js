import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Plan C2. The built renderer declares what its windows may load. Injected
 * only at build time: the dev server's HMR and React refresh use inline
 * scripts and a websocket that a strict policy would break, and dev is not
 * what ships. All three windows load the same index.html, so all three get
 * it. `'unsafe-inline'` for styles is the consequence of the inline style
 * attributes that remain (plan E4 keeps the dynamic ones); it goes when they
 * do. Media arrives through the app's own scheme or file: URLs.
 */
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' presenterpro-media: file:",
  "media-src 'self' presenterpro-media: file:",
  "font-src 'self'",
  "connect-src 'self' presenterpro-media:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

function rendererCsp() {
  return {
    name: 'presenterpro-renderer-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${RENDERER_CSP}" />`
      );
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // Build to `out/` so that `out/main/index.js` can require `../db/index`
      // and find `out/db/index.js`
      outDir: 'out',
      rollupOptions: {
        input: {
          'main/index': resolve(__dirname, 'electron/main/index.js'),
          // The main process is CommonJS, so `require('./closeController')` is
          // left external rather than inlined — it needs its own entry, the
          // same way the db modules below do, or the app crashes on launch
          // with "Cannot find module './closeController'".
          'main/closeController': resolve(__dirname, 'electron/main/closeController.ts'),
          // IPC contract enforcement (plan B1): the registry is required from
          // index.js; the contract is imported by the registry AND by preload.
          'main/ipcRegistry': resolve(__dirname, 'electron/main/ipcRegistry.ts'),
          'shared/ipcContract': resolve(__dirname, 'shared/ipcContract.ts'),
          'db/index': resolve(__dirname, 'electron/db/index.js'),
          'db/migrations': resolve(__dirname, 'electron/db/migrations.js'),
          // Required by migrations.js via relative require (CommonJS main), so
          // each needs its own entry — same reason as main/closeController.
          'db/migrationPlanner': resolve(__dirname, 'electron/db/migrationPlanner.ts'),
          'db/migrationRunner': resolve(__dirname, 'electron/db/migrationRunner.ts'),
          'db/migrationList': resolve(__dirname, 'electron/db/migrationList.ts'),
          'db/queries/songs': resolve(__dirname, 'electron/db/queries/songs.js'),
          'db/queries/presentations': resolve(__dirname, 'electron/db/queries/presentations.js'),
          'db/queries/media': resolve(__dirname, 'electron/db/queries/media.js'),
          'db/queries/journal': resolve(__dirname, 'electron/db/queries/journal.js'),
          'db/queries/versions': resolve(__dirname, 'electron/db/queries/versions.js'),
        },
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react(), rendererCsp()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  },
});
