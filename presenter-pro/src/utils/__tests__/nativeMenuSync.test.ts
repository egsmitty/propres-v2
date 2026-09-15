// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/ipc', () => ({
  setMenuEnabled: vi.fn(),
  getElectronPlatform: () => 'darwin',
}));

import { setMenuEnabled } from '@/utils/ipc';
import { startNativeMenuSync } from '@/utils/nativeMenuSync';
import { COMMANDS } from '@/utils/commandRegistry';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

// Plan CMDS1 PR B. The main window pushes the native menu's enabled map once
// on start and again whenever it changes — and only then. The output and
// stage windows must push NOTHING: they hold their own stores (Home view, no
// presentation), and a push from them would grey the whole menu, last writer
// wins.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

const APP_INITIAL = useAppStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();
const PRESENTATION = { id: 'p1', sections: [{ id: 's1', slides: [{ id: 'a' }] }] };

const SYNCED_IDS = COMMANDS.filter((c) => c.syncEnabled).map((c) => c.id);

function lastPayload(): { enabled: Record<string, boolean> } {
  const calls = vi.mocked(setMenuEnabled).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('setMenuEnabled was never called');
  return last[0] as { enabled: Record<string, boolean> };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  window.location.hash = '';
});

describe('startNativeMenuSync in the main window', () => {
  it('pushes the full map once on start — every synced command, nothing else', () => {
    const stop = startNativeMenuSync();
    expect(setMenuEnabled).toHaveBeenCalledTimes(1);
    const { enabled } = lastPayload();
    expect(Object.keys(enabled).sort()).toEqual([...SYNCED_IDS].sort());
    expect(SYNCED_IDS).toHaveLength(19);
    // Home, no presentation: only New and Open are enabled.
    expect(enabled['file:new']).toBe(true);
    expect(enabled['file:open']).toBe(true);
    expect(enabled['file:save']).toBe(false);
    expect(enabled['present:start']).toBe(false);
    stop();
  });

  it('pushes again when the map changes, and not when an unrelated store field changes', () => {
    const stop = startNativeMenuSync();
    expect(setMenuEnabled).toHaveBeenCalledTimes(1);

    useAppStore.setState({ shortcutsOpen: true });
    expect(setMenuEnabled).toHaveBeenCalledTimes(1);

    useAppStore.setState({ currentView: 'editor' });
    useEditorStore.setState({ presentation: PRESENTATION });
    expect(setMenuEnabled).toHaveBeenCalledTimes(2);
    expect(lastPayload().enabled['file:save']).toBe(true);
    expect(lastPayload().enabled['present:start']).toBe(true);

    usePresenterStore.setState({ isPresenting: true });
    expect(setMenuEnabled).toHaveBeenCalledTimes(3);
    expect(lastPayload().enabled['present:start']).toBe(false);
    expect(lastPayload().enabled['present:stop']).toBe(true);
    expect(lastPayload().enabled['file:versionHistory']).toBe(false);
    stop();
  });

  it('stops pushing after stop()', () => {
    const stop = startNativeMenuSync();
    stop();
    useAppStore.setState({ currentView: 'editor' });
    useEditorStore.setState({ presentation: PRESENTATION });
    expect(setMenuEnabled).toHaveBeenCalledTimes(1);
  });
});

describe('startNativeMenuSync in the output and stage windows', () => {
  it.each(['#/output', '#/stage-display?x=1'])('pushes nothing for %s', (hash) => {
    window.location.hash = hash;
    const stop = startNativeMenuSync();
    useAppStore.setState({ currentView: 'editor' });
    useEditorStore.setState({ presentation: PRESENTATION });
    expect(setMenuEnabled).toHaveBeenCalledTimes(0);
    stop();
  });
});
