// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/utils/ipc', () => ({
  getMedia: vi.fn(async () => ({ success: true, data: [] })),
  getMediaFolders: vi.fn(async () => ({
    success: true,
    data: [{ id: 1, name: 'Backgrounds', parent_id: null, created_at: 1 }],
  })),
  createMediaFolder: vi.fn(),
  updateMediaFolder: vi.fn(),
  deleteMediaFolder: vi.fn(),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
  importMedia: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
  alertDialog: vi.fn(),
}));

import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import MediaLibraryModal from '@/components/library/MediaLibraryModal';

// Plan #155-P3. The library as an overlay. Escape follows plan L1's contract —
// consumed in the window's capture phase with preventDefault(), never
// stopPropagation — and a priority chain: an open dialog owns the key, then the
// browser's own popovers, then the library closes. The surface does not dim or
// block the editor behind it, so a tile can still be dragged onto the canvas
// (charter D.5).

const APP_INITIAL = useAppStore.getState();
const DIALOG_INITIAL = useDialogStore.getState();

let seen: boolean[] = [];
function editorLikeListener(e: KeyboardEvent) {
  if (e.key === 'Escape') seen.push(e.defaultPrevented);
}

beforeEach(() => {
  vi.clearAllMocks();
  seen = [];
  useAppStore.setState(APP_INITIAL, true);
  useDialogStore.setState(DIALOG_INITIAL, true);
  useAppStore.setState({ mediaLibraryOpen: true });
  // The Editor's stop-presenting listener registers before any overlay mounts.
  window.addEventListener('keydown', editorLikeListener);
});

async function renderModal() {
  render(<MediaLibraryModal />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Backgrounds/ })).toBeInTheDocument()
  );
}

const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' });

describe('MediaLibraryModal', () => {
  it('renders a labelled dialog hosting the browser, without a dimming backdrop', async () => {
    await renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Media Library' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('[data-media-library-overlay]')).toHaveClass(
      'pointer-events-none'
    );
    expect(document.querySelector('[data-media-library-overlay]')).not.toHaveClass('bg-black/60');
  });

  it('the close button closes the library', async () => {
    await renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close media library' }));
    expect(useAppStore.getState().mediaLibraryOpen).toBe(false);
  });

  it('Escape closes the library and is consumed before the Editor sees it', async () => {
    await renderModal();
    pressEscape();
    expect(seen).toEqual([true]);
    expect(useAppStore.getState().mediaLibraryOpen).toBe(false);
  });

  it('Escape while a dialog is open leaves the library alone — the dialog owns the key', async () => {
    await renderModal();
    useDialogStore.setState({ dialog: { title: 'Rename Folder', actions: [] } });
    pressEscape();
    expect(useAppStore.getState().mediaLibraryOpen).toBe(true);
    // Not consumed by the library; the dialog host is what consumes it.
    expect(seen).toEqual([false]);
  });

  it('Escape with the folder dropdown open closes the dropdown and keeps the library open', async () => {
    await renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Browse folders' }));
    expect(screen.getByTestId('media-folder-dropdown')).toBeInTheDocument();
    pressEscape();
    expect(screen.queryByTestId('media-folder-dropdown')).not.toBeInTheDocument();
    expect(useAppStore.getState().mediaLibraryOpen).toBe(true);
    expect(seen).toEqual([true]);
  });
});
