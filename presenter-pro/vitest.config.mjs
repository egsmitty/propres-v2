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
    exclude: ['node_modules', 'out', 'dist', 'release', 'e2e'],
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
      // Measured 2026-09-06 after plan S1: 6.78/5.51/6.14/7.14 (previously after A3:
      //   statements 5.99% · branches 4.46% · functions 5.41% · lines 6.33%
      thresholds: {
        statements: 6.6,
        branches: 5.3,
        functions: 5.9,
        lines: 6.9,
      },
    },
  },
});
