#!/usr/bin/env node
// WF-45. Scaffolds a new executable plan file with every section
// `.cursor/rules/writing-executable-plans.mdc` requires, including both
// Compliance Manifest tables pre-filled with the item names (blank
// dispositions) so an author cannot forget a row.
//
// Usage:
//   node scripts/new-plan.mjs <id> <slug> [outputDir]
//   PLAN_OUTPUT_DIR=<dir> node scripts/new-plan.mjs <id> <slug>
//
// <id>   e.g. T2, REPO-40 — used verbatim in the title and filename.
// <slug> kebab-case short name, e.g. "fix-thing" — used verbatim in the
//        title (words) and filename.
//
// Writes `<outputDir>/plan-<id>-<slug>.md`. Refuses to overwrite an existing
// file. Defaults `outputDir` to `presenter-pro/scripts/../../tasks` (i.e. the
// repo-root `tasks/` directory) — override with a third CLI argument or the
// `PLAN_OUTPUT_DIR` env var (the test in
// electron/main/__tests__/newPlanScript.test.ts uses this so it never writes
// into the real tasks/ directory).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANTI_WEAKENING_CLAUSE =
  'If an assertion fails, the bug is elsewhere — never loosen the assertion to pass. Fix the root cause or record it as a suspected regression.';

// Copied verbatim from `.cursor/rules/writing-executable-plans.mdc`'s
// Compliance Manifest section (11 "Patterns that work" bullets + the 3
// failure modes named just above them = 14 items, exhaustive).
const PLAN_MANIFEST_ITEMS = [
  'Assertion weakening designed against',
  'List sampling designed against',
  'Quantifier erosion designed against',
  'Sanctioned escape hatch',
  'Bounded blast radius',
  'File-specific pitfall notes',
  'Exact paths',
  'Per-todo verification',
  'Snapshot policy inline',
  'Preconditions for conditional UI',
  'Structural floor under snapshots',
  'IPC contract pinning',
  'Manual verification steps',
  'Required findings report',
];

// Copied verbatim from `.cursor/rules/testing-standards.mdc`'s "Plan
// compliance checklist" (10 numbered items, exhaustive).
const TESTING_MANIFEST_ITEMS = [
  'TDD ordering',
  'Behavior-change test edits',
  'No weakened assertions',
  'Coverage floor',
  'Lint floor',
  'Snapshot discipline',
  'Completion gate',
  'Vitest / jsdom mechanics',
  'Test placement',
  'Characterization before refactor',
];

function manifestTable(items) {
  const header = '| Item | Disposition |\n|---|---|';
  const rows = items.map((item) => `| ${item} |  |`);
  return [header, ...rows].join('\n');
}

function testingManifestTable(items) {
  const header = '| # | Item | Disposition |\n|---|---|---|';
  const rows = items.map((item, i) => `| ${i + 1} | ${item} |  |`);
  return [header, ...rows].join('\n');
}

export function renderPlan(id, slug) {
  const titleWords = slug.split('-').join(' ');
  return `# Executable Plan ${id} — ${titleWords}

**Source:** TODO — name the audit item / issue this plan implements.

Written per \`.cursor/rules/writing-executable-plans.mdc\`.

---

## Measured

TODO — what you read, with file:line citations, before deciding anything.

## Decisions

TODO — the approach, and why, per todo.

**Anti-weakening clause (verbatim):** _${ANTI_WEAKENING_CLAUSE}_

## Blast radius

**May change:** TODO — exact paths, no improvisation.

**May not change:** TODO.

## Todos

- [ ] 1. TODO — each todo names the command that proves it done.

## Compliance Manifest

### writing-executable-plans.mdc (this rule)

${manifestTable(PLAN_MANIFEST_ITEMS)}

### testing-standards.mdc (10 items)

${testingManifestTable(TESTING_MANIFEST_ITEMS)}
`;
}

function main() {
  const [, , id, slug, cliOutputDir] = process.argv;

  if (!id || !slug) {
    process.stderr.write('Usage: node scripts/new-plan.mjs <id> <slug> [outputDir]\n');
    process.exit(1);
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputDir = resolve(
    scriptDir,
    cliOutputDir || process.env.PLAN_OUTPUT_DIR || '../../tasks'
  );
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, `plan-${id}-${slug}.md`);
  if (existsSync(outputPath)) {
    process.stderr.write(`Refusing to overwrite existing plan: ${outputPath}\n`);
    process.exit(1);
  }

  writeFileSync(outputPath, renderPlan(id, slug), 'utf8');
  process.stdout.write(`Wrote ${outputPath}\n`);
}

// Only run when executed directly (so the test file can import `renderPlan`
// without triggering the CLI / filesystem side effects).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
