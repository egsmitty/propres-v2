// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L4 (audit LIVE-A6). The title bar's Home button left the deck without
// checking for a live presentation — the same hazard as File ▸ Open. It now
// asks first, like quitting does.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({ touchPresentation: vi.fn() }));
vi.mock('@/utils/unsavedChanges', () => ({ resolveUnsavedChanges: vi.fn() }));
vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(),
  alertDialog: vi.fn(),
  showDialog: vi.fn(),
  promptDialog: vi.fn(),
}));
vi.mock('@/utils/presenterFlow', () => ({
  stopPresentationSession: vi.fn(),
  startSidebarPresentationSession: vi.fn(),
}));

import TitleBar from '@/components/layout/TitleBar';
import { confirmDialog } from '@/utils/dialog';
import { resolveUnsavedChanges } from '@/utils/unsavedChanges';
import { stopPresentationSession } from '@/utils/presenterFlow';
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
  useEditorStore.setState({ presentation: { id: 9, title: 'Sunday Service', sections: [] } });
  usePresenterStore.setState({ isPresenting: true, liveSectionId: 's1', liveSlideId: 'a' });
  vi.mocked(resolveUnsavedChanges).mockResolvedValue(true);
  vi.mocked(touchPresentation).mockResolvedValue({ success: true });
  vi.mocked(stopPresentationSession).mockResolvedValue(undefined);
});

describe('TitleBar Home while presenting', () => {
  it('asks first, and Cancel leaves you in the editor with the session running', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(false);
    render(<TitleBar />);

    fireEvent.click(screen.getByTitle('Back to Home'));

    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(stopPresentationSession).not.toHaveBeenCalled();
    expect(resolveUnsavedChanges).not.toHaveBeenCalled();
    expect(useAppStore.getState().currentView).toBe('editor');
  });

  it('confirmed, stops the session and goes Home', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    render(<TitleBar />);

    fireEvent.click(screen.getByTitle('Back to Home'));

    await waitFor(() => expect(useAppStore.getState().currentView).toBe('home'));
    expect(stopPresentationSession).toHaveBeenCalledTimes(1);
    expect(resolveUnsavedChanges).toHaveBeenCalledTimes(1);
  });
});
