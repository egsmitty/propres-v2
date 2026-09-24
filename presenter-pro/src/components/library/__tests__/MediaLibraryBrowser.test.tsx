// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React, { createRef } from 'react';

vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
  alertDialog: vi.fn(),
}));

import { confirmDialog, promptDialog } from '@/utils/dialog';
import { LIBRARY_ITEM_CAP, MAX_FOLDER_PATH_DEPTH, type MediaFolder } from '@/utils/mediaFolders';
import type { LibraryMedia, MediaLibraryProp } from '@/utils/mediaLibraryAdapter';
import {
  MediaLibraryBrowser,
  type MediaLibraryBrowserHandle,
} from '@/components/library/MediaLibraryBrowser';

// Plan #155-P3. The Builder's browser, ported: folders, breadcrumbs, the
// Explorer-style dropdown, recursive search, the cap counter, cascade delete
// with exact counts, our drag MIME, and our type filter. Rendered against a
// hand-built `MediaLibraryProp` so every callback is observable. Edge
// auto-scroll and drop-target geometry are not testable in jsdom and are not
// claimed here.

const folder = (folderId: string, name: string, parentId: string | null): MediaFolder => ({
  folderId,
  name,
  parentId,
  createdAt: '2026-09-24T00:00:00.000Z',
});

const media = (
  mediaId: string,
  fileName: string,
  folderId: string | null,
  mediaType: 'image' | 'video' = 'image',
  fileExists = true
): LibraryMedia => ({
  mediaId,
  fileName,
  mediaType,
  urls: {
    original: `p://large/${fileName}`,
    large: `p://large/${fileName}`,
    medium: `p://large/${fileName}`,
    small: `p://small/${fileName}`,
  },
  folderId,
  createdAt: '2026-09-24T00:00:00.000Z',
  fileExists,
  raw: { id: Number(mediaId), name: fileName, type: mediaType, file_path: `/m/${fileName}` },
});

// ALL > Backgrounds > Sunday · ALL > zeta — unsorted on purpose.
const BACKGROUNDS = folder('1', 'Backgrounds', null);
const SUNDAY = folder('2', 'Sunday', '1');
const ZETA = folder('3', 'zeta', null);
const FOLDERS = [ZETA, BACKGROUNDS, SUNDAY];
const PHOTOS = [
  media('10', 'cross.jpg', null),
  media('11', 'sunrise.png', '1'),
  media('12', 'candles.png', '2'),
  media('13', 'loop.mp4', null, 'video'),
  media('14', 'gone.png', null, 'image', false),
];

function libraryWith(overrides: Partial<MediaLibraryProp> = {}): MediaLibraryProp {
  return {
    photos: PHOTOS,
    folders: FOLDERS,
    loading: false,
    totalCount: PHOTOS.length + FOLDERS.length,
    atCap: false,
    fetchPhotos: vi.fn(async () => {}),
    deletePhoto: vi.fn(async () => {}),
    renamePhoto: vi.fn(async () => {}),
    movePhoto: vi.fn(async () => {}),
    createFolder: vi.fn(async () => {}),
    renameFolder: vi.fn(async () => {}),
    moveFolder: vi.fn(async () => {}),
    deleteFolder: vi.fn(async () => {}),
    importMedia: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderBrowser(overrides: Partial<MediaLibraryProp> = {}, selectedMediaId?: string) {
  const lib = libraryWith(overrides);
  const onPhotoClick = vi.fn();
  const ref = createRef<MediaLibraryBrowserHandle>();
  render(
    <MediaLibraryBrowser
      ref={ref}
      mediaLibrary={lib}
      onPhotoClick={onPhotoClick}
      selectedMediaId={selectedMediaId ?? null}
    />
  );
  return { lib, onPhotoClick, ref };
}

// A tile's accessible name is its label, not its title, so read the tiles by
// their data attribute rather than by the tooltip.
const folderTiles = () =>
  [...document.querySelectorAll('[data-folder-tile]')].map((el) => el.textContent?.trim());
const mediaTiles = () =>
  [...document.querySelectorAll('[data-media-tile]')].map((el) =>
    el.getAttribute('data-media-tile')
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('root view', () => {
  it('shows root folders name-sorted, then the root media, in that order', () => {
    renderBrowser();
    expect(folderTiles()).toEqual(['Backgrounds', 'zeta']);
    expect(mediaTiles()).toEqual(['10', '13', '14']);
  });

  it('reads the live counter against the production cap', () => {
    renderBrowser();
    expect(screen.getByTestId('media-count')).toHaveTextContent(
      `${PHOTOS.length + FOLDERS.length} / ${LIBRARY_ITEM_CAP}`
    );
  });

  it('turns the counter red within ten of the cap and shows the full banner at the cap', () => {
    renderBrowser({ totalCount: LIBRARY_ITEM_CAP - 10 });
    expect(screen.getByTestId('media-count')).toHaveClass('text-danger');
    expect(screen.queryByText(/Your library is full/)).not.toBeInTheDocument();
  });

  it('at the cap: banner shown, Import and Folder disabled', () => {
    renderBrowser({ totalCount: LIBRARY_ITEM_CAP, atCap: true });
    expect(
      screen.getByText(`Your library is full (${LIBRARY_ITEM_CAP} of ${LIBRARY_ITEM_CAP}).`)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Import' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Folder' })).toBeDisabled();
  });

  it('Import asks the library to import into the current folder', () => {
    const { lib } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: '+ Import' }));
    expect(lib.importMedia).toHaveBeenCalledWith(null);
  });
});

describe('navigation', () => {
  it('clicking a folder navigates into it: breadcrumb, Move-up tile, its own media', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Backgrounds/ }));
    const crumb = screen.getByTestId('media-breadcrumb');
    expect(within(crumb).getByRole('button', { name: 'ALL' })).toBeInTheDocument();
    expect(within(crumb).getByText('Backgrounds')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(folderTiles()).toEqual(['Sunday']);
    expect(mediaTiles()).toEqual(['11']);
  });

  it('the breadcrumb ALL returns to the root', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Backgrounds/ }));
    fireEvent.click(
      within(screen.getByTestId('media-breadcrumb')).getByRole('button', { name: 'ALL' })
    );
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(mediaTiles()).toEqual(['10', '13', '14']);
  });

  it('the folder dropdown lists every folder depth-first with its ALL > … path', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Browse folders' }));
    const rows = [...screen.getByTestId('media-folder-dropdown').querySelectorAll('button')].map(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim()
    );
    expect(rows).toEqual(['ALL', 'ALL > Backgrounds', 'ALL > Backgrounds > Sunday', 'ALL > zeta']);
  });

  it('"+ Folder" is disabled at the max depth, with a title derived from the constant', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Backgrounds/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sunday/ }));
    const button = screen.getByRole('button', { name: '+ Folder' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      `Folders can be ${MAX_FOLDER_PATH_DEPTH} levels deep at most`
    );
  });
});

describe('type filter and search', () => {
  it('Images hides videos; Videos hides images; All shows both', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Images' }));
    expect(mediaTiles()).toEqual(['10', '14']);
    fireEvent.click(screen.getByRole('button', { name: 'Videos' }));
    expect(mediaTiles()).toEqual(['13']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(mediaTiles()).toEqual(['10', '13', '14']);
  });

  it('search is recursive across folders and captions each hit with its folder path', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Search media' }));
    fireEvent.change(screen.getByPlaceholderText('Search media…'), { target: { value: 'PNG' } });
    expect(mediaTiles()).toEqual(['11', '12', '14']);
    const captions = screen.getAllByTestId('media-path-caption').map((c) => c.textContent);
    expect(captions).toEqual(['Backgrounds', 'Backgrounds / Sunday', 'ALL']);
  });

  it('Escape in the search box clears and closes it', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Search media' }));
    const input = screen.getByPlaceholderText('Search media…');
    fireEvent.change(input, { target: { value: 'png' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search media…')).not.toBeInTheDocument();
    expect(mediaTiles()).toEqual(['10', '13', '14']);
  });
});

describe('tiles', () => {
  it('reports a click and highlights the selected tile', () => {
    const { onPhotoClick } = renderBrowser({}, '13');
    fireEvent.click(document.querySelector('[data-media-tile="10"]')!);
    expect(onPhotoClick).toHaveBeenCalledWith(PHOTOS[0]);
    expect(document.querySelector('[data-media-tile="13"]')).toHaveClass('ring-accent');
    expect(document.querySelector('[data-media-tile="10"]')).not.toHaveClass('ring-accent');
  });

  it('a video tile renders a paused, metadata-only video; a missing file says so', () => {
    renderBrowser();
    const video = screen.getByTestId('media-tile-video');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).not.toHaveAttribute('autoplay');
    expect(screen.getByTestId('media-tile-missing')).toHaveTextContent('Missing File');
  });

  it('dragging a tile sets our MIME with the exact id string, so Canvas and Filmstrip drops keep working', () => {
    renderBrowser();
    const setData = vi.fn();
    fireEvent.dragStart(document.querySelector('[data-media-tile="10"]')!, {
      dataTransfer: { setData, types: [], effectAllowed: 'uninitialized' },
    });
    expect(setData).toHaveBeenCalledWith('application/presenterpro-media-id', '10');
  });
});

describe('folder actions', () => {
  it('cascade delete confirms with the exact media and subfolder counts, then deletes', async () => {
    const { lib } = renderBrowser();
    vi.mocked(confirmDialog).mockResolvedValue(true);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Backgrounds/ }));
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    // Backgrounds holds sunrise.png and the subfolder Sunday (candles.png): 2 media, 1 folder.
    expect(confirmDialog).toHaveBeenCalledWith(
      expect.stringMatching(/2 media items.*1 subfolder/s),
      expect.objectContaining({ danger: true })
    );
    expect(lib.deleteFolder).toHaveBeenCalledWith('1');
  });

  it('a declined cascade confirm deletes nothing', async () => {
    const { lib } = renderBrowser();
    vi.mocked(confirmDialog).mockResolvedValue(false);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Backgrounds/ }));
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    expect(lib.deleteFolder).not.toHaveBeenCalled();
  });

  it('creating a folder prompts for a name and creates it in the current folder', async () => {
    const { lib } = renderBrowser();
    vi.mocked(promptDialog).mockResolvedValue('Evening');
    fireEvent.click(screen.getByRole('button', { name: /Backgrounds/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Folder' }));
    });
    expect(lib.createFolder).toHaveBeenCalledWith('Evening', '1');
  });
});

describe('consumeEscape', () => {
  it('closes an open dropdown and reports it consumed; reports nothing consumed when idle', () => {
    const { ref } = renderBrowser();
    let consumed = ref.current!.consumeEscape();
    expect(consumed).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Browse folders' }));
    expect(screen.getByTestId('media-folder-dropdown')).toBeInTheDocument();
    act(() => {
      consumed = ref.current!.consumeEscape();
    });
    expect(consumed).toBe(true);
    expect(screen.queryByTestId('media-folder-dropdown')).not.toBeInTheDocument();
  });
});
