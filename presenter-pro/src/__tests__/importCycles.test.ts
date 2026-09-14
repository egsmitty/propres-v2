import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { listSourceFiles } from './sourceFiles';

// REPO-30a. `sectionTypes.js` and `backgrounds.js` used to import each other
// — a cycle only visible by reading both files side by side. This walks the
// whole internal `src` import graph and fails CI the moment a new cycle
// appears, instead of waiting for someone to notice.
//
// Only static `import ... from '...'` / `export ... from '...'` specifiers
// are parsed (regex, not a real parser — good enough for this codebase's
// import style). Relative specifiers and the `@/` alias (-> `src/`, per
// vitest.config.mjs / tsconfig.json) are resolved against the extensions
// `.js .jsx .ts .tsx /index.js`, in that order; a bare package specifier
// (no `.` or `@/` prefix) is external and not part of the graph.

const SRC = resolve(__dirname, '..');
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const RESOLVE_SUFFIXES = ['.js', '.jsx', '.ts', '.tsx', '/index.js'];

const files = listSourceFiles(SRC, { extensions: EXTENSIONS });
const FILES = new Set(files);

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  // `import ... from '...'` / `export ... from '...'`, including multi-line
  // named-import lists (the character class matches newlines; it stops at
  // the first `;`, which an import/export clause does not contain before
  // `from`).
  for (const match of source.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)) {
    found.push(match[1]!);
  }
  // Bare side-effect imports: `import '...'` (no `from`).
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
    found.push(match[1]!);
  }
  return found;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = join(dirname(fromFile), specifier);
  } else {
    return null; // external package — not part of the internal graph
  }

  if (FILES.has(base)) return base;
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (FILES.has(candidate)) return candidate;
  }
  return null;
}

const graph = new Map<string, Set<string>>();
let edgeCount = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const edges = new Set<string>();
  for (const specifier of specifiersOf(source)) {
    const resolved = resolveSpecifier(file, specifier);
    if (resolved && resolved !== file) edges.add(resolved);
  }
  graph.set(file, edges);
  edgeCount += edges.size;
}

function findCycles(): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(node: string): void {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'visiting') {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      visit(next);
    }
    stack.pop();
    state.set(node, 'done');
  }

  for (const node of graph.keys()) visit(node);
  return cycles;
}

describe('import cycles', () => {
  // Self-enforcing floor: if this drops, the walker/regex broke silently
  // instead of the graph legitimately being empty.
  it('scans a non-trivial file and edge set', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(edgeCount).toBeGreaterThan(100);
  });

  it('the internal src import graph has no cycles', () => {
    const cycles = findCycles();
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        console.error('Import cycle:', cycle.map((f) => relative(SRC, f)).join(' -> '));
      }
    }
    // Exactness matters: any cycle at all is a failure, not "fewer than N".
    expect(cycles).toEqual([]);
  });
});
