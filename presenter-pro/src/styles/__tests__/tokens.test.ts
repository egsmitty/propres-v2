import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Plan E1. A misspelt `var(--token)` is invisible at runtime: the colour just
// falls back to inherit/transparent. Every token a component references must
// be defined in globals.css.

const ROOT = resolve(__dirname, '../../..');
const GLOBALS = readFileSync(resolve(ROOT, 'src/styles/globals.css'), 'utf8');
const DEFINED = new Set([...GLOBALS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:jsx|js|tsx|ts)$/.test(name) && !full.includes('__tests__')) out.push(full);
  }
  return out;
}

describe('colour tokens', () => {
  it('defines a non-trivial token set', () => {
    expect(DEFINED.size).toBeGreaterThan(40);
  });

  it('every var(--token) referenced under src/ is defined in globals.css', () => {
    const missing = new Map<string, string[]>();
    for (const file of walk(resolve(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const token = match[1]!;
        if (!DEFINED.has(token)) {
          const list = missing.get(token) ?? [];
          list.push(file.replace(ROOT + '/', ''));
          missing.set(token, list);
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });
});
