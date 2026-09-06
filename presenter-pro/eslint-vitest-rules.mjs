// Test-quality floor. These rules make classic test-weakening mistakes fail
// lint instead of relying on convention: `.only` left behind, skipped tests as
// "fixes", assertion-free test bodies, and conditionally-executed expects.
//
// Ported from Motion-Worship/builder's eslint-jest-rules.mjs — same four rules,
// Vitest plugin instead of Jest.
//
// When a rule fires, restructure the test (recipes in
// .cursor/rules/writing-tests.mdc) — never disable the rule file-wide.
import vitest from '@vitest/eslint-plugin';

export default {
  files: ['**/__tests__/**/*.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'],
  plugins: { vitest },
  rules: {
    // `.only` silently disables every other test in the file's run.
    'vitest/no-focused-tests': 'error',
    // Skipping is deleting coverage; a justified skip needs a line-scoped
    // disable with a comment.
    'vitest/no-disabled-tests': 'error',
    // A test body with no assertion is permanently green and tests nothing.
    // Helper assertion functions must be named expect* to be recognized.
    'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*'] }],
    // An expect inside if/catch silently skips; use early-return guards or
    // throw-narrowing helpers instead.
    'vitest/no-conditional-expect': 'error',
  },
};
