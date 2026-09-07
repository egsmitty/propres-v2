import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// Plan E3. Every clickable thing must be reachable from the keyboard. A native
// element that is not a button but reacts to clicks is either a deliberate
// click-outside backdrop (marked `data-backdrop="true"`) or it must carry the
// three things that make a div keyboard-operable: a role, a tabIndex, and a
// key handler. Anything else is a mouse-only control and fails here.

const ROOT = resolve(__dirname, '../..');
const NATIVE_INTERACTIVE = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'option',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') walk(full, out);
    } else if (name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

interface Offender {
  file: string;
  line: number;
  tag: string;
}

function mouseOnlyControls(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(resolve(ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<([a-z][\w.]*)\b([^>]*?)\bonClick=/gs)) {
      const tag = match[1]!;
      if (NATIVE_INTERACTIVE.has(tag)) continue;
      const attrs = match[2]!;
      const backdrop = /data-backdrop=["']true["']/.test(attrs);
      const operable =
        /\brole=/.test(attrs) && /\btabIndex=/.test(attrs) && /\bonKeyDown=/.test(attrs);
      if (backdrop || operable) continue;
      offenders.push({
        file: relative(ROOT, file),
        line: source.slice(0, match.index).split('\n').length,
        tag,
      });
    }
  }
  return offenders;
}

describe('keyboard reachability', () => {
  it('scans a non-trivial component set', () => {
    expect(walk(resolve(ROOT, 'src')).length).toBeGreaterThan(20);
  });

  it('no native non-button element handles clicks without being keyboard-operable or a marked backdrop', () => {
    expect(mouseOnlyControls()).toEqual([]);
  });
});
