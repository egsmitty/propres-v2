// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan L4 (audit LIVE-A6). File ▸ Open, File ▸ Close and File ▸ New switched
// away from the deck without checking for a live presentation. The editor
// unmounted (so the presenter keys stopped working), the projector froze on
// its last slide, and opening another deck synced ITS slides into the session —
// the next Space sent the new deck's first slide to the congregation.
// `window:requestClose` already had the right guard; every other way of
// leaving the deck now asks the same question.
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
import { confirmDialog } from '@/utils/dialog';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';
import { stopPresentationSession } from '@/utils/presenterFlow';
import { createNewPresentation } from '@/utils/presentationCommands';
import { touchPresentation } from '@/utils/ipc';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  useAppStore.setState({ currentView: 'editor' });
  useEditorStore.setState({ presentation: { id: 7, title: 'Sunday', sections: [] } });
  vi.mocked(resolveUnsavedChanges).mockResolvedValue(true);
  vi.mocked(touchPresentation).mockResolvedValue({ success: true });
  vi.mocked(stopPresentationSession).mockResolvedValue(undefined);
  vi.mocked(createNewPresentation).mockResolvedValue(true);
});

function expectAskedToStop() {
  expect(confirmDialog).toHaveBeenCalledTimes(1);
  const [message, options] = vi.mocked(confirmDialog).mock.calls[0] ?? [];
  expect(String(message)).toMatch(/live on the output display/i);
  expect(options).toMatchObject({ title: 'Still Presenting', confirmLabel: 'Stop Presenting' });
}

describe('leaving the deck when nothing is live', () => {
  it('File ▸ Open goes Home without asking', async () => {
    await expect(runAppCommand('file:open')).resolves.toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentView).toBe('home');
  });
});

describe('leaving the deck while presenting', () => {
  beforeEach(() => {
    usePresenterStore.setState({ isPresenting: true, liveSectionId: 's1', liveSlideId: 'a' });
  });

  it('File ▸ Open asks; Cancel stays in the editor with the session running', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);

    await expect(runAppCommand('file:open')).resolves.toBe(false);

    expectAskedToStop();
    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentView).toBe('editor');
  });

  it('File ▸ Open, confirmed, stops the session and then goes Home', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);

    await expect(runAppCommand('file:open')).resolves.toBe(true);

    expectAskedToStop();
    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().currentView).toBe('home');
  });

  it('File ▸ Close asks before the unsaved-changes gate; Cancel changes nothing', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);

    await expect(runAppCommand('file:close')).resolves.toBe(false);

    expectAskedToStop();
    expect(resolveUnsavedChanges).not.toHaveBeenCalled();
    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentView).toBe('editor');
  });

  it('File ▸ Close, confirmed, stops, then runs the unsaved-changes gate, then goes Home', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);

    await expect(runAppCommand('file:close')).resolves.toBe(true);

    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(resolveUnsavedChanges).toHaveBeenCalledTimes(1);
    const stopped = vi.mocked(stopPresentationSession).mock.invocationCallOrder[0] ?? 0;
    const gated = vi.mocked(resolveUnsavedChanges).mock.invocationCallOrder[0] ?? 0;
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThan(gated);
    expect(useAppStore.getState().currentView).toBe('home');
  });

  it('File ▸ New asks; Cancel creates nothing', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);

    await expect(runAppCommand('file:new')).resolves.toBe(false);

    expectAskedToStop();
    expect(createNewPresentation).not.toHaveBeenCalled();
    expect(stopPresentationSession).not.toHaveBeenCalled();
  });

  it('File ▸ New, confirmed, stops the session before creating the new deck', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);

    await expect(runAppCommand('file:new')).resolves.toBe(true);

    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(createNewPresentation).toHaveBeenCalledTimes(1);
    const stopped = vi.mocked(stopPresentationSession).mock.invocationCallOrder[0] ?? 0;
    const created = vi.mocked(createNewPresentation).mock.invocationCallOrder[0] ?? 0;
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThan(created);
  });
});
