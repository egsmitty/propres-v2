import type { ElectronApi } from '../../shared/ipcContract';

declare global {
  interface Window {
    /** Built by `electron/preload/index.js` from the IPC contract. Use `@/utils/ipc`, never this directly. */
    electronAPI: ElectronApi;
  }
}

export {};
