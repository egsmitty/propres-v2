/**
 * Plan CMDS1 PR B — keeps the native menu's enabled state in step with the
 * command registry.
 *
 * The native menu is built once by the main process and knows nothing about
 * the renderer's state, so every item used to be always enabled. This pushes
 * the registry's enabled map (`nativeMenuEnabled`) once on start and again
 * whenever it changes, and main greys the items by id. The registry's guard
 * in `runAppCommand` remains the safety; this is the grey pixels.
 *
 * Only the main window syncs. The output and stage windows hold their own
 * stores (Home view, no presentation) and a push from them would grey the
 * whole menu, last writer wins — so the sync is a no-op there.
 */

import { setMenuEnabled } from '@/utils/ipc';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { nativeMenuEnabled, readCommandState } from '@/utils/commandRegistry';

function isSecondaryWindow(hash: string): boolean {
  return hash.startsWith('#/output') || hash.startsWith('#/stage-display');
}

/** Starts the sync; returns a function that stops it. */
export function startNativeMenuSync(): () => void {
  if (typeof window !== 'undefined' && isSecondaryWindow(window.location.hash)) {
    return () => {};
  }

  let lastSent = '';
  const push = () => {
    const enabled = nativeMenuEnabled(readCommandState());
    const key = JSON.stringify(enabled);
    if (key === lastSent) return;
    lastSent = key;
    setMenuEnabled({ enabled });
  };

  push();
  const unsubscribes = [
    useAppStore.subscribe(push),
    useEditorStore.subscribe(push),
    usePresenterStore.subscribe(push),
  ];
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
