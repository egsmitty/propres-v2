/**
 * Plan L1 (audit LIVE-A11 / CMD-B2). Escape stops a live presentation only when
 * nothing else consumed it first. Every overlay that closes on Escape — dialogs,
 * menus, the shortcuts sheet, the settings modals — handles it in the window's
 * capture phase and calls `preventDefault()`, so by the time the Editor's own
 * listener runs, a consumed Escape reads `defaultPrevented: true`.
 */
export function shouldStopPresentingOnEscape(
  event: { key: string; defaultPrevented: boolean },
  isPresenting: boolean
): boolean {
  return event.key === 'Escape' && isPresenting && !event.defaultPrevented;
}
