// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({ getElectronPlatform: () => 'darwin' }));

import ShortcutsOverlay from '@/components/shared/ShortcutsOverlay';

// Plan CMDS1, Todo 7. The sheet's command rows are generated from the
// registry; the key rows (what a bare key does) stay hand-written. This pins
// every group, every row, in order — the whole sheet as one array.
//
// Deliberate content change from the hand-written sheet it replaces: Close,
// Undo and Redo appear; "Exit text editing / stop presenting" is now "Exit
// text editing" under Keys, and "Stop Presenting" appears once, under
// Present. "Show this overlay" is kept verbatim — an E2E spec asserts it.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

describe('ShortcutsOverlay', () => {
  it('lists every group and row, in order, on macOS', () => {
    const { container } = render(<ShortcutsOverlay onClose={() => {}} />);
    const groups = Array.from(container.querySelectorAll('.grid > div')).map((group) => ({
      group: group.querySelector('p')?.textContent,
      rows: Array.from(group.querySelectorAll('.flex.items-center.justify-between')).map((row) => [
        row.querySelector('span')?.textContent,
        Array.from(row.querySelectorAll('kbd')).map((kbd) => kbd.textContent),
      ]),
    }));

    expect(groups).toEqual([
      {
        group: 'File',
        rows: [
          ['New Presentation', ['⌘', 'N']],
          ['Open…', ['⌘', 'O']],
          ['Save', ['⌘', 'S']],
          ['Save As…', ['⌘', '⇧', 'S']],
          ['Close', ['⌘', 'W']],
        ],
      },
      { group: 'Insert', rows: [['New Slide', ['⌘', 'M']]] },
      {
        group: 'Present',
        rows: [
          ['Start Presenting', ['F5']],
          ['Stop Presenting', ['Esc']],
          ['Black Screen', ['B']],
          ['Logo Screen', ['L']],
        ],
      },
      {
        group: 'Edit',
        rows: [
          ['Undo', ['⌘', 'Z']],
          ['Redo', ['⌘', '⇧', 'Z']],
        ],
      },
      {
        group: 'Keys',
        rows: [
          ['Edit slide text', ['Double-click']],
          ['Exit text editing', ['Esc']],
          ['Previous / Next slide', ['←', '→']],
          ['Show this overlay', ['?']],
        ],
      },
    ]);
  });
});
