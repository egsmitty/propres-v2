// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Plan DLG1 (audit CMD-B8). Dialog's Enter handler used to resolve the
// `primary` action unconditionally, even when keyboard focus had moved to
// another one of the dialog's own buttons (e.g. Tab to Cancel, press Enter
// runs the primary — even destructive — action instead of Cancel). Enter must
// activate whichever dialog button currently has focus, and only fall back to
// primary when focus is not on a dialog button.
//
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass. Fix the root cause or record it as a suspected regression.

import DialogHost from '@/components/shared/Dialog';
import { useDialogStore } from '@/store/dialogStore';

const DIALOG_INITIAL = useDialogStore.getState();

beforeEach(() => {
  useDialogStore.setState(DIALOG_INITIAL, true);
});

function mountDialog(resolve: ReturnType<typeof vi.fn>) {
  useDialogStore.getState().show({
    title: 'Confirm',
    description: 'Sure?',
    actions: [
      { label: 'Cancel', value: 'cancel', cancel: true },
      { label: 'OK', value: 'ok', primary: true },
    ],
    resolve,
  });
  render(<DialogHost />);
}

describe('Dialog Enter respects the focused button', () => {
  it('focus on the non-primary (Cancel) button + Enter resolves Cancel, not primary', () => {
    const resolve = vi.fn();
    mountDialog(resolve);
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    cancelButton.focus();
    fireEvent.keyDown(cancelButton, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ action: 'cancel', values: {} });
  });

  it('focus on nothing in particular + Enter still resolves primary', () => {
    const resolve = vi.fn();
    mountDialog(resolve);
    // No field in this dialog auto-focuses, so document.activeElement is
    // document.body — not one of the dialog's own buttons.
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ action: 'ok', values: {} });
  });

  it('focus on the primary (OK) button + Enter resolves primary exactly once', () => {
    const resolve = vi.fn();
    mountDialog(resolve);
    const okButton = screen.getByRole('button', { name: 'OK' });
    okButton.focus();
    fireEvent.keyDown(okButton, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ action: 'ok', values: {} });
  });
});
