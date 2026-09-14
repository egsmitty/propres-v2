// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Plan CMDS1 (audit CMD-B4, CMD-B5). Native menu commands used to run
// unconditionally: on Home, with a presentation still sitting in the editor
// store, ⌘M added a slide to the hidden deck and F5 presented it. Now the
// registry's enabled rule guards `runAppCommand` whatever path a command
// arrives by, and the registry and the switch are held to the same set of
// ids by reading the source.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  showDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/unsavedChanges', () => ({ resolveUnsavedChanges: vi.fn() }));
vi.mock('@/utils/presenterFlow', () => ({
  stopPresentationSession: vi.fn(),
  startSidebarPresentationSession: vi.fn(),
}));
vi.mock('@/utils/ipc', () => ({
  openOutputWindow: vi.fn(),
  openStageDisplayWindow: vi.fn(),
  touchPresentation: vi.fn(),
  windowClose: vi.fn(),
  resolveWindowCloseRequest: vi.fn(),
  sendBlack: vi.fn(),
  sendLogo: vi.fn(),
}));
vi.mock('@/utils/presentationCommands', () => ({
  copySelectedSlideToClipboard: vi.fn(),
  createNewPresentation: vi.fn(),
  clearSelectedSlide: vi.fn(),
  importMediaToSelectedSlide: vi.fn(),
  insertNewSlideIntoCurrentPresentation: vi.fn(),
  insertNewSectionIntoCurrentPresentation: vi.fn(),
  pasteSlideAfterSelected: vi.fn(),
  revertCurrentPresentationToLastSave: vi.fn(),
  saveCurrentPresentation: vi.fn(),
  saveCurrentPresentationAs: vi.fn(),
}));

import { runAppCommand } from '@/utils/appCommands';
import { COMMANDS } from '@/utils/commandRegistry';
import {
  importMediaToSelectedSlide,
  insertNewSlideIntoCurrentPresentation,
} from '@/utils/presentationCommands';
import { startSidebarPresentationSession } from '@/utils/presenterFlow';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();
const PRESENTATION = { id: 'p1', sections: [{ id: 's1', slides: [{ id: 'a' }] }] };

/** (id, the mock its editor-only action calls). */
const EDITOR_COMMANDS: Array<[string, () => unknown]> = [
  ['insert:newSlide', insertNewSlideIntoCurrentPresentation],
  ['insert:image', importMediaToSelectedSlide],
  ['present:start', startSidebarPresentationSession],
];

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  // A stale presentation in the editor store while Home is showing — the
  // state CMD-B4 was reported in.
  useEditorStore.setState({ presentation: PRESENTATION });
  // `as never`: the mocks return `true` where the real functions return an
  // envelope or a nested promise; only the truthiness reaches runAppCommand.
  vi.mocked(insertNewSlideIntoCurrentPresentation).mockReturnValue(true as never);
  vi.mocked(importMediaToSelectedSlide).mockResolvedValue(true as never);
  vi.mocked(startSidebarPresentationSession).mockResolvedValue(true as never);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the registry guards runAppCommand', () => {
  it('on Home, editor commands do nothing and touch nothing (CMD-B4)', async () => {
    expect(EDITOR_COMMANDS).toHaveLength(3);
    for (const [id, action] of EDITOR_COMMANDS) {
      await expect(runAppCommand(id), id).resolves.toBe(false);
      expect(action, id).toHaveBeenCalledTimes(0);
    }
    await expect(runAppCommand('file:versionHistory')).resolves.toBe(false);
    expect(useAppStore.getState().versionHistoryOpen).toBe(false);
  });

  it('in the editor, the same commands reach their actions', async () => {
    useAppStore.setState({ currentView: 'editor' });
    for (const [id, action] of EDITOR_COMMANDS) {
      await expect(runAppCommand(id), id).resolves.toBe(true);
      expect(action, id).toHaveBeenCalledTimes(1);
    }
    await expect(runAppCommand('file:versionHistory')).resolves.toBe(true);
    expect(useAppStore.getState().versionHistoryOpen).toBe(true);
  });

  it('Version History is refused while presenting, even from the editor (CMD-B5)', async () => {
    useAppStore.setState({ currentView: 'editor' });
    usePresenterStore.setState({ isPresenting: true });
    await expect(runAppCommand('file:versionHistory')).resolves.toBe(false);
    expect(useAppStore.getState().versionHistoryOpen).toBe(false);
  });

  it('undo on Home still reaches a focused text field', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    // jsdom has no execCommand; the seam is stubbed, not asserted through.
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    await expect(runAppCommand('edit:undo')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('undo');
  });

  it('a command the registry does not know is refused', async () => {
    useAppStore.setState({ currentView: 'editor' });
    await expect(runAppCommand('edit:copySlide')).resolves.toBe(false);
  });
});

describe('the switch and the registry are the same set', () => {
  it('every case label is a registry id and every registry id is a case label', () => {
    const source = readFileSync(resolve(__dirname, '../appCommands.js'), 'utf8');
    const cases = Array.from(source.matchAll(/^\s*case '([a-z]+:[A-Za-z]+)':/gm), (m) => m[1]);
    const ids = COMMANDS.map((c) => c.id);
    expect(cases).toHaveLength(30);
    expect([...cases].sort()).toEqual([...ids].sort());
    expect(new Set(cases).size).toBe(cases.length);
  });
});
