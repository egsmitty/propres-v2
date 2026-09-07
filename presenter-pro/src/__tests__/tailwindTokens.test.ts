import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Plan E4 / U3. globals.css names every token as a Tailwind 4 theme variable
// (`--color-bg-surface: var(--bg-surface)` → `bg-bg-surface`). The token
// definitions are the source of truth; this fails when the @theme block and
// the definitions drift — a token added without a class name, a class name
// without a token, or a gradient filed as a colour.

const ROOT = join(__dirname, '..', '..');
const isGradient = (value: string) => /^(linear|radial|conic)-gradient\(/.test(value);

function stylesheet(): { tokens: Map<string, string>; theme: Map<string, string> } {
  const css = readFileSync(join(ROOT, 'src/styles/globals.css'), 'utf8');
  const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const rest = css.replace(themeBlock, '');
  const tokens = new Map<string, string>();
  for (const match of rest.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const name = match[1] ?? '';
    const value = match[2] ?? '';
    if (
      name &&
      !name.startsWith('--color-') &&
      !name.startsWith('--background-image-') &&
      !tokens.has(name)
    ) {
      tokens.set(name, value.trim());
    }
  }
  const theme = new Map<string, string>();
  for (const match of themeBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    theme.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  return { tokens, theme };
}

describe('tailwind theme token names (plans E4, U3)', () => {
  const { tokens, theme } = stylesheet();

  it('the JavaScript config is gone (Tailwind 4 reads the stylesheet)', () => {
    expect(existsSync(join(ROOT, 'tailwind.config.js'))).toBe(false);
  });

  it('every colour token is a theme colour named after itself, and nothing else is', () => {
    const expected = new Map(
      [...tokens]
        .filter(([, v]) => !isGradient(v))
        .map(([k]) => [`--color-${k.slice(2)}`, `var(${k})`])
    );
    const actual = new Map([...theme].filter(([k]) => k.startsWith('--color-')));
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
  });

  it('every gradient token is a theme background image named after itself', () => {
    const expected = new Map(
      [...tokens]
        .filter(([, v]) => isGradient(v))
        .map(([k]) => [`--background-image-${k.slice(2)}`, `var(${k})`])
    );
    const actual = new Map([...theme].filter(([k]) => k.startsWith('--background-image-')));
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
  });
});
