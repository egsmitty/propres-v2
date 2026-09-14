import { describe, it, expect } from 'vitest';
import { buildNativeMenuTemplate, type MenuItemTemplate } from '../nativeMenu';

// Plan L1. The native menu moved out of electron/main/index.js so it can be
// tested. The first block pins every item exactly as it was (the extraction
// changed nothing). The second block is the fix: in a packaged build a single
// Cmd+R must not reload the editor mid-service, and the single-key B / L /
// Escape shortcuts must not be registered with the OS, where they fire on top
// of the renderer's own handling (toggle twice) and even while typing.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

type Row = string;

function rows(template: MenuItemTemplate[]): Row[] {
  const out: Row[] = [];
  for (const top of template) {
    for (const item of top.submenu ?? []) {
      const name = item.type === 'separator' ? '—' : (item.label ?? `role:${item.role}`);
      out.push(`${top.label} › ${name}${item.accelerator ? ` [${item.accelerator}]` : ''}`);
    }
  }
  return out;
}

function commandsOf(template: MenuItemTemplate[], sent: string[]): string[] {
  for (const top of template) {
    for (const item of top.submenu ?? []) item.click?.();
  }
  return sent;
}

function allItems(template: MenuItemTemplate[]): MenuItemTemplate[] {
  return template.flatMap((top) => [top, ...(top.submenu ?? [])]);
}

function build(isDev: boolean) {
  const sent: string[] = [];
  const template = buildNativeMenuTemplate({ isDev, sendCommand: (c) => sent.push(c) });
  return { template, sent };
}

describe('native menu — everything except the dev tools is unchanged', () => {
  it('lists every item, in order, with its shortcut', () => {
    const { template } = build(true);
    expect(rows(template)).toEqual([
      'PresenterPro › About PresenterPro',
      'PresenterPro › —',
      'PresenterPro › role:services',
      'PresenterPro › —',
      'PresenterPro › role:hide',
      'PresenterPro › role:hideOthers',
      'PresenterPro › role:unhide',
      'PresenterPro › —',
      'PresenterPro › role:quit',
      'File › New Presentation [CmdOrCtrl+N]',
      'File › Open… [CmdOrCtrl+O]',
      'File › Save [CmdOrCtrl+S]',
      'File › Save As… [CmdOrCtrl+Shift+S]',
      'File › Revert to Last Save',
      'File › Version History…',
      'File › —',
      'File › Close [CmdOrCtrl+W]',
      'Insert › New Slide [CmdOrCtrl+M]',
      'Insert › —',
      'Insert › Insert Image…',
      'Insert › Insert Video…',
      'Present › Start Presenting [F5]',
      'Present › Stop Presenting [Escape]',
      'Present › —',
      'Present › Black Screen [B]',
      'Present › Logo Screen [L]',
      'Edit › Undo [CmdOrCtrl+Z]',
      'Edit › Redo [CmdOrCtrl+Shift+Z]',
      'Edit › —',
      'Edit › role:cut',
      'Edit › role:copy',
      'Edit › role:paste',
      'Edit › role:selectAll',
      'Edit › —',
      'Edit › Presentation Settings…',
      'Edit › Output Settings…',
      'View › role:reload',
      'View › role:toggleDevTools',
      'View › —',
      'View › Song Library',
      'View › Media Library',
      'View › Show / Hide Presenter Panel',
      'View › —',
      'View › role:togglefullscreen',
    ]);
  });

  it('every clickable item sends the command it always sent, in order', () => {
    const { template, sent } = build(true);
    expect(commandsOf(template, sent)).toEqual([
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
      'present:start',
      'present:stop',
      'present:black',
      'present:logo',
      'edit:undo',
      'edit:redo',
      'edit:presentationSettings',
      'view:outputSettings',
      'view:songLibrary',
      'view:mediaLibrary',
      'view:presenterPanel',
    ]);
  });
});

describe('native menu — production safety', () => {
  it('a packaged build has no Reload and no DevTools, and no stray separator where they were', () => {
    const { template } = build(false);
    const items = allItems(template);
    expect(items.length).toBeGreaterThan(40);
    expect(items.filter((i) => i.role === 'reload')).toEqual([]);
    expect(items.filter((i) => i.role === 'toggleDevTools')).toEqual([]);

    const view = template.find((t) => t.label === 'View');
    expect(view?.submenu?.[0]?.type).toBeUndefined();
    expect(view?.submenu?.[0]?.label).toBe('Song Library');
  });

  it('a development build keeps Reload and DevTools', () => {
    const { template } = build(true);
    const roles = allItems(template).map((i) => i.role);
    expect(roles).toContain('reload');
    expect(roles).toContain('toggleDevTools');
  });

  it('B, L and Escape show their shortcut but are not registered with the OS', () => {
    const { template } = build(false);
    const present = template.find((t) => t.label === 'Present')?.submenu ?? [];
    const byLabel = (label: string) => present.find((i) => i.label === label);

    for (const [label, key] of [
      ['Stop Presenting', 'Escape'],
      ['Black Screen', 'B'],
      ['Logo Screen', 'L'],
    ] as const) {
      expect(byLabel(label)?.accelerator).toBe(key);
      expect(byLabel(label)?.registerAccelerator).toBe(false);
    }

    // Modifier shortcuts and F5 stay real accelerators.
    expect(byLabel('Start Presenting')?.registerAccelerator).toBeUndefined();
  });
});

// Plan CMDS1. Every clickable item carries its command as its `id`, so the
// renderer can address it (`Menu.getMenuItemById`) to push enabled state.
// The pairs are collected whole: an item without an id, or with the wrong
// one, shows up as a missing or mismatched pair.
describe('native menu — ids (plan CMDS1)', () => {
  it('every clickable item has its command as its id', () => {
    const { template } = build(true);
    const pairs: Array<[string | undefined, string]> = [];
    for (const top of template) {
      for (const item of top.submenu ?? []) {
        if (!item.click) continue;
        const sent: string[] = [];
        const probe = buildNativeMenuTemplate({ isDev: true, sendCommand: (c) => sent.push(c) });
        const twin = probe
          .find((t) => t.label === top.label)
          ?.submenu?.find((i) => i.label === item.label);
        twin?.click?.();
        pairs.push([item.id, sent[0] ?? '(nothing sent)']);
      }
    }
    expect(pairs).toHaveLength(21);
    for (const [id, command] of pairs) expect(id).toBe(command);
  });
});
