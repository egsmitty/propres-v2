import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';

/**
 * Plan L2 (audit CMD-B6, CMD-B10, LIVE-B12, ED-2). One answer to "should a
 * window-level shortcut ignore this key press?", shared by every handler that
 * listens on `window`. Before this, each handler had its own inline check, none
 * counted a <select>, none knew a dialog or settings sheet was open, and Canvas
 * checked nothing.
 */

// Input types that take no typed text — keys on them are fair game.
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  if ((el as HTMLElement).isContentEditable === true) return true;
  // jsdom does not implement isContentEditable; the attribute is the same fact.
  return Boolean(
    el.closest?.(
      '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
    )
  );
}

/**
 * A text field that is NOT the slide text editor — the toolbar's font-size box,
 * a rename field. Canvas owns keys inside the slide editor (⌘B, Escape), but
 * must leave every other field alone: Backspace in the font-size box used to
 * delete the selected text box.
 */
export function isTypingOutsideSlideEditor(el: Element | null | undefined): boolean {
  if (!isTypingTarget(el)) return false;
  return !el?.closest?.('[data-slide-text-editor]');
}

/** A dialog, settings sheet, the shortcuts sheet or the tutorial is showing. */
export function isModalOpen(): boolean {
  const app = useAppStore.getState();
  return Boolean(
    app.shortcutsOpen ||
    app.tutorialOpen ||
    app.presentationSettingsOpen ||
    app.versionHistoryOpen ||
    app.outputSettingsOpen ||
    useDialogStore.getState().dialog
  );
}

export function shouldIgnoreGlobalShortcut(): boolean {
  return isTypingTarget(document.activeElement) || isModalOpen();
}
