import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { EVENT_METHODS, INVOKE_METHODS, SEND_METHODS } from '../../../shared/ipcContract';

// IPC contract drift guard (plan B1; the rule `writing-executable-plans.mdc`
// calls "IPC contract pinning"). `shared/ipcContract.ts` is the single source
// of truth. Three things must agree with it and are checked here:
//   1. main registers a handler for exactly the contract's channels,
//   2. `src/utils/ipc.ts` exports exactly one wrapper per contract method,
//   3. nothing under `src/` touches `window.electronAPI` except that wrapper.
// Preload is generated from the contract, so it cannot drift by construction.
//
// Comments are stripped before scanning main. The first version of this guard
// did not do that, and seven `presenter:*` wrappers whose handlers had been
// commented out for several phases passed as "registered" (phase7 #9).

const dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(dirname, '../../..'); // presenter-pro/
const MAIN = stripComments(readFileSync(resolve(ROOT, 'electron/main/index.js'), 'utf8'));
const IPC_TS = stripComments(readFileSync(resolve(ROOT, 'src/utils/ipc.ts'), 'utf8'));

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function matches(source: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(pattern)) found.add(match[1]!);
  return [...found].sort();
}

const contractInvoke = Object.values(INVOKE_METHODS).sort();
const contractSend = Object.values(SEND_METHODS).sort();
const contractMethods = [
  ...Object.keys(INVOKE_METHODS),
  ...Object.keys(SEND_METHODS),
  ...Object.keys(EVENT_METHODS),
].sort();

describe('IPC contract ↔ main process', () => {
  it('main registers exactly the contract invoke channels through the registry', () => {
    expect(matches(MAIN, /\bipc\.handle\(\s*'([^']+)'/g)).toEqual(contractInvoke);
  });

  it('main registers exactly the contract send channels through the registry', () => {
    expect(matches(MAIN, /\bipc\.on\(\s*'([^']+)'/g)).toEqual(contractSend);
  });

  it('main never registers a channel behind the registry’s back', () => {
    expect(matches(MAIN, /\bipcMain\.(?:handle|on)\(\s*'([^']+)'/g)).toEqual([]);
  });

  it('main calls assertComplete so a missing handler fails at launch', () => {
    expect(MAIN).toMatch(/\bipc\.assertComplete\(\)/);
  });

  it('a commented-out handler does not count as registered', () => {
    expect(
      matches(
        stripComments("// ipc.handle('ghost:channel', () => {})"),
        /\bipc\.handle\(\s*'([^']+)'/g
      )
    ).toEqual([]);
  });
});

describe('IPC contract ↔ renderer wrapper (src/utils/ipc.ts)', () => {
  // Generic wrappers look like `export async function getSongs<T = unknown>(`.
  const exported = matches(IPC_TS, /^export (?:async )?function (\w+)\s*(?:<[^>]*>)?\(/gm);
  // Wrappers that are not contract methods: the static preload properties.
  const EXTRA_EXPORTS = ['getElectronPlatform'];

  it('exports exactly one wrapper per contract method (plus the static-property getters)', () => {
    expect(exported).toEqual([...contractMethods, ...EXTRA_EXPORTS].sort());
  });
});

describe('renderer never bypasses the wrapper', () => {
  const ALLOWED = new Set(['src/utils/ipc.ts', 'src/types/electron-api.d.ts']);

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

  it('no source file under src/ references electronAPI except the wrapper and its type', () => {
    const offenders = walk(resolve(ROOT, 'src'))
      .map((file) => relative(ROOT, file))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => readFileSync(resolve(ROOT, rel), 'utf8').includes('electronAPI'))
      .sort();
    expect(offenders).toEqual([]);
  });
});
