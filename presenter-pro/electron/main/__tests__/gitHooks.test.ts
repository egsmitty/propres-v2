import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Plan REPO-22. Git passes the commit-message path RELATIVE to the repository
// root from the main checkout, but ABSOLUTE from a linked worktree. The hook
// used to prefix `$PWD` unconditionally, which doubled the worktree path and
// failed every worktree commit with ENOENT. These run the real hook the way git
// does: `sh .husky/commit-msg <path>` with the repository root as cwd.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const REPO = resolve(__dirname, '../../../..'); // repository root
const HOOK = '.husky/commit-msg';
const GOOD = 'chore(test): a conventional message\n';
const BAD = 'Not A Conventional Message\n';

function runHook(msgPath: string, env: Record<string, string> = {}) {
  return spawnSync('sh', [HOOK, msgPath], {
    cwd: REPO,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'presenterpro-hook-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('.husky/commit-msg', () => {
  it('accepts an ABSOLUTE message path, as a linked worktree passes it', () => {
    const abs = join(dir, 'ABSOLUTE_MSG');
    writeFileSync(abs, GOOD);
    const result = runHook(abs);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.status).toBe(0);
  }, 30_000);

  it('accepts a RELATIVE message path, as the main checkout passes it', () => {
    const relName = `.hook-probe-${process.pid}`;
    const abs = join(REPO, relName);
    writeFileSync(abs, GOOD);
    try {
      const result = runHook(relName);
      expect(result.stderr).not.toContain('ENOENT');
      expect(result.status).toBe(0);
    } finally {
      rmSync(abs, { force: true });
    }
  }, 30_000);

  it('still rejects a non-conventional message', () => {
    const abs = join(dir, 'BAD_MSG');
    writeFileSync(abs, BAD);
    const result = runHook(abs);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).not.toContain('ENOENT');
  }, 30_000);

  it('skips entirely when HUSKY=0', () => {
    const abs = join(dir, 'SKIPPED_MSG');
    writeFileSync(abs, BAD);
    const result = runHook(abs, { HUSKY: '0' });
    expect(result.status).toBe(0);
  }, 30_000);
});
