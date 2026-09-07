// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan E3 follow-up. Dialog and the shortcuts overlay close on Escape; the
// two settings modals only closed on a backdrop click or their buttons — a
// keyboard dead end found while building the screenshot surfaces.

vi.mock('@/utils/ipc', () => ({
  closeOutputWindow: vi.fn(async () => ({ success: true })),
  closeStageDisplayWindow: vi.fn(async () => ({ success: true })),
  getPreviewWindowState: vi.fn(async () => ({
    success: true,
    data: { outputOpen: false, stageOpen: false },
  })),
  getSettings: vi.fn(async () => ({ success: true, data: {} })),
  getSystemDisplays: vi.fn(async () => ({ success: true, data: [] })),
  onPreviewWindowClosed: vi.fn(() => () => {}),
  onPreviewWindowState: vi.fn(() => () => {}),
  openOutputWindow: vi.fn(async () => ({ success: true })),
  openStageDisplayWindow: vi.fn(async () => ({ success: true })),
  setSetting: vi.fn(async () => ({ success: true })),
}));

import PresentationSettingsModal from '@/components/editor/PresentationSettingsModal';
import OutputSettingsModal from '@/components/editor/OutputSettingsModal';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';

const APP_INITIAL = useAppStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(APP_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  useEditorStore
    .getState()
    .setPresentation({ id: 'p1', title: 'T', aspectRatio: '16:9', sections: [] });
});

describe('Presentation Settings modal', () => {
  it('closes on Escape', () => {
    useAppStore.setState({ presentationSettingsOpen: true });
    render(<PresentationSettingsModal />);
    expect(screen.getByText('Presentation Settings')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useAppStore.getState().presentationSettingsOpen).toBe(false);
  });
});

describe('Output Settings modal', () => {
  it('closes on Escape (through its own close path)', async () => {
    useAppStore.setState({ outputSettingsOpen: true });
    render(<OutputSettingsModal />);
    expect(screen.getByText('Output Settings')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(useAppStore.getState().outputSettingsOpen).toBe(false));
  });
});
