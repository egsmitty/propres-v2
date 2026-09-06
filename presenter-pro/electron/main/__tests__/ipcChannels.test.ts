import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// IPC contract drift guard (the rule `writing-executable-plans.mdc` calls
// "IPC contract pinning"). The renderer talks to main only through channels
// that preload exposes; a handler with no wrapper is dead code, and a wrapper
// with no handler hangs or throws at the call site. The two sets must be
// identical. Measured at zero drift before this guard existed — this locks
// that in and names any channel that appears on only one side.

const dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN = readFileSync(resolve(dirname, '../index.js'), 'utf8');
const PRELOAD = readFileSync(resolve(dirname, '../../preload/index.js'), 'utf8');

function channels(source: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(pattern)) found.add(match[1]!);
  return [...found].sort();
}

const mainHandlers = channels(MAIN, /ipcMain\.(?:handle|on)\(\s*'([^']+)'/g);
const preloadCalls = channels(PRELOAD, /ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g);

describe('IPC channels', () => {
  it('has a non-trivial surface to check', () => {
    // Floor: an empty list would make the equality below vacuous.
    expect(mainHandlers.length).toBeGreaterThan(40);
  });

  it('main handlers and preload wrappers are exactly the same set', () => {
    // Whole-set equality: a difference names the offending channel(s).
    expect(preloadCalls).toEqual(mainHandlers);
  });

  it('exposes the crash-recovery journal channels on both sides', () => {
    for (const channel of ['db:journal:write', 'db:journal:list', 'db:journal:delete']) {
      expect(mainHandlers, `${channel} must have a main handler`).toContain(channel);
      expect(preloadCalls, `${channel} must have a preload wrapper`).toContain(channel);
    }
  });
});
