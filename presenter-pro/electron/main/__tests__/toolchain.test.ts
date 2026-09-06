import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Plan U1. The Node version is pinned in three places that CI, local
// development, and type-checking each read independently. They must agree on
// the major, or "works on my machine" comes back.

const ROOT = resolve(__dirname, '../../..'); // presenter-pro/
const REPO = resolve(ROOT, '..');

function majorOf(spec: string): number {
  const match = /(\d+)/.exec(spec);
  if (!match) throw new Error(`no major version in "${spec}"`);
  return Number(match[1]);
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  engines: { node: string };
  devDependencies: Record<string, string>;
};
const nvmrc = readFileSync(resolve(REPO, '.nvmrc'), 'utf8').trim();

describe('toolchain pins', () => {
  it('.nvmrc, engines.node and @types/node agree on the Node major', () => {
    const fromNvmrc = majorOf(nvmrc);
    expect(majorOf(pkg.engines.node)).toBe(fromNvmrc);
    expect(pkg.devDependencies['@types/node']).toBeDefined();
    expect(majorOf(pkg.devDependencies['@types/node']!)).toBe(fromNvmrc);
  });

  it('the pinned Node major is 22 or newer (Electron 44 tooling floor)', () => {
    expect(majorOf(nvmrc)).toBeGreaterThanOrEqual(22);
  });
});
