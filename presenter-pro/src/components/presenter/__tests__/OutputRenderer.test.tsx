// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';

// Plan D1 #4/#5 — characterization of the output window's media resolution
// BEFORE the hoisting fix, so the fix is provably behaviour-preserving.

type Callback = (payload: unknown) => void;
const subscriptions: Record<string, Callback> = {};
const unsubscribes: Record<string, ReturnType<typeof vi.fn>> = {};
function subscription(name: string) {
  return vi.fn((cb: Callback) => {
    subscriptions[name] = cb;
    unsubscribes[name] = vi.fn();
    return unsubscribes[name];
  });
}

vi.mock('@/utils/ipc', () => ({
  closeOutputWindow: vi.fn(),
  getMedia: vi.fn(),
  getWindowViewState: vi.fn(),
  notifyOutputReady: vi.fn(),
  onOutputBlack: subscription('black'),
  onOutputCountdown: subscription('countdown'),
  onOutputLogo: subscription('logo'),
  onOutputUpdate: subscription('update'),
  onWindowViewState: subscription('viewState'),
}));
vi.mock('@/utils/backgrounds', () => ({
  getMediaAssetUrl: (media: { file_path?: string } | null) =>
    media?.file_path ? `asset://${media.file_path}` : '',
  isVideoMedia: (media: { type?: string } | null) => media?.type === 'video',
}));

import OutputRenderer from '@/components/presenter/OutputRenderer';
import { getMedia, getWindowViewState, notifyOutputReady } from '@/utils/ipc';

const LIBRARY = [
  { id: 5, type: 'image', file_path: '/library/slide.png' },
  { id: 9, type: 'image', file_path: '/library/background.png' },
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(subscriptions)) delete subscriptions[k];
  vi.mocked(getMedia).mockResolvedValue({ success: true, data: LIBRARY });
  vi.mocked(getWindowViewState).mockResolvedValue({ success: true, data: { isFullScreen: true } });
  vi.mocked(notifyOutputReady).mockResolvedValue({ success: true });
  // jsdom has no ResizeObserver; the viewport effect only needs it to exist.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

describe('OutputRenderer', () => {
  it('on mount: loads the library once, signals ready once, subscribes to all five events', async () => {
    render(<OutputRenderer />);
    await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1));
    expect(notifyOutputReady).toHaveBeenCalledTimes(1);
    expect(Object.keys(subscriptions).sort()).toEqual([
      'black',
      'countdown',
      'logo',
      'update',
      'viewState',
    ]);
  });

  it('paints a media slide by resolving its item from the loaded library', async () => {
    const { container } = render(<OutputRenderer />);
    await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1));

    await act(async () => {
      await subscriptions.update!({
        slide: { id: 's1', type: 'media', mediaId: 5 },
        background: null,
      });
    });

    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('asset:///library/slide.png');
    });
    // Resolved from the already-loaded library — no second fetch.
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  it('paints the background for a text slide, looked up by id from the library', async () => {
    const { container } = render(<OutputRenderer />);
    await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1));

    await act(async () => {
      await subscriptions.update!({
        slide: { id: 's2', type: 'text', body: 'Amazing grace', effectiveBackgroundId: 9 },
        background: null,
      });
    });

    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('asset:///library/background.png');
    });
  });

  it('unmount unsubscribes from all five events', async () => {
    const { unmount } = render(<OutputRenderer />);
    await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1));
    unmount();
    for (const name of ['black', 'countdown', 'logo', 'update', 'viewState']) {
      expect(unsubscribes[name], name).toHaveBeenCalledTimes(1);
    }
  });
});
