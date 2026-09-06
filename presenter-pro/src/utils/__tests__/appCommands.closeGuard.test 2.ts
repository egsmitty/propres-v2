// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The close path has two guards that must run in order:
//   1. Still presenting?  → offer to stop the session cleanly first
//   2. Unsaved changes?   → offer to save
//
// Guard 1 exists because quitting mid-service cuts the projector to the
// desktop in front of a congregation. It must never HARD-block the quit
// though — `isPresenting` getting stuck true is exactly how this app became
// unquittable once already (phase7 #11).

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
}));
vi.mock('@/utils/presentationCommands', () => ({
  copySelectedSlideToClipboard: vi.fn(),
  createNewPresentation: vi.fn(),
  clearSelectedSlide: vi.fn(),
  importMediaToSelectedSlide: vi.fn(),
  insertNewSlideIntoCurrentPresentation: vi.fn(),
  insertNewSectionIntoCurrentPresentation: vi.fn(),
  pasteSlideAfterSelected: vi.fn(),
  saveCurrentPresentation: vi.fn(),
  saveCurrentPresentationAs: vi.fn(),
}));

import { runAppCommand } from '@/utils/appCommands';
import { confirmDialog } from '@/utils/dialog';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';
import { stopPresentationSession } from '@/utils/presenterFlow';
import { usePresenterStore } from '@/store/presenterStore';

const PRESENTER_INITIAL = usePresenterStore.getState();

let windowClose: ReturnType<typeof vi.fn>;
let resolveWindowCloseRequest: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  usePresenterStore.setState(PRESENTER_INITIAL, true);

  windowClose = vi.fn();
  resolveWindowCloseRequest = vi.fn();
  // jsdom's globalThis IS window, so stubGlobal is what puts this on
  // `window.electronAPI` for the code under test.
  vi.stubGlobal('electronAPI', { windowClose, resolveWindowCloseRequest });

  // Default: nothing unsaved, so tests isolate the presenting guard.
  vi.mocked(resolveUnsavedChanges).mockResolvedValue(true);
});

describe('close guard while presenting', () => {
  it('asks before quitting mid-presentation', async () => {
    usePresenterStore.setState({ isPresenting: true });
    vi.mocked(confirmDialog).mockResolvedValue(false);

    await runAppCommand('window:requestClose');

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    // `?? []` satisfies noUncheckedIndexedAccess; the call count is asserted above.
    const [message, options] = vi.mocked(confirmDialog).mock.calls[0] ?? [];
    expect(String(message)).toMatch(/presentation is live/i);
    expect(options).toMatchObject({ title: 'Still Presenting' });
  });

  it('cancels the close and leaves the presentation running', async () => {
    usePresenterStore.setState({ isPresenting: true });
    vi.mocked(confirmDialog).mockResolvedValue(false);

    const result = await runAppCommand('window:requestClose');

    expect(result).toBe(false);
    // The live output must be untouched.
    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(windowClose).not.toHaveBeenCalled();
    // Main must be told the handshake resolved, or the window stays wedged.
    expect(resolveWindowCloseRequest).toHaveBeenCalledTimes(1);
    // The unsaved-changes prompt must not also fire — one dialog, not two.
    expect(resolveUnsavedChanges).not.toHaveBeenCalled();
  });

  it('stops the session cleanly before closing when confirmed', async () => {
    usePresenterStore.setState({ isPresenting: true });
    vi.mocked(confirmDialog).mockResolvedValue(true);

    const result = await runAppCommand('window:requestClose');

    expect(result).toBe(true);
    // Order matters: the session is torn down before the window goes away, so
    // the projector never cuts to the desktop.
    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(windowClose).toHaveBeenCalledTimes(1);
  });

  it('still checks unsaved changes after stopping the presentation', async () => {
    usePresenterStore.setState({ isPresenting: true });
    vi.mocked(confirmDialog).mockResolvedValue(true);
    vi.mocked(resolveUnsavedChanges).mockResolvedValue(false);

    const result = await runAppCommand('window:requestClose');

    // Presenting stopped, but the save prompt then cancelled the close.
    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(resolveUnsavedChanges).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
    expect(windowClose).not.toHaveBeenCalled();
  });
});

describe('close guard when not presenting', () => {
  it('does not prompt about presenting', async () => {
    usePresenterStore.setState({ isPresenting: false });

    const result = await runAppCommand('window:requestClose');

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(result).toBe(true);
    expect(windowClose).toHaveBeenCalledTimes(1);
  });
});
