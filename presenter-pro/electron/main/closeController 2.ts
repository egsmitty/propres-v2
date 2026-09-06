/**
 * Window-close / app-quit decision logic.
 *
 * This lived inline inside `createMainWindow()` in a 1364-line file, where it
 * could not be reached by a test — which is why it shipped broken for months
 * (phase7 finding #0: the app could not be quit with Cmd+Q).
 *
 * It is deliberately a PURE state machine: no electron imports, no timers, no
 * I/O. `now` is passed in rather than read from the clock so timeout behavior
 * is testable without fake timers. The caller performs the side effects.
 *
 * The three properties that matter, each pinned by a test:
 *   1. A quit ALWAYS wins. `before-quit` marks shutdown, and from then on every
 *      close is allowed. Blocking here is what cancelled Cmd+Q.
 *   2. A pending request CANNOT latch. If the renderer never answers, the
 *      request expires and the close proceeds.
 *   3. A dead renderer never strands the window, since it can never answer.
 */

export type CloseAction = 'allow' | 'block' | 'prompt-force';

export type CloseReason =
  | 'app-quitting'
  | 'renderer-gone'
  | 'explicitly-allowed'
  | 'renderer-timeout'
  | 'unresponsive'
  | 'crashed'
  | 'request-in-flight'
  | 'awaiting-renderer';

export interface CloseDecision {
  action: CloseAction;
  /** True only when the caller should send `window:requestClose` to the renderer. */
  askRenderer: boolean;
  reason: CloseReason;
}

export interface CloseInput {
  responsive: boolean;
  crashed: boolean;
  /** Milliseconds, caller-supplied so timeouts are testable. */
  now: number;
}

export interface CloseControllerOptions {
  /**
   * How long to wait for the renderer to answer the unsaved-changes handshake
   * before giving up and closing anyway. Long enough for a human to read a
   * dialog, short enough that a wedged renderer does not trap the window.
   */
  requestTimeoutMs?: number;
}

export interface CloseControllerState {
  isQuitting: boolean;
  requestPending: boolean;
  rendererGone: boolean;
  allowNext: boolean;
  requestStartedAt: number | null;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

export function createCloseController(options: CloseControllerOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  let isQuitting = false;
  let rendererGone = false;
  let allowNext = false;
  let requestPending = false;
  let requestStartedAt: number | null = null;

  function clearRequest() {
    requestPending = false;
    requestStartedAt = null;
  }

  return {
    /** `before-quit` — from here on, every close is allowed through. */
    markQuitting() {
      isQuitting = true;
      allowNext = true;
      clearRequest();
    },

    /** `render-process-gone` — the renderer can no longer answer anything. */
    markRendererGone() {
      rendererGone = true;
      clearRequest();
    },

    /** The renderer approved the close and called `window:close`. Single-use. */
    allowNextClose() {
      allowNext = true;
      clearRequest();
    },

    /** The renderer declined the close (user cancelled the save prompt). */
    resolveRequest() {
      clearRequest();
    },

    /** `closed` — the window is gone; return to a pristine guard. */
    reset() {
      isQuitting = false;
      rendererGone = false;
      allowNext = false;
      clearRequest();
    },

    getState(): CloseControllerState {
      return { isQuitting, requestPending, rendererGone, allowNext, requestStartedAt };
    },

    decideClose({ responsive, crashed, now }: CloseInput): CloseDecision {
      // 1. A quit always wins, ahead of every other consideration — including
      //    an unresponsive window, so force-quitting cannot re-prompt forever.
      if (isQuitting) {
        return { action: 'allow', askRenderer: false, reason: 'app-quitting' };
      }

      // 2. A dead renderer can never complete the handshake.
      if (rendererGone) {
        return { action: 'allow', askRenderer: false, reason: 'renderer-gone' };
      }

      // 3. Permission granted by the renderer, consumed exactly once so a
      //    later close still goes through the unsaved-changes check.
      if (allowNext) {
        allowNext = false;
        clearRequest();
        return { action: 'allow', askRenderer: false, reason: 'explicitly-allowed' };
      }

      // 4. An in-flight request that outlived its window must not trap the
      //    user. This is the latch bug: previously this state blocked forever
      //    with no dialog.
      if (
        requestPending &&
        requestStartedAt !== null &&
        now - requestStartedAt > requestTimeoutMs
      ) {
        clearRequest();
        return { action: 'allow', askRenderer: false, reason: 'renderer-timeout' };
      }

      // 5. A window that cannot paint cannot show a save prompt; ask the user
      //    directly instead.
      if (!responsive) {
        return { action: 'prompt-force', askRenderer: false, reason: 'unresponsive' };
      }
      if (crashed) {
        return { action: 'prompt-force', askRenderer: false, reason: 'crashed' };
      }

      // 6. Already asked and still within the window — wait, but do not ask
      //    again.
      if (requestPending) {
        return { action: 'block', askRenderer: false, reason: 'request-in-flight' };
      }

      // 7. First ask.
      requestPending = true;
      requestStartedAt = now;
      return { action: 'block', askRenderer: true, reason: 'awaiting-renderer' };
    },
  };
}
