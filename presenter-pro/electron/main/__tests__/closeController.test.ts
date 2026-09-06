import { describe, it, expect, beforeEach } from 'vitest';
import { createCloseController } from '../closeController';

// The window-close / app-quit handshake is the highest-risk lifecycle logic in
// this app, and it lived inline in a 1364-line file where nothing could reach
// it. These tests describe the state machine that decision now lives in.
//
// Regression under test (phase7 finding #0): PresenterPro could not be quit
// with Cmd+Q. The close handler unconditionally preventDefault()'d to hand
// control to the renderer, which cancelled the quit, and nothing ever set the
// quitting flag on a healthy app.

let controller: ReturnType<typeof createCloseController>;

const HEALTHY = { responsive: true, crashed: false };

beforeEach(() => {
  controller = createCloseController({ requestTimeoutMs: 5000 });
});

describe('first close request', () => {
  it('blocks and asks the renderer to resolve unsaved changes', () => {
    expect(controller.decideClose({ ...HEALTHY, now: 0 })).toEqual({
      action: 'block',
      askRenderer: true,
      reason: 'awaiting-renderer',
    });
  });

  it('does not ask twice while a request is already in flight', () => {
    controller.decideClose({ ...HEALTHY, now: 0 });
    // Second click on the X while the save prompt is open must not fire a
    // second round-trip.
    expect(controller.decideClose({ ...HEALTHY, now: 100 })).toEqual({
      action: 'block',
      askRenderer: false,
      reason: 'request-in-flight',
    });
  });
});

describe('app quit (the Cmd+Q regression)', () => {
  it('allows the close once the app is quitting', () => {
    // `before-quit` fires first and marks the shutdown. Without this the close
    // handler preventDefault()s and silently cancels the quit — the bug.
    controller.markQuitting();
    expect(controller.decideClose({ ...HEALTHY, now: 0 })).toEqual({
      action: 'allow',
      askRenderer: false,
      reason: 'app-quitting',
    });
  });

  it('allows the close even if a renderer request was already in flight', () => {
    // Cmd+Q while the unsaved-changes prompt is open must still quit.
    controller.decideClose({ ...HEALTHY, now: 0 });
    controller.markQuitting();
    expect(controller.decideClose({ ...HEALTHY, now: 10 }).action).toBe('allow');
  });

  it('stays quitting across repeated close events', () => {
    controller.markQuitting();
    expect(controller.decideClose({ ...HEALTHY, now: 0 }).action).toBe('allow');
    // Multiple windows closing during shutdown must each be allowed.
    expect(controller.decideClose({ ...HEALTHY, now: 1 }).action).toBe('allow');
  });
});

describe('explicit allow (the window:close IPC path)', () => {
  it('allows exactly one close, then re-arms the guard', () => {
    controller.allowNextClose();
    expect(controller.decideClose({ ...HEALTHY, now: 0 }).action).toBe('allow');
    // The permission is single-use: a later close must go through the
    // unsaved-changes handshake again rather than closing silently.
    expect(controller.decideClose({ ...HEALTHY, now: 1 })).toEqual({
      action: 'block',
      askRenderer: true,
      reason: 'awaiting-renderer',
    });
  });
});

describe('the latch bug: an unanswered request must not block forever', () => {
  it('gives up and allows the close once the request times out', () => {
    controller.decideClose({ ...HEALTHY, now: 0 });
    // Renderer never replies — previously mainWindowCloseRequestPending stayed
    // true and every subsequent close was silently swallowed with no dialog.
    expect(controller.decideClose({ ...HEALTHY, now: 5001 })).toEqual({
      action: 'allow',
      askRenderer: false,
      reason: 'renderer-timeout',
    });
  });

  it('still blocks while the request is inside the timeout window', () => {
    controller.decideClose({ ...HEALTHY, now: 0 });
    // Boundary: exactly at the timeout is not yet expired.
    expect(controller.decideClose({ ...HEALTHY, now: 5000 }).action).toBe('block');
  });

  it('re-arms the timeout for a fresh request after the renderer resolves', () => {
    controller.decideClose({ ...HEALTHY, now: 0 });
    controller.resolveRequest();

    // A new request starts its own window rather than inheriting the old clock.
    expect(controller.decideClose({ ...HEALTHY, now: 6000 })).toEqual({
      action: 'block',
      askRenderer: true,
      reason: 'awaiting-renderer',
    });
    expect(controller.decideClose({ ...HEALTHY, now: 6100 }).action).toBe('block');
  });
});

describe('dead or unresponsive renderer', () => {
  it('prompts for a force close when the window is unresponsive', () => {
    expect(controller.decideClose({ responsive: false, crashed: false, now: 0 })).toEqual({
      action: 'prompt-force',
      askRenderer: false,
      reason: 'unresponsive',
    });
  });

  it('prompts for a force close when the renderer has crashed', () => {
    expect(controller.decideClose({ responsive: true, crashed: true, now: 0 })).toEqual({
      action: 'prompt-force',
      askRenderer: false,
      reason: 'crashed',
    });
  });

  it('allows the close outright once the render process is reported gone', () => {
    // A dead renderer can never answer the handshake, so waiting on it would
    // strand the window permanently.
    controller.markRendererGone();
    expect(controller.decideClose({ responsive: true, crashed: false, now: 0 })).toEqual({
      action: 'allow',
      askRenderer: false,
      reason: 'renderer-gone',
    });
  });

  it('prefers quitting over prompting when the app is already shutting down', () => {
    // Force-quitting an unresponsive app must not re-prompt on every window.
    controller.markQuitting();
    expect(controller.decideClose({ responsive: false, crashed: true, now: 0 }).action).toBe(
      'allow'
    );
  });
});

describe('reset', () => {
  it('clears every flag when the window is destroyed', () => {
    controller.markQuitting();
    controller.allowNextClose();
    controller.decideClose({ ...HEALTHY, now: 0 });

    controller.reset();

    // Back to a pristine guard: the next close asks the renderer again.
    expect(controller.decideClose({ ...HEALTHY, now: 0 })).toEqual({
      action: 'block',
      askRenderer: true,
      reason: 'awaiting-renderer',
    });
  });

  it('reports its state for diagnostics', () => {
    controller.markQuitting();
    expect(controller.getState()).toMatchObject({
      isQuitting: true,
      requestPending: false,
      rendererGone: false,
    });
  });
});
