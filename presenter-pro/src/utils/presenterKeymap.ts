/**
 * Plan L2 (audit LIVE-C1, LIVE-C2). The keys a live presentation responds to,
 * copied from PowerPoint's Slide Show so a volunteer's habits — and a
 * presentation clicker, which sends PageDown / PageUp and often `.` for its
 * blank button — work here unchanged.
 *
 * Any key held with ⌘ / Ctrl / Alt is never a slide move: ⌘→ and ⌘B belong to
 * the editor and the OS.
 */
export type PresenterAction = 'next' | 'prev' | 'first' | 'last' | 'black';

export function presenterActionForKey(event: {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): PresenterAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
    case 'n':
    case 'N':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
    case 'p':
    case 'P':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'b':
    case 'B':
    case '.':
      return 'black';
    default:
      return event.code === 'Space' ? 'next' : null;
  }
}
