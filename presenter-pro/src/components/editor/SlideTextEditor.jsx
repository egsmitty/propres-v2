import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TEXT_COLOR } from '@/utils/colorPalettes';
import { useLatest } from '@/hooks/useLatest';
import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup';
import { resolvePlaceholderText } from '@/utils/textBoxes';
import { textBoxContentStyle } from '@/utils/slideRenderStyle';
import { isRecentEditorToolbarInteraction } from '@/utils/richTextEditor';

function selectAllContents(element, collapseToEnd = false) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  if (collapseToEnd) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeEditorHtml(html) {
  return String(html || '').replace(/&nbsp;/gi, ' ');
}

/**
 * Plan ED3 (audit ED-9). Inserts plain text at the caret. The browser's
 * `insertText` command is preferred: it keeps the native undo stack and turns
 * newlines into line breaks. Where it is missing or refuses (jsdom has none),
 * the text goes in as text nodes separated by `<br>`, and the caret moves to
 * the end of what was inserted.
 */
function insertPlainText(element, text) {
  try {
    if (
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, text)
    ) {
      return;
    }
  } catch {
    // Fall back to inserting the nodes by hand.
  }

  const selection = window.getSelection();
  let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !element.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }

  range.deleteContents();
  const fragment = document.createDocumentFragment();
  text.split('\n').forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement('br'));
    if (line) fragment.appendChild(document.createTextNode(line));
  });
  const lastInserted = fragment.lastChild;
  range.insertNode(fragment);

  if (lastInserted && selection) {
    const caret = document.createRange();
    caret.setStartAfter(lastInserted);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  }
}

function isTextInsertionKey(event) {
  if (!event) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.key.length === 1 || event.key === 'Enter';
}

export default function SlideTextEditor({
  textBox,
  onSave,
  onBlurCommit,
  onEscape,
  onTabNext,
  registerCommitHandler,
}) {
  const ref = useRef(null);
  const blurFrameRef = useRef(null);
  const seedingRef = useRef(false);
  const [placeholderActive, setPlaceholderActive] = useState(false);

  function clearPlaceholder() {
    if (!placeholderActive) return;
    if (ref.current) ref.current.innerHTML = '';
    setPlaceholderActive(false);
  }

  const saveCurrentValue = useCallback(() => {
    if (!ref.current) return;
    onSave(placeholderActive ? '' : normalizeEditorHtml(ref.current.innerHTML));
  }, [onSave, placeholderActive]);

  // Seeding reads the body at seed time only: re-running this effect on every
  // body keystroke would rewrite the editor while typing (plan D3 #5).
  const latestBody = useLatest(textBox?.body);
  useEffect(() => {
    if (!ref.current) return;
    const hasBody = slideBodyToPlainText(latestBody.current || '').trim().length > 0;
    const placeholderText = resolvePlaceholderText(textBox?.placeholderText);
    const shouldShowPlaceholder = !hasBody && Boolean(placeholderText);

    seedingRef.current = true;
    setPlaceholderActive(shouldShowPlaceholder);
    ref.current.innerHTML = shouldShowPlaceholder ? '' : slideBodyToHtml(latestBody.current || '');

    selectAllContents(ref.current, true);
    ref.current.focus();
    window.requestAnimationFrame(() => {
      seedingRef.current = false;
    });
  }, [latestBody, textBox?.id, textBox?.placeholderText]);

  useEffect(
    () => () => {
      if (blurFrameRef.current) {
        window.cancelAnimationFrame(blurFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!registerCommitHandler) return undefined;
    registerCommitHandler(saveCurrentValue);
    return () => registerCommitHandler(null);
  }, [registerCommitHandler, saveCurrentValue]);

  function handleBeforeInput() {
    if (!ref.current || !placeholderActive) return;
    ref.current.innerHTML = '';
    setPlaceholderActive(false);
  }

  function handleInput() {
    if (!ref.current) return;
    const nextBody = normalizeEditorHtml(ref.current.innerHTML);
    const hasContent = slideBodyToPlainText(nextBody).trim() !== '';

    if (placeholderActive && hasContent) {
      setPlaceholderActive(false);
    }

    onSave(hasContent ? nextBody : '');
  }

  function handleKeyDown(e) {
    if (
      placeholderActive &&
      (isTextInsertionKey(e) || e.key === 'Backspace' || e.key === 'Delete')
    ) {
      clearPlaceholder();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      saveCurrentValue();
      onEscape?.();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      saveCurrentValue();
      onTabNext?.(e.shiftKey ? -1 : 1);
    }
  }

  // ED-9: paste keeps text only, like PowerPoint's "Keep Text Only". Letting the
  // browser paste the clipboard's HTML brought Word/Docs spans, inline styles
  // and `pt` font sizes into the slide body. A paste with no text (an image)
  // does nothing.
  function handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    if (!text || !ref.current) return;

    clearPlaceholder();
    insertPlainText(ref.current, text);
    // preventDefault() also suppresses the input event, so save the same way.
    handleInput();
  }

  function handleBlur(e) {
    const nextTarget = e.relatedTarget;
    if (nextTarget?.closest?.('[data-editor-toolbar="true"]')) return;

    if (blurFrameRef.current) {
      window.cancelAnimationFrame(blurFrameRef.current);
    }

    blurFrameRef.current = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active?.closest?.('[data-editor-toolbar="true"]') || isRecentEditorToolbarInteraction())
        return;
      saveCurrentValue();
      onBlurCommit?.();
    });
  }

  // Plan ED36 slice 3: the editor's text reads the same style module as the
  // rendered box, so what you type cannot drift from what is drawn. Only the
  // text properties are taken; the box's frame, padding and shadows belong to
  // the container the canvas renders around this editor.
  const content = textBoxContentStyle(textBox || {}, { placeholder: placeholderActive });

  return (
    <div className="w-full h-full flex flex-col" style={{ justifyContent: 'inherit' }}>
      <div
        ref={ref}
        data-slide-text-editor="true"
        data-text-box-id={textBox?.id || ''}
        data-placeholder-active={placeholderActive ? 'true' : 'false'}
        dir="auto"
        contentEditable
        suppressContentEditableWarning
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => {
          if (blurFrameRef.current) {
            window.cancelAnimationFrame(blurFrameRef.current);
            blurFrameRef.current = null;
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full outline-hidden"
        style={{
          color: content.color,
          fontSize: content.fontSize,
          fontWeight: content.fontWeight,
          fontStyle: content.fontStyle,
          textDecoration: content.textDecoration,
          textAlign: content.textAlign,
          lineHeight: content.lineHeight,
          fontFamily: content.fontFamily,
          caretColor: textBox?.textStyle?.color || DEFAULT_TEXT_COLOR,
          userSelect: 'text',
          cursor: 'text',
          minHeight: '1em',
          whiteSpace: content.whiteSpace,
          wordBreak: content.wordBreak,
          writingMode: content.writingMode,
        }}
      />
    </div>
  );
}
