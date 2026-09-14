import { describe, it, expect, vi } from 'vitest';
import {
  OUTPUT_WINDOW_BACKGROUND,
  createDisplaySleepBlocker,
  outputWindowOptions,
} from '../presentationWindows';

// Plan L3 (audit LIVE-A14, LIVE-A15). Two things a projector must never do in
// front of a congregation, pinned where they can be tested — the main process
// itself cannot be loaded in a unit test.
//
// - The output window opened with no background colour, so it flashed the
//   light app colour while loading and again on every crash reload. The stage
//   display window already opened black.
// - Nothing stopped the operator's machine sleeping the display during a long
//   sermon.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

describe('outputWindowOptions', () => {
  it('opens black, frameless and hidden until ready, with the renderer locked down', () => {
    expect(OUTPUT_WINDOW_BACKGROUND).toBe('#000000');
    expect(outputWindowOptions({ preload: '/app/preload/index.js', icon: 'ICON' })).toEqual({
      width: 1280,
      height: 720,
      title: 'Output',
      frame: false,
      show: false,
      backgroundColor: '#000000',
      icon: 'ICON',
      webPreferences: {
        preload: '/app/preload/index.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  });
});

function fakePowerSaveBlocker() {
  const started = new Set<number>();
  let nextId = 1;
  return {
    started,
    start: vi.fn((type: 'prevent-display-sleep') => {
      void type;
      const id = nextId++;
      started.add(id);
      return id;
    }),
    stop: vi.fn((id: number) => {
      started.delete(id);
    }),
    isStarted: vi.fn((id: number) => started.has(id)),
  };
}

describe('createDisplaySleepBlocker', () => {
  it('blocks display sleep once, however many slides go live', () => {
    const api = fakePowerSaveBlocker();
    const blocker = createDisplaySleepBlocker(api);

    blocker.start();
    blocker.start();
    blocker.start();

    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledWith('prevent-display-sleep');
    expect(blocker.active).toBe(true);
  });

  it('releases the block on stop, exactly once', () => {
    const api = fakePowerSaveBlocker();
    const blocker = createDisplaySleepBlocker(api);

    blocker.start();
    blocker.stop();
    blocker.stop();

    expect(api.stop).toHaveBeenCalledTimes(1);
    expect(api.stop).toHaveBeenCalledWith(1);
    expect(blocker.active).toBe(false);
  });

  it('does nothing when stopped before it was started', () => {
    const api = fakePowerSaveBlocker();
    const blocker = createDisplaySleepBlocker(api);

    blocker.stop();

    expect(api.stop).not.toHaveBeenCalled();
    expect(blocker.active).toBe(false);
  });

  it('starts a new block if the OS released the previous one', () => {
    const api = fakePowerSaveBlocker();
    const blocker = createDisplaySleepBlocker(api);

    blocker.start();
    api.started.clear();
    blocker.start();

    expect(api.start).toHaveBeenCalledTimes(2);
    expect(blocker.active).toBe(true);
  });
});
