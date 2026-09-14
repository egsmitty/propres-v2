// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan L0 — characterization of the Present menu commands BEFORE any
// live-safety fix. Start only runs with a presentation and no live session,
// and tells the user when there is nothing to present; Stop, Black and Logo
// only act while a session is live.
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
import { alertDialog } from '@/utils/dialog';
import { startSidebarPresentationSession, stopPresentationSession } from '@/utils/presenterFlow';
import { sendBlack, sendLogo } from '@/utils/ipc';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();
const PRESENTATION = { id: 'p1', sections: [{ id: 's1', slides: [{ id: 'a' }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  // These commands describe the editor; since plan CMDS1 the registry refuses
  // them on Home (audit CMD-B4), so the view is part of the seed state.
  useAppStore.setState({ currentView: 'editor' });
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  vi.mocked(alertDialog).mockResolvedValue(undefined);
});

describe('present:start', () => {
  it('starts a session for the open presentation and reports success', async () => {
    useEditorStore.setState({ presentation: PRESENTATION });
    vi.mocked(startSidebarPresentationSession).mockResolvedValue(true);

    await expect(runAppCommand('present:start')).resolves.toBe(true);

    expect(startSidebarPresentationSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startSidebarPresentationSession).mock.calls[0]?.[0]).toBe(PRESENTATION);
    expect(alertDialog).not.toHaveBeenCalled();
  });

  it('tells the user when there is nothing to present', async () => {
    useEditorStore.setState({ presentation: PRESENTATION });
    vi.mocked(startSidebarPresentationSession).mockResolvedValue(false);

    await expect(runAppCommand('present:start')).resolves.toBe(false);

    expect(alertDialog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(alertDialog).mock.calls[0]?.[1]).toEqual({ title: 'Nothing to Present' });
  });

  it('does nothing without an open presentation', async () => {
    await expect(runAppCommand('present:start')).resolves.toBe(false);
    expect(startSidebarPresentationSession).not.toHaveBeenCalled();
  });

  it('does nothing while a session is already live', async () => {
    useEditorStore.setState({ presentation: PRESENTATION });
    usePresenterStore.setState({ isPresenting: true });

    await expect(runAppCommand('present:start')).resolves.toBe(false);
    expect(startSidebarPresentationSession).not.toHaveBeenCalled();
  });
});

describe('present:stop, present:black, present:logo', () => {
  it('stop ends a live session', async () => {
    usePresenterStore.setState({ isPresenting: true });
    vi.mocked(stopPresentationSession).mockResolvedValue(undefined);

    await runAppCommand('present:stop');

    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
  });

  it('black and logo reach the output while live', async () => {
    usePresenterStore.setState({ isPresenting: true });

    await runAppCommand('present:black');
    await runAppCommand('present:logo');

    expect(sendBlack).toHaveBeenCalledTimes(1);
    expect(sendLogo).toHaveBeenCalledTimes(1);
  });

  it('stop, black and logo all do nothing when nothing is live', async () => {
    await expect(runAppCommand('present:stop')).resolves.toBe(false);
    await expect(runAppCommand('present:black')).resolves.toBe(false);
    await expect(runAppCommand('present:logo')).resolves.toBe(false);

    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(sendBlack).not.toHaveBeenCalled();
    expect(sendLogo).not.toHaveBeenCalled();
  });
});
