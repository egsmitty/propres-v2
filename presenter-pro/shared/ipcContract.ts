/**
 * The IPC contract — the single source of truth for every channel that crosses
 * the main ↔ renderer boundary (plan B1).
 *
 * Three tables, keyed by the `window.electronAPI` method name the renderer
 * calls, valued by the channel string main registers:
 *   - INVOKE_METHODS  renderer → main request/response (`ipcRenderer.invoke`)
 *   - SEND_METHODS    renderer → main fire-and-forget (`ipcRenderer.send`)
 *   - EVENT_METHODS   main → renderer subscriptions (`ipcRenderer.on`)
 *
 * Preload builds `window.electronAPI` from these tables, main registers only
 * channels found here (`electron/main/ipcRegistry.ts`), and the renderer talks
 * only through `src/utils/ipc.ts`, which exports one wrapper per method.
 * `electron/main/__tests__/ipcChannels.test.ts` keeps all three honest.
 *
 * Adding a channel is a three-line change in the same PR: a row here, an
 * `ipc.handle` in main, an export in `src/utils/ipc.ts`. Miss one and a test
 * (or `assertComplete()` at launch) names it.
 *
 * Scope note: this file types the SHAPE of the contract (names, directions,
 * the envelope) and its exhaustiveness. Domain payloads (presentations, songs,
 * media) are not modelled as TypeScript types yet, so their argument and data
 * types are `unknown` here. That is the next ratchet, not this one.
 */

export const INVOKE_METHODS = {
  // Presentations
  getPresentations: 'db:presentations:getAll',
  getPresentation: 'db:presentations:get',
  createPresentation: 'db:presentations:create',
  updatePresentation: 'db:presentations:update',
  touchPresentation: 'db:presentations:touch',
  deletePresentation: 'db:presentations:delete',

  // Crash-recovery journal (plan A2). The writer is gone (plan A5 slice 3);
  // these two remain to drain journals left by a pre-autosave build.
  listJournals: 'db:journal:list',
  deleteJournal: 'db:journal:delete',

  // Restore points (plan A5)
  writeVersion: 'db:versions:write',
  getVersion: 'db:versions:get',
  getLatestVersion: 'db:versions:latest',
  listVersionSummaries: 'db:versions:summaries',
  listVersions: 'db:versions:list',
  deleteVersionsFor: 'db:versions:deleteFor',

  // Songs
  getSongs: 'db:songs:getAll',
  createSong: 'db:songs:create',
  updateSong: 'db:songs:update',
  deleteSong: 'db:songs:delete',

  // Media
  getMedia: 'db:media:getAll',
  getMediaFolders: 'db:mediaFolders:getAll',
  createMediaFolder: 'db:mediaFolders:create',
  createMedia: 'db:media:create',
  updateMediaFolder: 'db:mediaFolders:update',
  deleteMediaFolder: 'db:mediaFolders:delete',
  importMedia: 'media:import',
  pickMedia: 'media:pick',
  updateMedia: 'db:media:update',
  deleteMedia: 'db:media:delete',

  // Output / stage windows
  openOutputWindow: 'output:open',
  openStageDisplayWindow: 'stage:open',
  closeOutputWindow: 'output:close',
  closeStageDisplayWindow: 'stage:close',
  sendSlide: 'output:sendSlide',
  setPresentationSessionSlides: 'output:setSessionSlides',
  sendBlack: 'output:black',
  sendLogo: 'output:logo',
  startCountdown: 'output:countdownStart',
  stopCountdown: 'output:countdownStop',
  stopPresenting: 'output:stop',
  waitForOutputReady: 'output:waitReady',
  notifyOutputReady: 'output:ready',
  waitForStageDisplayReady: 'stage:waitReady',
  notifyStageDisplayReady: 'stage:ready',
  refreshLiveSlide: 'output:refreshSlide',

  // Window controls
  windowClose: 'window:close',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  getWindowViewState: 'window:getViewState',
  getPreviewWindowState: 'preview:getState',

  // System
  getSettings: 'settings:getAll',
  setSetting: 'settings:set',
  getProfile: 'system:getProfile',
  getSystemDisplays: 'system:getDisplays',
  resolveBuiltInMedia: 'system:resolveBuiltInMedia',
} as const;

export const SEND_METHODS = {
  resolveWindowCloseRequest: 'window:closeRequestResolved',
} as const;

export const EVENT_METHODS = {
  onSlideAdvance: 'presenter:slideAdvance',
  onPresenterStop: 'presenter:stop',
  onOutputUpdate: 'output:update',
  onOutputBlack: 'output:black',
  onOutputLogo: 'output:logo',
  onOutputCountdown: 'output:countdown',
  onStageUpdate: 'stage:update',
  onAppCommand: 'app:command',
  onSettingsUpdated: 'settings:updated',
  onWindowViewState: 'window:viewState',
  onPreviewWindowClosed: 'preview:windowClosed',
  onPreviewWindowState: 'preview:windowState',
} as const;

/**
 * Methods whose preload wrapper boxes positional arguments into one object
 * before invoking — kept byte-identical to the hand-written wrappers they
 * replace, because main's handlers destructure exactly these shapes.
 */
export const ARG_SHAPERS = {
  pickMedia: (kind: unknown) => [{ kind }],
  sendSlide: (slide: unknown, background: unknown) => [{ slide, background }],
  setPresentationSessionSlides: (slides: unknown) => [{ slides }],
  startCountdown: (durationSeconds: unknown) => [{ durationSeconds }],
  refreshLiveSlide: (slide: unknown, background: unknown) => [{ slide, background }],
} as const satisfies Partial<Record<keyof typeof INVOKE_METHODS, (...args: never[]) => unknown[]>>;

export type InvokeMethod = keyof typeof INVOKE_METHODS;
export type SendMethod = keyof typeof SEND_METHODS;
export type EventMethod = keyof typeof EVENT_METHODS;
export type InvokeChannel = (typeof INVOKE_METHODS)[InvokeMethod];
export type SendChannel = (typeof SEND_METHODS)[SendMethod];
export type EventChannel = (typeof EVENT_METHODS)[EventMethod];

/** Every response crossing the boundary is one of these two shapes. */
export type Envelope<T = unknown> = { success: true; data?: T } | { success: false; error: string };

export type Unsubscribe = () => void;

/** The exact surface of `window.electronAPI`, as preload builds it. */
export type ElectronApi = {
  [M in InvokeMethod]: (...args: unknown[]) => Promise<Envelope>;
} & {
  [M in SendMethod]: (...args: unknown[]) => void;
} & {
  [M in EventMethod]: (callback: (payload: never) => void) => Unsubscribe;
} & {
  /** `process.platform` of the main process, exposed statically. */
  platform: string;
};

export function ok<T>(data?: T): Envelope<T> {
  return data === undefined ? { success: true } : { success: true, data };
}

export function fail(error: string): Envelope<never> {
  return { success: false, error };
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { success?: unknown; error?: unknown };
  if (candidate.success === true) return true;
  return candidate.success === false && typeof candidate.error === 'string';
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : String(error);
}
