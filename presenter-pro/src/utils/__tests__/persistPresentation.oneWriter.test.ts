import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Plan SAVED1, Decision 4 — the mechanical proof that there is one writer.
// Every file under src/ (tests excluded) that calls `updatePresentation(` is
// listed here, exactly: the IPC wrapper that defines it and the one module
// that is allowed to call it. A new caller shows up as a third entry.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const SRC = resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') walk(full, out);
    } else if (/\.(?:js|jsx|ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('one writer for the presentations row', () => {
  it('updatePresentation( is called from exactly the wrapper and persistPresentation', () => {
    const callers = walk(SRC)
      .filter((file) => /\bupdatePresentation\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(resolve(SRC, '..'), file))
      .sort();
    expect(callers).toEqual(['src/utils/ipc.ts', 'src/utils/persistPresentation.ts']);
    expect(callers).toHaveLength(2);
  });
});
