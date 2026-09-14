// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

// Plan L2 (audit CMD-B6, CMD-B10, LIVE-B12, ED-2). Four keyboard handlers each
// had their own idea of "the user is typing": none counted a <select>, none
// knew a dialog or settings sheet was open, and Canvas asked nobody at all — so
// Backspace in the toolbar's font-size box deleted the selected text box, ↓ on a
// focused <select> moved the slide selection, and Space on a dialog button
// advanced the projector. One guard now answers the question for all of them.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

import {
  isModalOpen,
  isTypingOutsideSlideEditor,
  isTypingTarget,
  shouldIgnoreGlobalShortcut,
} from '@/utils/shortcutGuard';
import { useAppStore } from '@/store/appStore';
import { useDialogStore } from '@/store/dialogStore';

const APP_INITIAL = useAppStore.getState();
const DIALOG_INITIAL = useDialogStore.getState();

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
  useAppStore.setState(APP_INITIAL, true);
  useDialogStore.setState(DIALOG_INITIAL, true);
});

describe('isTypingTarget', () => {
  it('counts text inputs, textareas, selects and contenteditable elements', () => {
    expect(isTypingTarget(el('<input type="text" />'))).toBe(true);
    expect(isTypingTarget(el('<input />'))).toBe(true);
    expect(isTypingTarget(el('<input type="number" />'))).toBe(true);
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(el('<select><option>a</option></select>'))).toBe(true);
    expect(isTypingTarget(el('<div contenteditable="true"></div>'))).toBe(true);
  });

  it('does not count buttons, checkboxes, plain elements or nothing', () => {
    expect(isTypingTarget(el('<button>go</button>'))).toBe(false);
    expect(isTypingTarget(el('<input type="checkbox" />'))).toBe(false);
    expect(isTypingTarget(el('<input type="radio" />'))).toBe(false);
    expect(isTypingTarget(el('<div></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('isTypingOutsideSlideEditor', () => {
  it('is true for a toolbar field, false for the slide text editor itself', () => {
    expect(isTypingOutsideSlideEditor(el('<input type="text" data-toolbar-field />'))).toBe(true);
    const editor = el(
      '<div data-slide-text-editor="true"><div contenteditable="true" id="inner"></div></div>'
    );
    expect(isTypingOutsideSlideEditor(editor.querySelector('#inner'))).toBe(false);
    expect(isTypingOutsideSlideEditor(el('<div></div>'))).toBe(false);
  });
});

describe('isModalOpen', () => {
  const FLAGS = [
    'shortcutsOpen',
    'tutorialOpen',
    'presentationSettingsOpen',
    'versionHistoryOpen',
    'outputSettingsOpen',
  ] as const;

  it('is false when nothing is open', () => {
    expect(isModalOpen()).toBe(false);
  });

  it('covers all 5 app overlay flags', () => {
    expect(FLAGS).toHaveLength(5);
  });

  for (const flag of FLAGS) {
    it(`is true while ${flag}`, () => {
      useAppStore.setState({ [flag]: true });
      expect(isModalOpen()).toBe(true);
    });
  }

  it('is true while a dialog is showing', () => {
    useDialogStore.setState({ dialog: { title: 'x', actions: [], resolve: () => {} } });
    expect(isModalOpen()).toBe(true);
  });
});

describe('shouldIgnoreGlobalShortcut', () => {
  it('ignores while typing, and while a modal is open, and not otherwise', () => {
    expect(shouldIgnoreGlobalShortcut()).toBe(false);

    const select = el('<select><option>a</option></select>');
    select.focus();
    expect(shouldIgnoreGlobalShortcut()).toBe(true);
    select.blur();
    expect(shouldIgnoreGlobalShortcut()).toBe(false);

    useAppStore.setState({ outputSettingsOpen: true });
    expect(shouldIgnoreGlobalShortcut()).toBe(true);
  });
});
