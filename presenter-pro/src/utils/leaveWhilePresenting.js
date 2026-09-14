import { usePresenterStore } from '@/store/presenterStore';
import { confirmDialog } from '@/utils/dialog';
import { stopPresentationSession } from '@/utils/presenterFlow';

/**
 * Plan L4 (audit LIVE-A6). Every way of leaving the deck — File ▸ Open,
 * File ▸ Close, File ▸ New, the title bar's Home button — used to switch away
 * with a presentation still live: the editor unmounted (taking the presenter
 * keys with it), the projector froze on its last slide, and opening another
 * deck synced ITS slides into the session so the next Space sent the new deck's
 * first slide to the congregation.
 *
 * Asks the same question quitting already asks, and stops the session cleanly
 * before the caller leaves. Deliberately a confirm, not a hard block, for the
 * same reason as the quit guard: a stuck `isPresenting` must never trap anyone.
 *
 * @param {string} actionLabel what the user is about to do, e.g. "go back home"
 * @returns {Promise<boolean>} true when it is safe to leave
 */
export async function confirmStopBeforeLeaving(actionLabel) {
  if (!usePresenterStore.getState().isPresenting) return true;

  const stop = await confirmDialog(
    `A presentation is live on the output display. Stop presenting before you ${actionLabel}?`,
    { title: 'Still Presenting', confirmLabel: 'Stop Presenting', cancelLabel: 'Cancel' }
  );
  if (!stop) return false;

  await stopPresentationSession();
  return true;
}
