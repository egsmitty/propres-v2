// ESLint 9 flat config for PresenterPro.
//
// Three distinct environments live in this repo and they do NOT share globals:
//   - src/**          renderer  → browser globals, React, no Node
//   - electron/**     main      → Node globals, no DOM
//   - *.config.*      tooling   → Node globals
//
// Getting this wrong is how `window` in main-process code or `process` in
// renderer code slips through, so each gets its own block.
//
// Prettier owns all formatting; eslint-config-prettier is applied last to turn
// off every stylistic rule that would fight it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import vitestRules from './eslint-vitest-rules.mjs';

export default [
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'public/**',
      'coverage/**',
      '**/__snapshots__/**',
    ],
  },

  js.configs.recommended,

  // TypeScript ---------------------------------------------------------------
  // New files are .ts/.tsx (see AGENTS.md language policy), and the base parser
  // cannot read type annotations. Not type-aware linting — `npm run type-check`
  // owns types; this is only so TS files can be parsed and linted at all.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Mirrors the JS rule below: allow the conventional underscore escape.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The base rule misfires on TS constructs; the plugin version replaces it.
      'no-unused-vars': 'off',
    },
  },

  // Renderer (React) ---------------------------------------------------------
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // This project does not use prop-types; typing comes from JSDoc/TS.
      'react/prop-types': 'off',
      // The new JSX transform makes the React import unnecessary.
      'react/react-in-jsx-scope': 'off',
      // Unused vars are a real signal in a codebase this size, but allow the
      // conventional underscore escape and don't flag caught errors.
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      // console.warn/error are legitimate in a desktop app; bare logs are not.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Electron main + preload --------------------------------------------------
  {
    files: ['electron/**/*.{js,ts}', 'shared/**/*.{js,ts}', 'scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off', // main-process logging is how this app is debugged
    },
  },

  // CommonJS scripts ---------------------------------------------------------
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // Tooling configs ----------------------------------------------------------
  {
    files: ['*.config.{js,mjs,ts}', 'eslint*.mjs', 'vitest.config.*'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },

  // Test-quality floor (see eslint-vitest-rules.mjs) --------------------------
  {
    ...vitestRules,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // TypeScript override — must come AFTER the environment blocks above. Those
  // blocks re-enable the base `no-unused-vars` for their file globs (which
  // include .ts), and the base rule misfires on parameter names in interface
  // and type signatures. Flat config is last-wins, so this keeps the
  // @typescript-eslint version (configured earlier) as the only one for TS.
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-unused-vars': 'off' },
  },

  // Must stay last: disables everything that conflicts with Prettier.
  prettier,
];
