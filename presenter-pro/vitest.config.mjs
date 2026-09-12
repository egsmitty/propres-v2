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
      // Measured 2026-09-11 after plans G1 (blank names) and G3 (song editor):
      // 26.93/24.8/24.59/27.88. G1 added 21 cases without moving the ratchet,
      // so this raise covers both.
      // (After plan F1, pure-helper characterization:
      // 25.0/22.41/22.02/26.01.) Note what F1 did NOT do: Canvas.jsx and
      // Toolbar.jsx are still 0 % each. The rise is real but it comes from
      // moving 17 already-pure helpers into tested modules, not from covering
      // either component — the decomposition those tests unblock is what will
      // move the two files themselves.
      // (After plan A6, version history: 22.7/19.86/20.38/23.83.)
      // (After A5 slices 2+3: 21.11/18.76/19.12/22.24.)
      // Slice 2 alone measured 21.63/19.16/19.49/22.81; slice 3 then deleted the
      // journal writer AND its tests, so the floor settled slightly lower. Both
      // ship in one PR, so the ratchet is set once, at the end state — and it
      // still rises on every axis against main's 20.0/17.8/18.7/21.0.
      // (After A5 slice 1: 20.11/17.96/18.87/21.14.)
      // (After E1: 15.36/13.05/14.55/16.17; after A3: 5.99/4.46/5.41/6.33.)
      // Note the ratchet had drifted ~2 points stale before this slice — the
      // suite already measured 17.55/15.45/17.28/18.39 on the previous commit.
      thresholds: {
        statements: 26.8,
        branches: 24.7,
        functions: 24.4,
        lines: 27.7,
      },
    },
  },
});
