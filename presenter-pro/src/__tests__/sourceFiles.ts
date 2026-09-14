import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// REPO-33. `inlineStyleBudget.test.ts`, `keyboardReachability.test.ts`, and
// `importCycles.test.ts` each need to recursively collect source files under
// a root, filtered by extension. This is the one implementation — do not
// hand-roll another recursive readdirSync walker in a new test file; import
// this instead.

export interface ListSourceFilesOptions {
  /** File extensions to include, matched by suffix, e.g. ['.jsx', '.tsx']. */
  extensions: string[];
  /** Exclude files whose name contains ".test." (default true). */
  excludeTestFiles?: boolean;
}

/** macOS/iCloud sync duplicates left behind on a shared drive: "Foo 2.jsx". */
const ICLOUD_DUPLICATE = / \d(\.|$)/;

/**
 * Recursively lists files under `root` matching `extensions`, skipping
 * `__tests__` and `node_modules` directories and iCloud-duplicate-named
 * entries (directories or files).
 */
export function listSourceFiles(root: string, options: ListSourceFilesOptions): string[] {
  const { extensions, excludeTestFiles = true } = options;
  const out: string[] = [];

  for (const name of readdirSync(root)) {
    if (name === '__tests__' || name === 'node_modules' || ICLOUD_DUPLICATE.test(name)) continue;

    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full, options));
      continue;
    }

    if (!extensions.some((ext) => name.endsWith(ext))) continue;
    if (excludeTestFiles && name.includes('.test.')) continue;
    out.push(full);
  }

  return out;
}
