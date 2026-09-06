import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vitest reuses the renderer half of electron.vite.config.js — same React
// transform, same `@` alias — so tests resolve modules exactly the way the app
// does. Keep the alias in sync with electron.vite.config.js `renderer.resolve`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // Default to node: pure utils and main-process tests are the bulk of the
    // suite and don't need a DOM. Component tests opt in per-file with
    // `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    include: ['{src,electron,shared}/**/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'out', 'dist', 'release', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**', 'electron/**', 'shared/**'],
      exclude: [
        '**/__tests__/**',
        '**/*.config.*',
        // Entry points are covered by E2E, not unit tests.
        'src/main.jsx',
        'electron/preload/**',
      ],
      // Thresholds start at the floor the first real tests establish and
      // ratchet upward — never set an aspirational number that gets disabled
      // the first time it fails. See tasks/todo.md item 15.
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
