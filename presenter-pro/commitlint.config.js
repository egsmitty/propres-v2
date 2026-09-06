// Conventional Commits, as documented in .github/BRANCHING.md.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The default 100-char ceiling is tight for a descriptive subject and
    // this repo's history already runs longer; 100 stays as a warning.
    'header-max-length': [1, 'always', 100],
    // Bodies here carry real reasoning — do not fail on long lines.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};
