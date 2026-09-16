import { describe, it, expect } from 'vitest';
import {
  COMMANDS,
  IN_APP_MENU_ORDER,
  commandTooltip,
  isCommandEnabled,
  menuItems,
  nativeCommands,
  shortcutGroups,
  type CommandState,
} from '@/utils/commandRegistry';

// Plan CMDS1. The registry is the ONE description of every command: its id,
// label, menu, shortcut and enabled rule. The in-app menu, the shortcuts
// sheet, the toolbar tooltips and the guard in `runAppCommand` all read it.
//
// Whole-array equality on purpose — an item that appears, disappears or moves
// is a change the operator sees. If an assertion fails, the bug is elsewhere —
// never loosen the assertion to pass.

/** A clean, saved presentation open in the editor, nothing live. */
const EDITOR: CommandState = {
  view: 'editor',
  hasPresentation: true,
  isDirty: false,
  requiresInitialSave: false,
  isPresenting: false,
  presenterPanelOpen: false,
  filmstripVisible: true,
  typing: false,
  // Two or more versions: Version History has something earlier to restore.
  versionCount: 2,
};

/** Home, with a stale presentation still in the editor store (audit CMD-B4). */
const HOME: CommandState = { ...EDITOR, view: 'home' };

const LIVE: CommandState = { ...EDITOR, isPresenting: true };

const IDS = [
  'file:new',
  'file:open',
  'file:save',
  'file:saveAs',
  'file:revert',
  'file:versionHistory',
  'file:close',
  'insert:newSlide',
  'insert:song',
  'insert:media',
  'insert:announcement',
  'insert:sermon',
  'insert:image',
  'insert:video',
  'edit:undo',
  'edit:redo',
  'edit:presentationSettings',
  'view:outputSettings',
  'view:filmstrip',
  'view:songLibrary',
  'view:mediaLibrary',
  'view:presenterPanel',
  'present:start',
  'present:stop',
  'present:black',
  'present:logo',
  'help:shortcuts',
  'help:tutorial',
  'help:about',
  'window:requestClose',
];

describe('1. the registry lists every command once, in order', () => {
  it('has exactly the 30 live ids (37 switch cases minus the 7 dead ones)', () => {
    expect(COMMANDS.map((command) => command.id)).toEqual(IDS);
    expect(IN_APP_MENU_ORDER).toEqual(['file', 'insert', 'edit', 'view', 'present', 'help']);
  });
});

describe('2. the enabled matrix', () => {
  const ALWAYS = [
    'file:new',
    'file:open',
    'help:shortcuts',
    'help:tutorial',
    'help:about',
    'window:requestClose',
  ];
  const EDITOR_ONLY = [
    'file:close',
    'insert:newSlide',
    'insert:song',
    'insert:media',
    'insert:announcement',
    'insert:sermon',
    'insert:image',
    'insert:video',
    'edit:presentationSettings',
    'view:outputSettings',
    'view:filmstrip',
    'view:songLibrary',
    'view:mediaLibrary',
    'view:presenterPanel',
  ];

  // Every row is (id, state, expected). The table is exhaustive by
  // construction: the last test walks COMMANDS and fails on any id without a row.
  const ROWS: Array<[string, CommandState, boolean]> = [
    ...ALWAYS.flatMap((id): Array<[string, CommandState, boolean]> => [
      [id, HOME, true],
      [id, EDITOR, true],
      [id, LIVE, true],
    ]),
    ...EDITOR_ONLY.flatMap((id): Array<[string, CommandState, boolean]> => [
      [id, HOME, false],
      [id, EDITOR, true],
      [id, { ...EDITOR, hasPresentation: false }, false],
    ]),
    // Save and Save As need a document, not the editor view (see the registry).
    ['file:save', EDITOR, true],
    ['file:save', HOME, true],
    ['file:save', { ...HOME, hasPresentation: false }, false],
    ['file:saveAs', EDITOR, true],
    ['file:saveAs', HOME, true],
    ['file:saveAs', { ...HOME, hasPresentation: false }, false],
    ['file:revert', EDITOR, false],
    ['file:revert', { ...EDITOR, isDirty: true }, true],
    ['file:revert', { ...EDITOR, isDirty: true, requiresInitialSave: true }, false],
    ['file:revert', { ...HOME, isDirty: true }, false],
    ['file:versionHistory', EDITOR, true],
    ['file:versionHistory', LIVE, false],
    ['file:versionHistory', HOME, false],
    ['file:versionHistory', { ...EDITOR, hasPresentation: false }, false],
    // Plan VH1 (issue #159): nothing earlier to restore with one version or none.
    ['file:versionHistory', { ...EDITOR, versionCount: 1 }, false],
    ['file:versionHistory', { ...EDITOR, versionCount: 0 }, false],
    ['present:start', EDITOR, true],
    ['present:start', LIVE, false],
    ['present:start', HOME, false],
    ['present:start', { ...EDITOR, hasPresentation: false }, false],
    ['present:stop', LIVE, true],
    ['present:stop', EDITOR, false],
    ['present:black', LIVE, true],
    ['present:black', EDITOR, false],
    ['present:logo', LIVE, true],
    ['present:logo', EDITOR, false],
    // Undo/redo follow focus: a Home rename field must keep ⌘Z (Decision 2).
    ['edit:undo', EDITOR, true],
    ['edit:undo', HOME, false],
    ['edit:undo', { ...HOME, typing: true }, true],
    ['edit:redo', EDITOR, true],
    ['edit:redo', HOME, false],
    ['edit:redo', { ...HOME, typing: true }, true],
  ];

  it('has a row for every registry id and no unknown id', () => {
    const covered = new Set(ROWS.map(([id]) => id));
    for (const command of COMMANDS) {
      expect(covered.has(command.id), `no matrix row for ${command.id}`).toBe(true);
    }
    for (const id of covered) {
      expect(IDS.includes(id), `matrix row for unknown id ${id}`).toBe(true);
    }
    // 32 explicit rows follow the two generated blocks (VH1 added two
    // file:versionHistory gate rows for versionCount 1 and 0).
    expect(ROWS).toHaveLength(ALWAYS.length * 3 + EDITOR_ONLY.length * 3 + 32);
  });

  it('the quit handshake is enabled in EVERY state — a false here deadlocks quit', () => {
    // runAppCommand is the sole caller of resolveWindowCloseRequest(); a
    // refused window:requestClose leaves main waiting forever (phase7 #11).
    const states = ROWS.map(([, state]) => state);
    expect(states.length).toBeGreaterThan(0);
    for (const state of states) {
      expect(isCommandEnabled('window:requestClose', state)).toBe(true);
    }
  });

  it.each(ROWS)('%s in %j → %s', (id, state, expected) => {
    expect(isCommandEnabled(id, state)).toBe(expected);
  });

  it('an id the registry does not know is never enabled', () => {
    expect(isCommandEnabled('edit:copySlide', EDITOR)).toBe(false);
    expect(isCommandEnabled('', EDITOR)).toBe(false);
  });
});

describe('3. the in-app File menu, in layout order', () => {
  it('matches the menu bar for a clean, saved, open presentation', () => {
    expect(menuItems('file', EDITOR, 'darwin')).toEqual([
      { id: 'file:new', label: 'New Presentation', shortcut: '⌘N', disabled: false },
      { id: 'file:open', label: 'Open…', shortcut: '⌘O', disabled: false },
      { id: 'file:save', label: 'Save', shortcut: '⌘S', disabled: false },
      { id: 'file:saveAs', label: 'Save As…', shortcut: '⌘⇧S', disabled: false },
      { id: 'file:revert', label: 'Revert to Last Save', shortcut: '', disabled: true },
      { id: 'file:versionHistory', label: 'Version History…', shortcut: '', disabled: false },
      { divider: true },
      { id: 'file:close', label: 'Close', shortcut: '⌘W', disabled: false },
    ]);
  });

  it('uses Ctrl on Windows', () => {
    expect(menuItems('file', EDITOR, 'win32')[0]).toEqual({
      id: 'file:new',
      label: 'New Presentation',
      shortcut: 'Ctrl+N',
      disabled: false,
    });
  });

  it('the Present menu shows the renderer-owned keys as hints', () => {
    expect(menuItems('present', LIVE, 'darwin')).toEqual([
      { id: 'present:start', label: 'Start Presenting', shortcut: 'F5', disabled: true },
      { id: 'present:stop', label: 'Stop Presenting', shortcut: 'Esc', disabled: false },
      { divider: true },
      { id: 'present:black', label: 'Black Screen', shortcut: 'B', disabled: false },
      { id: 'present:logo', label: 'Logo Screen', shortcut: 'L', disabled: false },
    ]);
  });
});

describe('4. dynamic labels', () => {
  it('Service Order and Presenter Panel read Show or Hide from state', () => {
    const view = (state: CommandState) =>
      menuItems('view', state, 'darwin').map((item) => ('label' in item ? item.label : '—'));
    expect(view(EDITOR)).toEqual([
      'Hide Service Order',
      'Song Library',
      'Media Library',
      'Show Presenter Panel',
    ]);
    expect(view({ ...EDITOR, filmstripVisible: false, presenterPanelOpen: true })).toEqual([
      'Show Service Order',
      'Song Library',
      'Media Library',
      'Hide Presenter Panel',
    ]);
  });
});

describe('5. the shortcuts sheet is generated from the registry', () => {
  it('lists every command with a shortcut, grouped by menu, on macOS', () => {
    expect(shortcutGroups('darwin')).toEqual([
      {
        group: 'File',
        items: [
          { label: 'New Presentation', keys: ['⌘', 'N'] },
          { label: 'Open…', keys: ['⌘', 'O'] },
          { label: 'Save', keys: ['⌘', 'S'] },
          { label: 'Save As…', keys: ['⌘', '⇧', 'S'] },
          { label: 'Close', keys: ['⌘', 'W'] },
        ],
      },
      { group: 'Insert', items: [{ label: 'New Slide', keys: ['⌘', 'M'] }] },
      {
        group: 'Edit',
        items: [
          { label: 'Undo', keys: ['⌘', 'Z'] },
          { label: 'Redo', keys: ['⌘', '⇧', 'Z'] },
        ],
      },
      {
        group: 'Present',
        items: [
          { label: 'Start Presenting', keys: ['F5'] },
          { label: 'Stop Presenting', keys: ['Esc'] },
          { label: 'Black Screen', keys: ['B'] },
          { label: 'Logo Screen', keys: ['L'] },
        ],
      },
    ]);
  });

  it('leaves the Help menu to the sheet itself ("Show this overlay" is asserted by an E2E spec)', () => {
    expect(shortcutGroups('darwin').map((group) => group.group)).toEqual([
      'File',
      'Insert',
      'Edit',
      'Present',
    ]);
  });

  it('uses Ctrl and Shift on Windows', () => {
    const file = shortcutGroups('win32')[0];
    expect(file?.items.map((item) => item.keys)).toEqual([
      ['Ctrl', 'N'],
      ['Ctrl', 'O'],
      ['Ctrl', 'S'],
      ['Ctrl', 'Shift', 'S'],
      ['Ctrl', 'W'],
    ]);
  });
});

describe('6. tooltips', () => {
  it('name the command and its shortcut for the platform', () => {
    expect(commandTooltip('present:start', 'darwin')).toBe('Present (F5)');
    expect(commandTooltip('present:stop', 'darwin')).toBe('Stop Presenting (Esc)');
    expect(commandTooltip('insert:newSlide', 'darwin')).toBe('New Slide (⌘M)');
    expect(commandTooltip('insert:newSlide', 'win32')).toBe('New Slide (Ctrl+M)');
  });
});

describe('7. the native menu set', () => {
  it('is exactly the commands the native template sends, in registry order', () => {
    expect(nativeCommands()).toEqual([
      'file:new',
      'file:open',
      'file:save',
      'file:saveAs',
      'file:revert',
      'file:versionHistory',
      'file:close',
      'insert:newSlide',
      'insert:image',
      'insert:video',
      'edit:undo',
      'edit:redo',
      'edit:presentationSettings',
      'view:outputSettings',
      'view:songLibrary',
      'view:mediaLibrary',
      'view:presenterPanel',
      'present:start',
      'present:stop',
      'present:black',
      'present:logo',
    ]);
  });

  it('names the one native label that differs from the in-app one', () => {
    expect(
      COMMANDS.filter((command) => command.nativeLabel).map((command) => [
        command.id,
        command.nativeLabel,
      ])
    ).toEqual([['view:presenterPanel', 'Show / Hide Presenter Panel']]);
  });

  it('syncs enabled for every native command except the focus-dependent undo and redo', () => {
    const synced = COMMANDS.filter((command) => command.syncEnabled).map((command) => command.id);
    expect(synced).toEqual(
      nativeCommands().filter((id) => id !== 'edit:undo' && id !== 'edit:redo')
    );
  });
});

describe('8. hints', () => {
  it('B, L and Escape are shown but owned by the renderer; nothing else is a hint', () => {
    expect(COMMANDS.filter((command) => command.hint).map((command) => command.id)).toEqual([
      'present:stop',
      'present:black',
      'present:logo',
    ]);
  });
});
