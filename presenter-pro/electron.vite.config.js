import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
          'db/index': resolve(__dirname, 'electron/db/index.js'),
          'db/migrations': resolve(__dirname, 'electron/db/migrations.js'),
          // Required by migrations.js via relative require (CommonJS main), so
          // each needs its own entry — same reason as main/closeController.
          'db/migrationPlanner': resolve(__dirname, 'electron/db/migrationPlanner.ts'),
          'db/migrationRunner': resolve(__dirname, 'electron/db/migrationRunner.ts'),
          'db/queries/songs': resolve(__dirname, 'electron/db/queries/songs.js'),
          'db/queries/presentations': resolve(__dirname, 'electron/db/queries/presentations.js'),
          'db/queries/media': resolve(__dirname, 'electron/db/queries/media.js'),
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
          index: resolve(__dirname, 'electron/preload/index.js'),
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
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  },
});
