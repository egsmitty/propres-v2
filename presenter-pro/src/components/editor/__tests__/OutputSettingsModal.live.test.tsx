// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L3 (audit LIVE-A1). Output Settings asks main whether an output or stage
// window is open, and on Cancel, Save, Escape or a backdrop click it closed
// whatever it found — including the LIVE projector and stage display mid-service,
// because main cannot tell a preview from a live window. The sheet now closes
// only the preview windows it opened itself, and its preview toggles are
// disabled while presenting.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

vi.mock('@/utils/ipc', () => ({
  closeOutputWindow: vi.fn(async () => ({ success: true })),
  closeStageDisplayWindow: vi.fn(async () => ({ success: true })),
  getPreviewWindowState: vi.fn(),
  getSettings: vi.fn(async () => ({ success: true, data: {} })),
  getSystemDisplays: vi.fn(async () => ({ success: true, data: [] })),
  onPreviewWindowClosed: vi.fn(() => () => {}),
  onPreviewWindowState: vi.fn(() => () => {}),
  openOutputWindow: vi.fn(async () => ({ success: true })),
  openStageDisplayWindow: vi.fn(async () => ({ success: true })),
  setSetting: vi.fn(async () => ({ success: true })),
}));

import OutputSettingsModal from '@/components/editor/OutputSettingsModal';
import {
  closeOutputWindow,
  closeStageDisplayWindow,
  getPreviewWindowState,
  openOutputWindow,
} from '@/utils/ipc';
import { useAppStore } from '@/store/appStore';
import { usePresenterStore } from '@/store/presenterStore';

const APP_INITIAL = useAppStore.getState();
const PRESENTER_INITIAL = usePresenterStore.getState();

function windowsAlreadyOpen(outputOpen: boolean, stageOpen: boolean) {
  vi.mocked(getPreviewWindowState).mockResolvedValue({
    success: true,
    data: { outputOpen, stageOpen },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  usePresenterStore.setState(PRESENTER_INITIAL, true);
  useAppStore.setState({ outputSettingsOpen: true });
  windowsAlreadyOpen(false, false);
});

describe('Output Settings leaves windows it did not open alone', () => {
  it('Cancel does not close a live output or stage display', async () => {
    windowsAlreadyOpen(true, true);
    render(<OutputSettingsModal />);
    // The sheet has seen that both windows are open.
    await screen.findByRole('button', { name: 'Close Main Preview' });
    await screen.findByRole('button', { name: 'Close Stage Preview' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(useAppStore.getState().outputSettingsOpen).toBe(false));
    expect(closeOutputWindow).not.toHaveBeenCalled();
    expect(closeStageDisplayWindow).not.toHaveBeenCalled();
  });

  it('Escape does not close them either', async () => {
    windowsAlreadyOpen(true, true);
    render(<OutputSettingsModal />);
    await screen.findByRole('button', { name: 'Close Main Preview' });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(useAppStore.getState().outputSettingsOpen).toBe(false));
    expect(closeOutputWindow).not.toHaveBeenCalled();
    expect(closeStageDisplayWindow).not.toHaveBeenCalled();
  });

  it('a preview the sheet opened itself is closed again on Cancel', async () => {
    render(<OutputSettingsModal />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Main Output Preview' }));
    await waitFor(() => expect(openOutputWindow).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Close Main Preview' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(useAppStore.getState().outputSettingsOpen).toBe(false));
    expect(closeOutputWindow).toHaveBeenCalledTimes(1);
    expect(closeStageDisplayWindow).not.toHaveBeenCalled();
  });
});

describe('Output Settings while presenting', () => {
  it('disables both preview toggles', async () => {
    usePresenterStore.setState({ isPresenting: true });
    windowsAlreadyOpen(true, false);
    render(<OutputSettingsModal />);

    expect(await screen.findByRole('button', { name: 'Close Main Preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Stage Display Preview' })).toBeDisabled();
  });
});
