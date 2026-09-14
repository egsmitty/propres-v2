import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// WF-45. `scripts/new-plan.mjs` scaffolds a plan file with the anti-weakening
// clause and both Compliance Manifest tables pre-filled. This test runs the
// real script (never touches the real tasks/ directory — every run passes an
// explicit tmpdir as the third CLI argument) and checks its output
// mechanically: the clause string, and the exact row count of each table.

const ROOT = resolve(__dirname, '../../..'); // presenter-pro/
const SCRIPT = resolve(ROOT, 'scripts/new-plan.mjs');

const ANTI_WEAKENING_CLAUSE =
  'If an assertion fails, the bug is elsewhere — never loosen the assertion to pass. Fix the root cause or record it as a suspected regression.';

const tmpDirs: string[] = [];
function freshTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plan-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function runScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Returns the data rows (no header, no `---` separator) of the first
 * markdown table found after `heading`, up to the next `### ` heading or end
 * of file.
 */
function tableDataRows(markdown: string, heading: string): string[] {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) throw new Error(`heading not found: ${heading}`);
  const rest = markdown.slice(headingIndex + heading.length);
  const nextHeadingIndex = rest.indexOf('\n### ');
  const section = nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
  const tableLines = section.split('\n').filter((line) => line.trim().startsWith('|'));
  // tableLines[0] is the header row, tableLines[1] the `|---|---|` separator.
  return tableLines.slice(2);
}

describe('new-plan.mjs', () => {
  it('writes a plan file with the anti-weakening clause verbatim', () => {
    const outDir = freshTmpDir();
    const result = runScript(['T9', 'example-slug', outDir]);
    expect(result.status).toBe(0);

    const outputPath = join(outDir, 'plan-T9-example-slug.md');
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, 'utf8');
    expect(content).toContain(ANTI_WEAKENING_CLAUSE);
  });

  it('includes all 14 writing-executable-plans manifest rows', () => {
    const outDir = freshTmpDir();
    runScript(['T9', 'example-slug', outDir]);
    const content = readFileSync(join(outDir, 'plan-T9-example-slug.md'), 'utf8');
    const rows = tableDataRows(content, '### writing-executable-plans.mdc (this rule)');
    // Exactness matters: 14, not "at least 14" — a missing item is a silent
    // list-sampling regression in the template itself.
    expect(rows).toHaveLength(14);
  });

  it('includes all 10 testing-standards manifest rows', () => {
    const outDir = freshTmpDir();
    runScript(['T9', 'example-slug', outDir]);
    const content = readFileSync(join(outDir, 'plan-T9-example-slug.md'), 'utf8');
    const rows = tableDataRows(content, '### testing-standards.mdc (10 items)');
    expect(rows).toHaveLength(10);
  });

  it('refuses to overwrite an existing plan file', () => {
    const outDir = freshTmpDir();
    const first = runScript(['T9', 'dup-slug', outDir]);
    expect(first.status).toBe(0);
    const originalContent = readFileSync(join(outDir, 'plan-T9-dup-slug.md'), 'utf8');

    const second = runScript(['T9', 'dup-slug', outDir]);
    expect(second.status).not.toBe(0);
    // The original file must be untouched, not truncated or replaced.
    expect(readFileSync(join(outDir, 'plan-T9-dup-slug.md'), 'utf8')).toBe(originalContent);
  });

  it('exits non-zero and prints usage when id or slug is missing', () => {
    const outDir = freshTmpDir();
    const result = runScript(['T9', '', outDir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });
});
