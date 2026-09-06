/**
 * The renderer's only door to the main process (plan B1).
 *
 * One export per method in `shared/ipcContract.ts`, typed. Every wrapper
 * returns the `{ success, data | error }` envelope — the main-process registry
 * guarantees that even when a handler throws. Nothing under `src/` may touch
 * `window.electronAPI` directly; `ipcChannels.test.ts` enforces it.
 *
 * Domain payloads are `unknown`-typed records until the domain models exist
 * as TypeScript types (see the contract's scope note).
 */
import type { Envelope, Unsubscribe } from '../../shared/ipcContract';

type Id = number | string;
type Fields = Record<string, unknown>;
type Callback<P> = (payload: P) => void;

/** Read at call time, not import time: tests stub `window.electronAPI` after importing. */
const api = () => window.electronAPI;

// ─── Static properties ───────────────────────────────────────────────────────

/** Undefined outside Electron (unit tests in a bare Node environment). */
export function getElectronPlatform(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.electronAPI?.platform;
}

// ─── Presentations ───────────────────────────────────────────────────────────

export async function getPresentations<T = unknown>(): Promise<Envelope<T[]>> {
  return api().getPresentations() as Promise<Envelope<T[]>>;
}
export async function getPresentation(id: Id): Promise<Envelope<unknown>> {
  return api().getPresentation(id);
}
export async function createPresentation(data: Fields): Promise<Envelope<unknown>> {
  return api().createPresentation(data);
}
export async function updatePresentation(id: Id, data: Fields): Promise<Envelope<unknown>> {
  return api().updatePresentation(id, data);
}
export async function touchPresentation(id: Id): Promise<Envelope> {
  return api().touchPresentation(id);
}
export async function deletePresentation(id: Id): Promise<Envelope> {
  return api().deletePresentation(id);
}

// ─── Crash-recovery journal (plan A2) ────────────────────────────────────────

export async function writeJournal(data: Fields): Promise<Envelope> {
  return api().writeJournal(data);
}
export async function listJournals<T = unknown>(): Promise<Envelope<T[]>> {
  return api().listJournals() as Promise<Envelope<T[]>>;
}
export async function deleteJournal(presentationId: Id): Promise<Envelope> {
  return api().deleteJournal(presentationId);
}

// ─── Songs ───────────────────────────────────────────────────────────────────

export async function getSongs<T = unknown>(): Promise<Envelope<T[]>> {
  return api().getSongs() as Promise<Envelope<T[]>>;
}
export async function createSong(data: Fields): Promise<Envelope<unknown>> {
  return api().createSong(data);
}
export async function updateSong(id: Id, data: Fields): Promise<Envelope<unknown>> {
  return api().updateSong(id, data);
}
export async function deleteSong(id: Id): Promise<Envelope> {
  return api().deleteSong(id);
}

// ─── Media ───────────────────────────────────────────────────────────────────

export async function getMedia<T = unknown>(): Promise<Envelope<T[]>> {
  return api().getMedia() as Promise<Envelope<T[]>>;
}
export async function getMediaFolders<T = unknown>(): Promise<Envelope<T[]>> {
  return api().getMediaFolders() as Promise<Envelope<T[]>>;
}
export async function createMediaFolder(data: Fields): Promise<Envelope<unknown>> {
  return api().createMediaFolder(data);
}
export async function createMedia(data: Fields): Promise<Envelope<unknown>> {
  return api().createMedia(data);
}
export async function updateMediaFolder(id: Id, data: Fields): Promise<Envelope<unknown>> {
  return api().updateMediaFolder(id, data);
}
export async function deleteMediaFolder(id: Id): Promise<Envelope> {
  return api().deleteMediaFolder(id);
}
export async function importMedia<T = unknown>(options?: Fields): Promise<Envelope<T[]>> {
  return api().importMedia(options) as Promise<Envelope<T[]>>;
}
export async function pickMedia(kind: 'image' | 'video'): Promise<Envelope<unknown>> {
  return api().pickMedia(kind);
}
export async function updateMedia(id: Id, data: Fields): Promise<Envelope<unknown>> {
  return api().updateMedia(id, data);
}
export async function deleteMedia(id: Id): Promise<Envelope> {
  return api().deleteMedia(id);
}

// ─── Output / stage windows ──────────────────────────────────────────────────

export async function openOutputWindow(options?: Fields | number): Promise<Envelope> {
  return api().openOutputWindow(options);
}
export async function openStageDisplayWindow(options?: Fields): Promise<Envelope<unknown>> {
  return api().openStageDisplayWindow(options);
}
export async function closeOutputWindow(): Promise<Envelope> {
  return api().closeOutputWindow();
}
export async function closeStageDisplayWindow(): Promise<Envelope> {
  return api().closeStageDisplayWindow();
}
export async function sendSlide(slide: unknown, background: unknown): Promise<Envelope> {
  return api().sendSlide(slide, background);
}
export async function setPresentationSessionSlides(slides: unknown[]): Promise<Envelope> {
  return api().setPresentationSessionSlides(slides);
}
export async function sendBlack(): Promise<Envelope> {
  return api().sendBlack();
}
export async function sendLogo(): Promise<Envelope> {
  return api().sendLogo();
}
export async function startCountdown(durationSeconds: number): Promise<Envelope> {
  return api().startCountdown(durationSeconds);
}
export async function stopCountdown(): Promise<Envelope> {
  return api().stopCountdown();
}
export async function stopPresenting(): Promise<Envelope> {
  return api().stopPresenting();
}
export async function waitForOutputReady(): Promise<Envelope> {
  return api().waitForOutputReady();
}
export async function notifyOutputReady(): Promise<Envelope> {
  return api().notifyOutputReady();
}
export async function waitForStageDisplayReady(): Promise<Envelope> {
  return api().waitForStageDisplayReady();
}
export async function notifyStageDisplayReady(): Promise<Envelope> {
  return api().notifyStageDisplayReady();
}
export async function refreshLiveSlide(slide: unknown, background: unknown): Promise<Envelope> {
  return api().refreshLiveSlide(slide, background);
}

// ─── Window controls ─────────────────────────────────────────────────────────

export async function windowClose(): Promise<Envelope> {
  return api().windowClose();
}
export async function windowMinimize(): Promise<Envelope> {
  return api().windowMinimize();
}
export async function windowMaximize(): Promise<Envelope> {
  return api().windowMaximize();
}
export async function getWindowViewState(): Promise<Envelope<{ isFullScreen: boolean }>> {
  return api().getWindowViewState() as Promise<Envelope<{ isFullScreen: boolean }>>;
}
export async function getPreviewWindowState(): Promise<
  Envelope<{ outputOpen: boolean; stageOpen: boolean }>
> {
  return api().getPreviewWindowState() as Promise<
    Envelope<{ outputOpen: boolean; stageOpen: boolean }>
  >;
}
export function resolveWindowCloseRequest(): void {
  api().resolveWindowCloseRequest();
}

// ─── System ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Envelope<Record<string, string>>> {
  return api().getSettings() as Promise<Envelope<Record<string, string>>>;
}
export async function setSetting(key: string, value: unknown): Promise<Envelope> {
  return api().setSetting(key, value);
}
export async function getProfile(): Promise<Envelope<unknown>> {
  return api().getProfile();
}
export async function getSystemDisplays<T = unknown>(): Promise<Envelope<T[]>> {
  return api().getSystemDisplays() as Promise<Envelope<T[]>>;
}
export async function resolveBuiltInMedia(
  assetNames: string[]
): Promise<Envelope<Record<string, string | null>>> {
  return api().resolveBuiltInMedia(assetNames) as Promise<Envelope<Record<string, string | null>>>;
}

// ─── Events (main → renderer). Each returns an unsubscribe function. ─────────

type Subscribe<P> = (callback: Callback<P>) => Unsubscribe;
const on =
  <P>(method: keyof Window['electronAPI']): Subscribe<P> =>
  (callback) =>
    (api()[method] as (cb: Callback<P>) => Unsubscribe)(callback);

export function onSlideAdvance(
  callback: Callback<{ slide: { id: string; sectionId?: string } | null }>
): Unsubscribe {
  return on<{ slide: { id: string; sectionId?: string } | null }>('onSlideAdvance')(callback);
}
export function onPresenterStop(callback: Callback<undefined>): Unsubscribe {
  return on<undefined>('onPresenterStop')(callback);
}
export function onOutputUpdate(
  callback: Callback<{ slide: unknown; background: unknown }>
): Unsubscribe {
  return on<{ slide: unknown; background: unknown }>('onOutputUpdate')(callback);
}
export function onOutputBlack(callback: Callback<{ active: boolean }>): Unsubscribe {
  return on<{ active: boolean }>('onOutputBlack')(callback);
}
export function onOutputLogo(callback: Callback<{ active: boolean }>): Unsubscribe {
  return on<{ active: boolean }>('onOutputLogo')(callback);
}
export function onOutputCountdown(
  callback: Callback<{ active: boolean; endAt: number | null; durationSeconds: number }>
): Unsubscribe {
  return on<{ active: boolean; endAt: number | null; durationSeconds: number }>(
    'onOutputCountdown'
  )(callback);
}
export function onStageUpdate(callback: Callback<unknown>): Unsubscribe {
  return on<unknown>('onStageUpdate')(callback);
}
export function onAppCommand(callback: Callback<unknown>): Unsubscribe {
  return on<unknown>('onAppCommand')(callback);
}
export function onSettingsUpdated(
  callback: Callback<{ key: string; value: unknown }>
): Unsubscribe {
  return on<{ key: string; value: unknown }>('onSettingsUpdated')(callback);
}
export function onWindowViewState(callback: Callback<{ isFullScreen: boolean }>): Unsubscribe {
  return on<{ isFullScreen: boolean }>('onWindowViewState')(callback);
}
export function onPreviewWindowClosed(
  callback: Callback<{ kind: 'output' | 'stage' }>
): Unsubscribe {
  return on<{ kind: 'output' | 'stage' }>('onPreviewWindowClosed')(callback);
}
export function onPreviewWindowState(
  callback: Callback<{ kind: 'output' | 'stage'; open: boolean }>
): Unsubscribe {
  return on<{ kind: 'output' | 'stage'; open: boolean }>('onPreviewWindowState')(callback);
}
