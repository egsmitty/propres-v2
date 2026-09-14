import { shouldStopPresentingOnEscape } from '@/utils/escapeKey';
import { presenterActionForKey } from '@/utils/presenterKeymap';

/**
 * Plan L2. What the Editor's window keydown handler does with a key, as a pure
 * decision so it can be tested without mounting the editor.
 *
 * While presenting, the navigation keys (↑ ↓ Backspace and friends) belong to
 * the presenter panel, and Delete does nothing — Backspace used to delete the
 * selected slide mid-service (audit LIVE-A5). Nothing fires behind an open
 * dialog or settings sheet (CMD-B6).
 */
export type EditorKeyState = {
  isPresenting: boolean;
  /** The song library, media library or new-song editor is open. */
  panelOpen: boolean;
  /** A slide text box is being edited. */
  editing: boolean;
  /** Focus is in a text field, select or contenteditable. */
  typing: boolean;
  /** A dialog, settings sheet, shortcuts sheet or the tutorial is showing. */
  modalOpen: boolean;
};

export type EditorKeyAction =
  | 'save'
  | 'selectPrev'
  | 'selectNext'
  | 'deleteSlide'
  | 'present'
  | 'stopPresenting'
  | 'toggleShortcuts'
  | 'black'
  | 'logo';

export function editorKeyAction(
  event: {
    key: string;
    code?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    defaultPrevented?: boolean;
  },
  state: EditorKeyState
): EditorKeyAction | null {
  if (state.panelOpen || state.editing || state.typing || state.modalOpen) return null;

  const meta = Boolean(event.metaKey || event.ctrlKey);
  const key = event.key;

  if (meta && key === 's') return 'save';
  if (key === 'F5') return 'present';
  if (key === '?' && !meta) return 'toggleShortcuts';

  if (state.isPresenting) {
    if (key === 'Escape') {
      return shouldStopPresentingOnEscape(
        { key, defaultPrevented: Boolean(event.defaultPrevented) },
        true
      )
        ? 'stopPresenting'
        : null;
    }
    if (meta || event.altKey) return null;
    if (key === 'l' || key === 'L') return 'logo';
    // B and `.` black the output; every other presenter key (↑ ↓ Backspace …)
    // is the panel's, and Delete does nothing.
    return presenterActionForKey(event) === 'black' ? 'black' : null;
  }

  if (meta) return null;
  if (key === 'ArrowUp') return 'selectPrev';
  if (key === 'ArrowDown') return 'selectNext';
  if (key === 'Delete' || key === 'Backspace') return 'deleteSlide';
  return null;
}
