// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Plan L3 (audit LIVE-A2, LIVE-A8, LIVE-A13, LIVE-C4). What the congregation
// sees on the projector. OutputRenderer.test.tsx (plan D1) pins mount, media and
// countdown painting and must pass unchanged.
//
// - LIVE-A2: every `output:update` cleared black and logo. Main already resets
//   them (and broadcasts it) when a NEW slide goes live, but it also sends
//   `output:update` for every edit to the live slide — so fixing a typo while
//   the screen was blacked showed the slide again.
// - LIVE-A8: the "Close Preview" pill showed on a windowed output even while a
//   slide was live, one click from closing the projector.
// - LIVE-A13: the resize observer effect ran once, at mount, before the stage
//   element existed, so the slide kept its first-render size.
// - LIVE-C4: the mouse pointer stayed visible on the projector.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

type Callback = (payload: unknown) => void;
const subscriptions: Record<string, Callback> = {};
function subscription(name: string) {
  return vi.fn((cb: Callback) => {
    subscriptions[name] = cb;
    return vi.fn();
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

import OutputRenderer from '@/components/presenter/OutputRenderer';
import { getMedia, getWindowViewState, notifyOutputReady } from '@/utils/ipc';

let observed: Element[] = [];

async function mount({ fullScreen }: { fullScreen: boolean }) {
  vi.mocked(getWindowViewState).mockResolvedValue({
    success: true,
    data: { isFullScreen: fullScreen },
  });
  const utils = render(<OutputRenderer />);
  await waitFor(() => expect(getMedia).toHaveBeenCalledTimes(1));
  await act(async () => {});
  return utils;
}

async function goLive(body: string) {
  await act(async () => {
    await subscriptions.update!({ slide: { id: 'live', type: 'text', body }, background: null });
  });
}

async function black(active: boolean) {
  await act(async () => {
    subscriptions.black!({ active });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(subscriptions)) delete subscriptions[key];
  observed = [];
  vi.mocked(getMedia).mockResolvedValue({ success: true, data: [] });
  vi.mocked(notifyOutputReady).mockResolvedValue({ success: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    }
  );
});

describe('OutputRenderer — live safety', () => {
  it('an edit to the live slide does not un-black the projector', async () => {
    const { container } = await mount({ fullScreen: true });
    await goLive('Amazing grace');
    expect(container.textContent).toContain('Amazing grace');

    await black(true);
    expect(container.textContent).not.toContain('Amazing grace');

    // The operator fixes a typo on the live slide: main sends output:update
    // (refresh) and does NOT touch the black state.
    await goLive('Amazing grace, how sweet');
    expect(container.textContent).not.toContain('Amazing grace');

    // Main clears black when it wants to — for a new slide it broadcasts this.
    await black(false);
    expect(container.textContent).toContain('Amazing grace, how sweet');
  });

  it('the Close Preview pill is hidden while a slide is live', async () => {
    await mount({ fullScreen: false });
    expect(screen.getByRole('button', { name: 'Close Preview' })).toBeInTheDocument();

    await goLive('Welcome');

    expect(screen.queryByRole('button', { name: 'Close Preview' })).toBeNull();
  });

  it('the resize observer watches the stage root once a slide is showing, and again after black', async () => {
    // ScaledSlideText runs its own ResizeObserver on the text layer, so "anything
    // was observed" proves nothing — the STAGE ROOT itself must be observed.
    const { container } = await mount({ fullScreen: true });
    await goLive('Welcome');
    const stage = container.firstElementChild;
    const timesObserved = () => observed.filter((element) => element === stage).length;
    expect(timesObserved()).toBe(1);

    // Blacking out renders a root <div> without the viewport ref. React keeps
    // the same DOM node, but the ref is cleared and the observer effect is
    // cleaned up (disconnected). Coming back must observe the stage AGAIN, or
    // the slide keeps a stale size.
    await black(true);
    await black(false);
    expect(container.firstElementChild).toBe(stage);
    expect(timesObserved()).toBe(2);
  });

  it('hides the mouse pointer on a fullscreen output, including when blacked', async () => {
    const { container } = await mount({ fullScreen: true });
    await goLive('Welcome');
    expect((container.firstElementChild as HTMLElement).style.cursor).toBe('none');

    await black(true);
    expect((container.firstElementChild as HTMLElement).style.cursor).toBe('none');
  });

  it('keeps the pointer in a preview window', async () => {
    const { container } = await mount({ fullScreen: false });
    await goLive('Welcome');

    expect((container.firstElementChild as HTMLElement).style.cursor).not.toBe('none');
  });
});
