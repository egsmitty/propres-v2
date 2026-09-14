// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Plan D3 (audit SAVE-A1). Quitting, closing the presentation, New and Open
// used to consult only the editor store, so an open song editor with unsaved
// edits was dropped without a word. Each of them now asks the registered
// editors first, before any other prompt.

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
import { registerBlockingEditor } from '@/utils/blockingEditors';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';
import { createNewPresentation } from '@/utils/presentationCommands';
import { resolveWindowCloseRequest, windowClose } from '@/utils/ipc';
import { useAppStore } from '@/store/appStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();
let unregister: (() => void) | null = null;

function registerDirtySongEditor(resolvesTo: boolean) {
  const resolve = vi.fn().mockResolvedValue(resolvesTo);
  unregister = registerBlockingEditor('song-editor', { isDirty: () => true, resolve });
  return resolve;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  useAppStore.setState({ currentView: 'editor', homeTab: 'home' });
  vi.mocked(resolveUnsavedChanges).mockResolvedValue(true);
});

afterEach(() => {
  unregister?.();
  unregister = null;
});

describe('window:requestClose with a dirty song editor', () => {
  it('keeps the window open when the song editor is not resolved', async () => {
    const resolve = registerDirtySongEditor(false);

    const result = await runAppCommand('window:requestClose');

    expect(result).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(windowClose).not.toHaveBeenCalled();
    // Main's close handshake must still be answered, or the window wedges.
    expect(resolveWindowCloseRequest).toHaveBeenCalledTimes(1);
    // One dialog at a time: the presentation prompt does not follow.
    expect(resolveUnsavedChanges).not.toHaveBeenCalled();
  });

  it('goes on to the presentation check and closes once the song editor is resolved', async () => {
    const resolve = registerDirtySongEditor(true);

    const result = await runAppCommand('window:requestClose');

    expect(result).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolveUnsavedChanges).toHaveBeenCalledTimes(1);
    expect(windowClose).toHaveBeenCalledTimes(1);
  });
});

describe('leaving the presentation with a dirty song editor', () => {
  it('file:close stays in the editor when the song editor is not resolved', async () => {
    registerDirtySongEditor(false);

    const result = await runAppCommand('file:close');

    expect(result).toBe(false);
    expect(resolveUnsavedChanges).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentView).toBe('editor');
  });

  it('file:new does not create a presentation when the song editor is not resolved', async () => {
    registerDirtySongEditor(false);

    const result = await runAppCommand('file:new');

    expect(result).toBe(false);
    expect(createNewPresentation).not.toHaveBeenCalled();
  });

  it('file:open stays in the editor when the song editor is not resolved', async () => {
    registerDirtySongEditor(false);

    const result = await runAppCommand('file:open');

    expect(result).toBe(false);
    expect(useAppStore.getState().currentView).toBe('editor');
  });

  it('file:open goes Home once the song editor is resolved', async () => {
    const resolve = registerDirtySongEditor(true);

    const result = await runAppCommand('file:open');

    expect(result).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().currentView).toBe('home');
    expect(useAppStore.getState().homeTab).toBe('open');
  });
});
