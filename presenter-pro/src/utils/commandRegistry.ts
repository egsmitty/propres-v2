/**
 * Plan CMDS1 (audit CMD-S1) — the one description of every app command.
 *
 * Before this, four hand-written lists described the same commands and
 * disagreed: the `switch` in `appCommands.js`, the in-app `MenuBar`, the
 * native menu template and the shortcuts sheet. Now the in-app menu, the
 * shortcuts sheet, the toolbar tooltips and the guard at the top of
 * `runAppCommand` all read this file. The native template still spells its
 * own labels and accelerators (Electron builds it once, in the main process),
 * but a test holds it to this list, and its enabled state is pushed from here.
 *
 * The `run` bodies stay in `runAppCommand`'s switch on purpose: this is
 * registry-lite. A source-text test keeps the switch and this list identical.
 */

import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { isTypingTarget } from '@/utils/shortcutGuard';
import { formatShortcutLabel, getPlatform, getShortcutKeys } from '@/utils/platformShortcuts';

export type Menu = 'file' | 'insert' | 'edit' | 'view' | 'present' | 'help';

/** Everything an enabled rule may look at. Pure data, built once per check. */
export interface CommandState {
  view: 'home' | 'editor';
  hasPresentation: boolean;
  isDirty: boolean;
  requiresInitialSave: boolean;
  isPresenting: boolean;
  presenterPanelOpen: boolean;
  filmstripVisible: boolean;
  /** Focus is in a text field, select or contenteditable. */
  typing: boolean;
  /**
   * How many saved versions the open presentation has (plan VH1, issue #159).
   * Version History is pointless with one — there is nothing earlier to restore.
   */
  versionCount: number;
}

export interface CommandDef {
  id: string;
  label: string;
  /** The native template's label where it differs from the in-app one. */
  nativeLabel?: string;
  menu: Menu | null;
  /** Tokens for `formatShortcutLabel`: `['mod', 's']`, `['F5']`, `['esc']`. */
  shortcut?: string[];
  /** Shown as a shortcut but handled by the renderer, never registered with the OS (plan L1). */
  hint?: boolean;
  when: (state: CommandState) => boolean;
  dynamicLabel?: (state: CommandState) => string;
  /** Listed in the in-app menu bar. */
  inApp: boolean;
  /** Present in the native application menu. */
  native: boolean;
  /** Its enabled state is pushed to the native menu (plan CMDS1 PR B). */
  syncEnabled: boolean;
}

const always = () => true;
const editing = (s: CommandState) => s.view === 'editor' && s.hasPresentation;
/**
 * Save and Save As need a presentation but not the editor view: a save from
 * Home writes the same row the editor would, and the E2E harness sends
 * `file:save` the moment a blank presentation is created, before the view
 * has switched (`e2e/autosave.spec.ts`). The hazards CMD-B4 names — a slide
 * added to, or a session started on, a hidden deck — are the editor-only ones.
 */
const hasDocument = (s: CommandState) => s.hasPresentation;
const live = (s: CommandState) => s.isPresenting;
/** Undo and redo follow focus: a Home rename field keeps ⌘Z (Decision 2). */
const editingOrTyping = (s: CommandState) => s.view === 'editor' || s.typing;

function command(
  def: Omit<CommandDef, 'inApp' | 'native' | 'syncEnabled'> & {
    inApp?: boolean;
    native?: boolean;
  }
): CommandDef {
  const native = def.native ?? false;
  const focusDependent = def.id === 'edit:undo' || def.id === 'edit:redo';
  return { ...def, inApp: def.inApp ?? false, native, syncEnabled: native && !focusDependent };
}

export const COMMANDS: readonly CommandDef[] = [
  command({
    id: 'file:new',
    label: 'New Presentation',
    menu: 'file',
    shortcut: ['mod', 'n'],
    when: always,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:open',
    label: 'Open…',
    menu: 'file',
    shortcut: ['mod', 'o'],
    when: always,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:save',
    label: 'Save',
    menu: 'file',
    shortcut: ['mod', 's'],
    when: hasDocument,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:saveAs',
    label: 'Save As…',
    menu: 'file',
    shortcut: ['mod', 'shift', 's'],
    when: hasDocument,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:revert',
    label: 'Revert to Last Save',
    menu: 'file',
    // Nothing to revert to until the document has been saved once, and
    // nothing to revert while it matches its last save.
    when: (s) => editing(s) && s.isDirty && !s.requiresInitialSave,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:versionHistory',
    label: 'Version History…',
    menu: 'file',
    // Disabled mid-service: restoring replaces the presentation, and if the
    // live slide is not in the restored document the next spacebar goes to
    // slide 1 of the deck, in front of the room (audit SAVE-B1 / CMD-B5).
    // Also disabled with one version or none — there is nothing earlier to
    // restore, so opening the panel would show only the current state (VH1).
    when: (s) => editing(s) && !s.isPresenting && s.versionCount > 1,
    inApp: true,
    native: true,
  }),
  command({
    id: 'file:close',
    label: 'Close',
    menu: 'file',
    shortcut: ['mod', 'w'],
    when: editing,
    inApp: true,
    native: true,
  }),
  command({
    id: 'insert:newSlide',
    label: 'New Slide',
    menu: 'insert',
    shortcut: ['mod', 'm'],
    when: editing,
    inApp: true,
    native: true,
  }),
  command({ id: 'insert:song', label: 'Song', menu: 'insert', when: editing, inApp: true }),
  command({ id: 'insert:media', label: 'Media', menu: 'insert', when: editing, inApp: true }),
  command({
    id: 'insert:announcement',
    label: 'Announcement',
    menu: 'insert',
    when: editing,
    inApp: true,
  }),
  command({ id: 'insert:sermon', label: 'Sermon', menu: 'insert', when: editing, inApp: true }),
  command({
    id: 'insert:image',
    label: 'Insert Image…',
    menu: 'insert',
    when: editing,
    native: true,
  }),
  command({
    id: 'insert:video',
    label: 'Insert Video…',
    menu: 'insert',
    when: editing,
    native: true,
  }),
  command({
    id: 'edit:undo',
    label: 'Undo',
    menu: 'edit',
    shortcut: ['mod', 'z'],
    when: editingOrTyping,
    native: true,
  }),
  command({
    id: 'edit:redo',
    label: 'Redo',
    menu: 'edit',
    shortcut: ['mod', 'shift', 'z'],
    when: editingOrTyping,
    native: true,
  }),
  command({
    id: 'edit:presentationSettings',
    label: 'Presentation Settings…',
    menu: 'edit',
    when: editing,
    inApp: true,
    native: true,
  }),
  command({
    id: 'view:outputSettings',
    label: 'Output Settings…',
    menu: 'edit',
    when: editing,
    inApp: true,
    native: true,
  }),
  command({
    id: 'view:filmstrip',
    label: 'Service Order',
    menu: 'view',
    when: editing,
    dynamicLabel: (s) => (s.filmstripVisible ? 'Hide Service Order' : 'Show Service Order'),
    inApp: true,
  }),
  command({
    id: 'view:songLibrary',
    label: 'Song Library',
    menu: 'view',
    when: editing,
    inApp: true,
    native: true,
  }),
  command({
    id: 'view:mediaLibrary',
    label: 'Media Library',
    menu: 'view',
    when: editing,
    inApp: true,
    native: true,
  }),
  command({
    id: 'view:presenterPanel',
    label: 'Presenter Panel',
    nativeLabel: 'Show / Hide Presenter Panel',
    menu: 'view',
    when: editing,
    dynamicLabel: (s) => (s.presenterPanelOpen ? 'Hide Presenter Panel' : 'Show Presenter Panel'),
    inApp: true,
    native: true,
  }),
  command({
    id: 'present:start',
    label: 'Start Presenting',
    menu: 'present',
    shortcut: ['F5'],
    when: (s) => editing(s) && !s.isPresenting,
    inApp: true,
    native: true,
  }),
  command({
    id: 'present:stop',
    label: 'Stop Presenting',
    menu: 'present',
    shortcut: ['esc'],
    hint: true,
    when: live,
    inApp: true,
    native: true,
  }),
  command({
    id: 'present:black',
    label: 'Black Screen',
    menu: 'present',
    shortcut: ['b'],
    hint: true,
    when: live,
    inApp: true,
    native: true,
  }),
  command({
    id: 'present:logo',
    label: 'Logo Screen',
    menu: 'present',
    shortcut: ['l'],
    hint: true,
    when: live,
    inApp: true,
    native: true,
  }),
  command({
    id: 'help:shortcuts',
    label: 'Keyboard Shortcuts',
    menu: 'help',
    shortcut: ['?'],
    when: always,
    inApp: true,
  }),
  command({ id: 'help:tutorial', label: 'Show Tutorial', menu: 'help', when: always, inApp: true }),
  command({
    id: 'help:about',
    label: 'About PresenterPro',
    menu: 'help',
    when: always,
    inApp: true,
  }),
  command({ id: 'window:requestClose', label: 'Close Window', menu: null, when: always }),
];

const BY_ID: ReadonlyMap<string, CommandDef> = new Map(COMMANDS.map((c) => [c.id, c]));

export const IN_APP_MENU_ORDER: Menu[] = ['file', 'insert', 'present', 'edit', 'view', 'help'];

export const MENU_TITLES: Record<Menu, string> = {
  file: 'File',
  insert: 'Insert',
  edit: 'Edit',
  view: 'View',
  present: 'Present',
  help: 'Help',
};

/** The in-app menu bar's rows, in order; `'---'` is a divider. */
export const IN_APP_MENU_LAYOUT: Record<Menu, readonly (string | '---')[]> = {
  file: [
    'file:new',
    'file:open',
    'file:save',
    'file:saveAs',
    'file:revert',
    'file:versionHistory',
    '---',
    'file:close',
  ],
  insert: [
    'insert:newSlide',
    '---',
    'insert:song',
    'insert:media',
    'insert:announcement',
    'insert:sermon',
  ],
  edit: ['edit:presentationSettings', 'view:outputSettings'],
  view: ['view:filmstrip', 'view:songLibrary', 'view:mediaLibrary', 'view:presenterPanel'],
  present: ['present:start', 'present:stop', '---', 'present:black', 'present:logo'],
  help: ['help:tutorial', 'help:shortcuts', 'help:about'],
};

export function readCommandState(): CommandState {
  const app = useAppStore.getState();
  const editor = useEditorStore.getState();
  const presenter = usePresenterStore.getState();
  return {
    view: app.currentView === 'editor' ? 'editor' : 'home',
    hasPresentation: Boolean(editor.presentation),
    isDirty: Boolean(editor.isDirty),
    requiresInitialSave: Boolean(editor.requiresInitialSave),
    isPresenting: Boolean(presenter.isPresenting),
    presenterPanelOpen: Boolean(presenter.presenterPanelOpen),
    filmstripVisible: Boolean(app.filmstripVisible),
    typing: typeof document !== 'undefined' && isTypingTarget(document.activeElement),
    versionCount: Number(editor.versionCount) || 0,
  };
}

export function getCommand(id: string): CommandDef | undefined {
  return BY_ID.get(id);
}

/** False for an id the registry does not know. */
export function isCommandEnabled(id: string, state: CommandState): boolean {
  const def = BY_ID.get(id);
  return def ? def.when(state) : false;
}

export function commandLabel(id: string, state: CommandState): string {
  const def = BY_ID.get(id);
  if (!def) return '';
  return def.dynamicLabel ? def.dynamicLabel(state) : def.label;
}

export type MenuRow =
  { divider: true } | { id: string; label: string; shortcut: string; disabled: boolean };

export function menuItems(menu: Menu, state: CommandState, platform = getPlatform()): MenuRow[] {
  return IN_APP_MENU_LAYOUT[menu].map((entry) => {
    if (entry === '---') return { divider: true };
    const def = BY_ID.get(entry);
    if (!def) throw new Error(`menu layout names unknown command ${entry}`);
    return {
      id: def.id,
      label: commandLabel(def.id, state),
      shortcut: def.shortcut ? formatShortcutLabel(def.shortcut, platform) : '',
      disabled: !def.when(state),
    };
  });
}

export interface ShortcutGroup {
  group: string;
  items: Array<{ label: string; keys: string[] }>;
}

/**
 * The shortcuts sheet: every command with a shortcut, grouped by menu. The
 * Help menu is left out — the sheet's own key (`?`) is listed by the sheet as
 * "Show this overlay", a string an E2E spec asserts.
 */
export function shortcutGroups(platform = getPlatform()): ShortcutGroup[] {
  return IN_APP_MENU_ORDER.filter((menu) => menu !== 'help')
    .map((menu) => ({
      group: MENU_TITLES[menu],
      items: COMMANDS.filter((c) => c.menu === menu && c.shortcut).map((c) => ({
        label: c.label,
        keys: getShortcutKeys(c.shortcut, platform),
      })),
    }))
    .filter((group) => group.items.length > 0);
}

const TOOLTIP_LABELS: Record<string, string> = { 'present:start': 'Present' };

export function commandTooltip(id: string, platform = getPlatform()): string {
  const def = BY_ID.get(id);
  if (!def) return '';
  const label = TOOLTIP_LABELS[id] ?? def.label;
  return def.shortcut ? `${label} (${formatShortcutLabel(def.shortcut, platform)})` : label;
}

/** The commands the native application menu sends, in registry order. */
export function nativeCommands(): string[] {
  return COMMANDS.filter((c) => c.native).map((c) => c.id);
}

/** The enabled map pushed to the native menu (PR B). */
export function nativeMenuEnabled(state: CommandState): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  for (const c of COMMANDS) if (c.syncEnabled) enabled[c.id] = c.when(state);
  return enabled;
}
