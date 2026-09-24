// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

const H = vi.hoisted(() => ({
  ROW: {
    id: 42,
    name: 'Sunrise',
    type: 'image',
    file_path: '/m/sunrise.png',
    folder_id: null,
    created_at: 1_700_000_000,
    file_exists: true,
    file_url: 'presenterpro-media://asset?path=%2Fm%2Fsunrise.png',
    thumbnail_url: null,
    preview_url: null,
  },
  FOLDERS: [
    { id: 1, name: 'Backgrounds', parent_id: null, created_at: 1 },
    { id: 2, name: 'Sunday', parent_id: 1, created_at: 2 },
  ],
}));

vi.mock('@/utils/ipc', () => ({
  getMedia: vi.fn(async () => ({ success: true, data: [H.ROW] })),
  getMediaFolders: vi.fn(async () => ({ success: true, data: H.FOLDERS })),
  createMediaFolder: vi.fn(),
  updateMediaFolder: vi.fn(),
  deleteMediaFolder: vi.fn(),
  updateMedia: vi.fn(async () => ({ success: true, data: H.ROW })),
  deleteMedia: vi.fn(async () => ({ success: true })),
  importMedia: vi.fn(),
}));
vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
  alertDialog: vi.fn(),
  showDialog: vi.fn(),
}));
// Fully mocked, never importActual: the real module drags in the whole IPC surface.
vi.mock('@/utils/presentationCommands', () => ({
  insertMediaSlideIntoCurrentPresentation: vi.fn(),
}));

import { deleteMedia, updateMedia } from '@/utils/ipc';
import { confirmDialog, promptDialog, showDialog } from '@/utils/dialog';
import { insertMediaSlideIntoCurrentPresentation } from '@/utils/presentationCommands';
import { getSectionTypeLabel } from '@/utils/sectionTypes';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';
import { useEditorStore } from '@/store/editorStore';
import MediaLibraryModal from '@/components/library/MediaLibraryModal';

// Plans #155-P3 and #155-P4. The library as an overlay. Escape follows plan L1's
// contract — consumed in the window's capture phase with preventDefault(), never
// stopPropagation — and a priority chain: an open dialog owns the key, then the
// browser's own popovers, then the library closes. The surface does not dim or
// block the editor behind it, so a tile can still be dragged onto the canvas
// (charter D.5). P4 adds the detail pane whose explicit buttons replace the old
// panel's Use / More / Delete footer (#156), calling exactly what the panel
// called, with the raw row's numeric id.

const APP_INITIAL = useAppStore.getState();
const DIALOG_INITIAL = useDialogStore.getState();
const EDITOR_INITIAL = useEditorStore.getState();

const SECTION_LABEL = getSectionTypeLabel('announcement');
const PRESENTATION = {
  id: 7,
  title: 'Sunday Morning',
  sections: [
    {
      id: 'sec-1',
      type: 'announcement',
      title: 'Welcome',
      slides: [{ id: 's1', body: 'a' }],
    },
  ],
};

let seen: boolean[] = [];
function editorLikeListener(e: KeyboardEvent) {
  if (e.key === 'Escape') seen.push(e.defaultPrevented);
}

beforeEach(() => {
  vi.clearAllMocks();
  seen = [];
  useAppStore.setState(APP_INITIAL, true);
  useDialogStore.setState(DIALOG_INITIAL, true);
  useEditorStore.setState(EDITOR_INITIAL, true);
  useAppStore.setState({ mediaLibraryOpen: true });
  useEditorStore.setState({
    presentation: PRESENTATION,
    selectedSectionId: 'sec-1',
    selectedSlideId: 's1',
    setSlideBackground: vi.fn(),
    setSectionBackground: vi.fn(),
  });
  // The Editor's stop-presenting listener registers before any overlay mounts.
  window.addEventListener('keydown', editorLikeListener);
});

async function renderModal() {
  render(<MediaLibraryModal />);
  await waitFor(() => expect(document.querySelector('[data-media-tile="42"]')).not.toBeNull());
}

const tile = () => document.querySelector('[data-media-tile="42"]') as HTMLElement;
const pane = () => screen.getByTestId('media-detail-pane');
const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' });
async function selectTile() {
  await renderModal();
  fireEvent.click(tile());
}
async function clickPaneButton(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(within(pane()).getByRole('button', { name }));
  });
}

describe('MediaLibraryModal — surface and Escape (P3)', () => {
  it('renders a labelled dialog hosting the browser, without a dimming backdrop, wide enough for the pane', async () => {
    await renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Media Library' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('w-[min(1040px,94vw)]');
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

describe('MediaLibraryModal — the detail pane (P4, #156)', () => {
  it('shows a hint until a tile is selected', async () => {
    await renderModal();
    expect(pane()).toHaveTextContent('Select a media item to see what you can do with it.');
    expect(within(pane()).queryByRole('button')).toBeNull();
  });

  it('selecting a tile shows its name, kind, folder path, what it applies to, and the six actions', async () => {
    await selectTile();
    expect(screen.getByTestId('media-pane-name')).toHaveTextContent('Sunrise');
    expect(pane()).toHaveTextContent('Image');
    expect(screen.getByTestId('media-pane-path')).toHaveTextContent('ALL');
    expect(screen.getByTestId('media-applying-to')).toHaveTextContent(`${SECTION_LABEL}: Welcome`);
    const names = within(pane())
      .getAllByRole('button')
      .map((b) => b.textContent?.trim());
    expect(names).toEqual([
      'Set slide background',
      `Set ${SECTION_LABEL} background`,
      'Insert as media slide',
      'Rename…',
      'Move to…',
      'Delete',
    ]);
  });

  it('Set slide background calls the store with the section, slide and the numeric row id, then closes', async () => {
    await selectTile();
    await clickPaneButton('Set slide background');
    const setSlideBackground = useEditorStore.getState().setSlideBackground as ReturnType<
      typeof vi.fn
    >;
    expect(setSlideBackground).toHaveBeenCalledWith('sec-1', 's1', 42);
    expect(typeof setSlideBackground.mock.calls[0]?.[2]).toBe('number');
    expect(useAppStore.getState().mediaLibraryOpen).toBe(false);
  });

  it('Set section background calls the store with the section and the numeric row id, then closes', async () => {
    await selectTile();
    await clickPaneButton(`Set ${SECTION_LABEL} background`);
    expect(useEditorStore.getState().setSectionBackground).toHaveBeenCalledWith('sec-1', 42);
    expect(useAppStore.getState().mediaLibraryOpen).toBe(false);
  });

  it('Insert as media slide passes the raw row and closes on success, stays open on failure', async () => {
    vi.mocked(insertMediaSlideIntoCurrentPresentation).mockResolvedValueOnce(null);
    await selectTile();
    await clickPaneButton('Insert as media slide');
    expect(insertMediaSlideIntoCurrentPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, name: 'Sunrise' })
    );
    expect(useAppStore.getState().mediaLibraryOpen).toBe(true);

    // Any truthy result means "inserted"; the component never reads the slide.
    vi.mocked(insertMediaSlideIntoCurrentPresentation).mockResolvedValueOnce({
      id: '11111111-2222-4333-8444-555555555555',
    } as unknown as Awaited<ReturnType<typeof insertMediaSlideIntoCurrentPresentation>>);
    await clickPaneButton('Insert as media slide');
    expect(useAppStore.getState().mediaLibraryOpen).toBe(false);
  });

  it('disables the slide action without a selected slide, and section/insert without a section', async () => {
    useEditorStore.setState({ selectedSlideId: null });
    await selectTile();
    expect(within(pane()).getByRole('button', { name: 'Set slide background' })).toBeDisabled();
    expect(
      within(pane()).getByRole('button', { name: `Set ${SECTION_LABEL} background` })
    ).toBeEnabled();

    useEditorStore.setState({ selectedSectionId: null });
    // With no section the label falls back to the generic word — asserted exactly.
    await waitFor(() =>
      expect(within(pane()).getByRole('button', { name: 'Set Section background' })).toBeDisabled()
    );
    expect(within(pane()).getByRole('button', { name: 'Insert as media slide' })).toBeDisabled();
    expect(screen.getByTestId('media-applying-to')).toHaveTextContent('Choose a section first');
  });

  it('Rename… prompts with the current name and renames through the hook', async () => {
    vi.mocked(promptDialog).mockResolvedValue('Dawn');
    await selectTile();
    await clickPaneButton('Rename…');
    expect(promptDialog).toHaveBeenCalledWith(
      expect.any(String),
      'Sunrise',
      expect.objectContaining({ requireValue: expect.any(String) })
    );
    expect(updateMedia).toHaveBeenCalledWith(42, { name: 'Dawn' });
  });

  it('Move to… offers the root and every folder by its full path, then moves through the hook', async () => {
    vi.mocked(showDialog).mockResolvedValue({ action: 'confirm', values: { folderId: '2' } });
    await selectTile();
    await clickPaneButton('Move to…');
    const config = vi.mocked(showDialog).mock.calls[0]?.[0] as {
      fields: Array<{ options: Array<{ label: string; value: string }> }>;
    };
    expect(config.fields[0]?.options.map((o) => o.label)).toEqual([
      'Library Root',
      'ALL > Backgrounds',
      'ALL > Backgrounds > Sunday',
    ]);
    expect(updateMedia).toHaveBeenCalledWith(42, { folder_id: 2 });
  });

  it('Delete confirms, then deletes through the hook', async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    await selectTile();
    await clickPaneButton('Delete');
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.stringContaining('Sunrise'),
      expect.objectContaining({ danger: true })
    );
    expect(deleteMedia).toHaveBeenCalledWith(42);
  });

  it('right-clicking a tile selects it and opens a context menu with the same actions', async () => {
    await renderModal();
    fireEvent.contextMenu(tile(), { clientX: 30, clientY: 40 });
    const menu = document.querySelector('[data-context-menu="true"]');
    expect(menu).not.toBeNull();
    expect(menu).toHaveTextContent('Set slide background');
    expect(menu).toHaveTextContent('Delete');
    expect(screen.getByTestId('media-pane-name')).toHaveTextContent('Sunrise');
  });
});
