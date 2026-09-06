import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Mechanical guard for phase7 finding #12.
//
// `dist:win` was written as `VAR=value command`, which is POSIX shell syntax.
// cmd.exe does not understand it, so on a real Windows machine (and on the
// Windows CI runner) it failed with:
//
//   'CSC_IDENTITY_AUTO_DISCOVERY' is not recognized as an internal or
//   external command, operable program or batch file.
//
// Windows packaging had therefore never actually worked. Env vars in npm
// scripts must go through `cross-env` to stay portable.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(dirname, '../../../package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/**
 * Matches a bare `NAME=value` env assignment at the start of a command or
 * immediately after `&&`/`;`, which is the non-portable form. `cross-env
 * NAME=value` is fine because the assignment is an argument, not shell syntax.
 */
const BARE_ENV_PREFIX = /(^|&&\s*|;\s*)[A-Z_][A-Z0-9_]*=/;

describe('npm scripts are cross-platform', () => {
  const entries = Object.entries(pkg.scripts);

  it('has scripts to check', () => {
    // Floor: an empty script map would make every assertion below vacuous.
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s does not use a bare shell env-var prefix', (_name, command) => {
    expect(command).not.toMatch(BARE_ENV_PREFIX);
  });

  it('routes every env var in a dist script through cross-env', () => {
    // Iterates the real script list, so a newly added dist script that forgets
    // cross-env fails here rather than at release time.
    const needingCrossEnv = entries.filter(
      ([name, command]) =>
        name.startsWith('dist:') && command.includes('CSC_IDENTITY_AUTO_DISCOVERY')
    );
    // Floor: if this list is ever empty the assertion below passes vacuously.
    expect(needingCrossEnv.length).toBeGreaterThan(0);

    // Collect-then-assert rather than expect-inside-a-loop-condition, so the
    // failure names every offending script at once (and satisfies
    // vitest/no-conditional-expect).
    const missingCrossEnv = needingCrossEnv
      .filter(([, command]) => !command.includes('cross-env CSC_IDENTITY_AUTO_DISCOVERY'))
      .map(([name]) => name);

    expect(missingCrossEnv).toEqual([]);
  });
});
