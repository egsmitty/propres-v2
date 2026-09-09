import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// Vitest reuses the renderer half of electron.vite.config.js — same React
// transform, same `@` alias — so tests resolve modules exactly the way the app
// does. Keep the alias in sync with electron.vite.config.js `renderer.resolve`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // Default to node: pure utils and main-process tests are the bulk of the
    // suite and don't need a DOM. Component tests opt in per-file with
    // `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['./vitest.setup.mjs'],
    include: ['{src,electron,shared}/**/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // `* [0-9].*`: macOS/iCloud sync duplicates ("name 2.ext", "name 3.ext"); they must never run as tests.
    exclude: ['node_modules', 'out', 'dist', 'release', 'e2e', '**/* [0-9]', '**/* [0-9].*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Extensions are explicit: a bare `src/**` also matches .md and .json,
      // which the coverage remapper tries (and fails) to parse as source.
      include: ['src/**/*.{js,jsx,ts,tsx}', 'electron/**/*.{js,ts}', 'shared/**/*.{js,ts}'],
      exclude: [
        '**/__tests__/**',
        '**/*.config.*',
        // Entry points are covered by E2E, not unit tests.
        'src/main.jsx',
        'electron/preload/**',
      ],
      // A RATCHET, not a target. These are set just below what the suite
      // actually achieves today, so coverage can never silently fall — and
      // they are raised as tests are added. Never set an aspirational number
      // here; a threshold that fails on day one gets deleted rather than met.
      //
      // Measured 2026-09-09 after plan A5 slice 1: 20.11/17.96/18.87/21.14.
      // (After E1: 15.36/13.05/14.55/16.17; after A3: 5.99/4.46/5.41/6.33.)
      // Note the ratchet had drifted ~2 points stale before this slice — the
      // suite already measured 17.55/15.45/17.28/18.39 on the previous commit.
      thresholds: {
        statements: 20.0,
        branches: 17.8,
        functions: 18.7,
        lines: 21.0,
      },
    },
  },
});
