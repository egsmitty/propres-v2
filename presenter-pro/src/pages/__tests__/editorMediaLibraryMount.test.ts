import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Plan #155-P4. The Editor mounts the media library as the modal, not the old
// 320px panel. A source-text guard, like SAVED1's one-writer guard: rendering
// the whole Editor to prove one mount would drag in every subsystem, and the
// switch is exactly one line of JSX plus one import.

const EDITOR_SOURCE = readFileSync(join(__dirname, '..', 'Editor.jsx'), 'utf8');

describe('Editor mounts the media library modal (plan #155-P4)', () => {
  it('renders <MediaLibraryModal /> behind mediaLibraryOpen', () => {
    expect(EDITOR_SOURCE).toMatch(/\{mediaLibraryOpen && <MediaLibraryModal \/>\}/);
  });

  it('no longer references the retired panel', () => {
    expect(EDITOR_SOURCE).not.toMatch(/MediaLibraryPanel/);
  });
});
