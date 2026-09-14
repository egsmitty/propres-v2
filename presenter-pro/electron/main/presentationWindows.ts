// Output-window policy for a live service (plan L3), kept free of any `electron`
// import so it can be unit-tested. `index.js` requires this at runtime — the
// main process is CommonJS, so it needs its own Rollup input in
// electron.vite.config.js or the app crashes on launch.

/** The output window opens black: never the light app colour, not even while
 * loading or on a crash reload (audit LIVE-A14). Matches the stage display. */
export const OUTPUT_WINDOW_BACKGROUND = '#000000';

export function outputWindowOptions({ preload, icon }: { preload: string; icon: unknown }) {
  return {
    width: 1280,
    height: 720,
    title: 'Output',
    frame: false,
    show: false,
    backgroundColor: OUTPUT_WINDOW_BACKGROUND,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

/**
 * Whether an `output:refreshSlide` may repaint the projector (plan L4, audit
 * LIVE-A3). The renderer's session sync reads the live slide id, awaits an IPC
 * round trip, then refreshes that slide — so a clicker press landing in between
 * could send the PREVIOUS slide back over the one that just went live. A refresh
 * applies only to the slide main knows is live; before anything is live
 * (a window re-syncing on load), it applies.
 */
export function shouldApplyRefresh(
  current: { id?: unknown } | null | undefined,
  incoming: { id?: unknown } | null | undefined
): boolean {
  if (!incoming) return false;
  if (!current) return true;
  return current.id === incoming.id;
}

/** The part of Electron's `powerSaveBlocker` this module uses. */
export type PowerSaveBlockerApi = {
  start(type: 'prevent-display-sleep'): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
};

/**
 * Keeps the display awake while a presentation is live (audit LIVE-A15): a long
 * sermon on an idle operator machine used to let the display sleep in front of
 * the room. Idempotent — `start` is called for every slide that goes live,
 * `stop` from every path that can end a session.
 */
export function createDisplaySleepBlocker(api: PowerSaveBlockerApi) {
  let id: number | null = null;
  return {
    start() {
      if (id !== null && api.isStarted(id)) return;
      id = api.start('prevent-display-sleep');
    },
    stop() {
      if (id === null) return;
      if (api.isStarted(id)) api.stop(id);
      id = null;
    },
    get active() {
      return id !== null;
    },
  };
}
