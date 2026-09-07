import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Plan E4. tailwind.config.js names every token from globals.css so classes
// can reach them (`bg-bg-surface`, `text-text-primary`). The stylesheet is the
// source of truth; this fails when the two drift — a token added without a
// class name, a class name without a token, or a gradient filed as a colour.

const ROOT = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);

type Theme = {
  extend: { colors: Record<string, string>; backgroundImage: Record<string, string> };
};

function stylesheetTokens(): Map<string, string> {
  const css = readFileSync(join(ROOT, 'src/styles/globals.css'), 'utf8');
  const out = new Map<string, string>();
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const name = match[1] ?? '';
    const value = match[2] ?? '';
    if (name && !out.has(name)) out.set(name, value.trim());
  }
  return out;
}

const isGradient = (value: string) => /^(linear|radial|conic)-gradient\(/.test(value);

describe('tailwind token names (plan E4)', () => {
  const tokens = stylesheetTokens();
  const { colors, backgroundImage } = (require(join(ROOT, 'tailwind.config.js')).theme as Theme)
    .extend;

  it('every colour token is a Tailwind colour named after itself', () => {
    const expected = Object.fromEntries(
      [...tokens].filter(([, v]) => !isGradient(v)).map(([k]) => [k.slice(2), `var(${k})`])
    );
    expect(colors).toEqual(expected);
  });

  it('every gradient token is a Tailwind background image named after itself', () => {
    const expected = Object.fromEntries(
      [...tokens].filter(([, v]) => isGradient(v)).map(([k]) => [k.slice(2), `var(${k})`])
    );
    expect(backgroundImage).toEqual(expected);
  });
});
