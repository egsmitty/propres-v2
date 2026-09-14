import { describe, it, expect } from 'vitest';
import {
  editorKeyAction,
  type EditorKeyAction,
  type EditorKeyState,
} from '@/utils/editorKeyAction';

// Plan L2. The Editor's window keydown handler, as a pure decision.
//
// Most rows CHARACTERIZE what the handler already did (they pass against the
// logic as it stood). The rows marked FIX are the bugs: while presenting,
// Backspace and Delete deleted the selected slide — and autosave then wrote the
// deletion — although PowerPoint users press Backspace to go BACK a slide
// (audit LIVE-A5); ↑ / ↓ moved the editor selection instead of the slide
// (LIVE-C1); `.` (a clicker's blank button) did nothing (LIVE-C2); and every
// shortcut fired behind an open dialog or settings sheet (CMD-B6).
//
// This table is exhaustive; its length is asserted.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const IDLE: EditorKeyState = {
  isPresenting: false,
  panelOpen: false,
  editing: false,
  typing: false,
  modalOpen: false,
};
const LIVE: EditorKeyState = { ...IDLE, isPresenting: true };

type Event = Parameters<typeof editorKeyAction>[0];
type Row = [
  description: string,
  event: Event,
  state: EditorKeyState,
  expected: EditorKeyAction | null,
];

const ROWS: Row[] = [
  // Not presenting — characterization.
  ['⌘S saves', { key: 's', metaKey: true }, IDLE, 'save'],
  ['Ctrl+S saves', { key: 's', ctrlKey: true }, IDLE, 'save'],
  ['↑ selects the previous slide', { key: 'ArrowUp' }, IDLE, 'selectPrev'],
  ['↓ selects the next slide', { key: 'ArrowDown' }, IDLE, 'selectNext'],
  ['Delete deletes the slide', { key: 'Delete' }, IDLE, 'deleteSlide'],
  ['Backspace deletes the slide', { key: 'Backspace' }, IDLE, 'deleteSlide'],
  ['F5 presents', { key: 'F5' }, IDLE, 'present'],
  ['? toggles the shortcuts sheet', { key: '?' }, IDLE, 'toggleShortcuts'],
  ['Escape does nothing when not presenting', { key: 'Escape' }, IDLE, null],
  ['B does nothing when not presenting', { key: 'b' }, IDLE, null],
  ['L does nothing when not presenting', { key: 'l' }, IDLE, null],
  ['⌘↑ is not a selection move', { key: 'ArrowUp', metaKey: true }, IDLE, null],
  ['⌘⌫ does not delete', { key: 'Backspace', metaKey: true }, IDLE, null],
  ['nothing with a library panel open', { key: 'Delete' }, { ...IDLE, panelOpen: true }, null],
  ['nothing while a text box is being edited', { key: 'Delete' }, { ...IDLE, editing: true }, null],
  ['nothing while typing in a field', { key: 'Delete' }, { ...IDLE, typing: true }, null],
  // FIX (CMD-B6): nothing fires behind a dialog or settings sheet.
  ['FIX: nothing behind an open modal', { key: 'Delete' }, { ...IDLE, modalOpen: true }, null],
  [
    'FIX: no save behind an open modal',
    { key: 's', metaKey: true },
    { ...IDLE, modalOpen: true },
    null,
  ],

  // Presenting.
  ['⌘S still saves while presenting', { key: 's', metaKey: true }, LIVE, 'save'],
  ['F5 while presenting is left to the command (no-op there)', { key: 'F5' }, LIVE, 'present'],
  ['B blacks the output', { key: 'b' }, LIVE, 'black'],
  ['B (shifted) blacks the output', { key: 'B' }, LIVE, 'black'],
  ['L shows the logo', { key: 'l' }, LIVE, 'logo'],
  ['L (shifted) shows the logo', { key: 'L' }, LIVE, 'logo'],
  ['⌘B while presenting is not black', { key: 'b', metaKey: true }, LIVE, null],
  [
    'Escape nobody consumed stops presenting',
    { key: 'Escape', defaultPrevented: false },
    LIVE,
    'stopPresenting',
  ],
  ['Escape an overlay consumed does not', { key: 'Escape', defaultPrevented: true }, LIVE, null],
  // FIX (LIVE-A5): Backspace / Delete never delete a slide mid-service.
  [
    'FIX: Backspace while presenting does not delete (the panel goes back)',
    { key: 'Backspace' },
    LIVE,
    null,
  ],
  ['FIX: Delete while presenting does nothing', { key: 'Delete' }, LIVE, null],
  // FIX (LIVE-C1): ↑ / ↓ move the slide in the panel, not the editor selection.
  ['FIX: ↑ while presenting is left to the panel', { key: 'ArrowUp' }, LIVE, null],
  ['FIX: ↓ while presenting is left to the panel', { key: 'ArrowDown' }, LIVE, null],
  // FIX (LIVE-C2): the clicker's blank button.
  ['FIX: . blacks the output', { key: '.' }, LIVE, 'black'],
  ['FIX: B behind an open modal does nothing', { key: 'b' }, { ...LIVE, modalOpen: true }, null],
];

describe('editorKeyAction', () => {
  it('the table covers all 33 rows', () => {
    expect(ROWS).toHaveLength(33);
  });

  for (const [description, event, state, expected] of ROWS) {
    it(`${description} → ${expected ?? 'nothing'}`, () => {
      expect(editorKeyAction(event, state)).toBe(expected);
    });
  }
});
