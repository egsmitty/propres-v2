/**
 * Preload: builds `window.electronAPI` from the IPC contract (plan B1).
 *
 * Nothing here is written by hand per channel any more. Every method name and
 * channel comes from `shared/ipcContract.ts`, so preload cannot drift from
 * main or the renderer wrapper. The five methods that box positional
 * arguments into one object (`ARG_SHAPERS`) do so exactly as before.
 *
 * ESM source on purpose: electron-vite only bundles ES imports into the
 * preload output. A CommonJS `require('../../shared/ipcContract')` is left
 * external and fails at runtime in the packaged app.
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  ARG_SHAPERS,
  EVENT_METHODS,
  INVOKE_METHODS,
  SEND_METHODS,
  type ElectronApi,
} from '../../shared/ipcContract';

type Shaper = (...args: unknown[]) => unknown[];

function subscribe(channel: string, callback: (payload: unknown) => void): () => void {
  const handler = (_event: unknown, payload: unknown) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: Record<string, unknown> = {
  platform: process.platform,
};

const shapers = ARG_SHAPERS as Record<string, Shaper | undefined>;

for (const [method, channel] of Object.entries(INVOKE_METHODS)) {
  const shape = shapers[method];
  api[method] = shape
    ? (...args: unknown[]) => ipcRenderer.invoke(channel, ...shape(...args))
    : (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

for (const [method, channel] of Object.entries(SEND_METHODS)) {
  api[method] = (...args: unknown[]) => ipcRenderer.send(channel, ...args);
}

for (const [method, channel] of Object.entries(EVENT_METHODS)) {
  api[method] = (callback: (payload: unknown) => void) => subscribe(channel, callback);
}

contextBridge.exposeInMainWorld('electronAPI', api as unknown as ElectronApi);
