// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import SlideTextEditor from '@/components/editor/SlideTextEditor';
import { slideBodyToPlainText } from '@/utils/slideMarkup';

// Plan ED3 (audit ED-9). Pasting lyrics from Word, Google Docs or a web page
// let the browser insert the clipboard's HTML — spans, inline styles, `pt`
// font sizes that don't scale in thumbnails — straight into the slide body.
// Paste now keeps text only (PowerPoint's "Keep Text Only").
//
// jsdom has no native paste, so it cannot show the browser inserting HTML.
// What it can prove is the mechanism: the old handler never prevented the
// default (so the browser's HTML paste ran), and inserted nothing itself.

type Clipboard = Partial<Record<'text/plain' | 'text/html', string>>;

function renderEditor(textBox: { id: string; body: string; placeholderText?: string }) {
  const onSave = vi.fn();
  const { container } = render(
    <SlideTextEditor
      textBox={textBox}
      onSave={onSave}
      onBlurCommit={() => {}}
      onEscape={() => {}}
      onTabNext={() => {}}
      registerCommitHandler={() => {}}
    />
  );
  const editor = container.querySelector('[data-slide-text-editor="true"]') as HTMLElement;
  return { editor, onSave };
}

/** Fires a paste and reports whether the browser's own paste was cancelled. */
function paste(editor: HTMLElement, clipboard: Clipboard): boolean {
  const event = fireEvent.paste(editor, {
    clipboardData: { getData: (type: string) => clipboard[type as keyof Clipboard] ?? '' },
  });
  // fireEvent returns false when the handler called preventDefault().
  return event === false;
}

function lastSavedBody(onSave: ReturnType<typeof vi.fn>): string {
  const calls = onSave.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? '');
}

const originalExecCommand = document.execCommand;

afterEach(() => {
  document.execCommand = originalExecCommand;
});

describe('SlideTextEditor paste keeps text only (ED-9)', () => {
  it('cancels the browser paste of styled HTML and saves just the words', () => {
    const { editor, onSave } = renderEditor({ id: 'box-1', body: '' });

    const cancelled = paste(editor, {
      'text/html':
        '<span style="font-size:14pt;font-family:Calibri;mso-bidi-font-size:11pt">Amazing grace</span>',
      'text/plain': 'Amazing grace',
    });

    expect(cancelled).toBe(true);
    const body = lastSavedBody(onSave);
    expect(slideBodyToPlainText(body)).toBe('Amazing grace');
    expect(body).not.toMatch(/<span|style=|pt/);
  });

  it('keeps the lines of pasted lyrics, whatever the line endings', () => {
    const { editor, onSave } = renderEditor({ id: 'box-1', body: '' });

    paste(editor, { 'text/plain': 'How sweet the sound\r\nThat saved a wretch like me' });

    expect(slideBodyToPlainText(lastSavedBody(onSave))).toBe(
      'How sweet the sound\nThat saved a wretch like me'
    );
  });

  it('replaces the placeholder in an empty box', () => {
    const { editor, onSave } = renderEditor({
      id: 'box-1',
      body: '',
      placeholderText: 'Click to edit',
    });

    paste(editor, { 'text/plain': 'Hello' });

    expect(slideBodyToPlainText(lastSavedBody(onSave))).toBe('Hello');
  });

  it('uses the browser insertText command when it exists, so undo still works', () => {
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    const { editor } = renderEditor({ id: 'box-1', body: '' });

    paste(editor, { 'text/plain': 'Hello' });

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'Hello');
  });

  it('cancels a paste with no text (an image) and saves nothing', () => {
    const { editor, onSave } = renderEditor({ id: 'box-1', body: '' });

    const cancelled = paste(editor, { 'text/html': '<img src="file:///tmp/picture.png">' });

    expect(cancelled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    expect(editor.querySelector('img')).toBeNull();
  });
});
