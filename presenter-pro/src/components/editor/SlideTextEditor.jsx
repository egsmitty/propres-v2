import React, { useEffect, useRef, useState } from 'react'
import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup'
import { DEFAULT_TEXT_STYLE, resolvePlaceholderText } from '@/utils/textBoxes'
import { isRecentEditorToolbarInteraction } from '@/utils/richTextEditor'

function selectAllContents(element, collapseToEnd = false) {
  const range = document.createRange()
  const selection = window.getSelection()
  range.selectNodeContents(element)
  if (collapseToEnd) range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function normalizeEditorHtml(html) {
  return String(html || '')
    .replace(/&nbsp;/gi, ' ')
}

function isTextInsertionKey(event) {
  if (!event) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return event.key.length === 1 || event.key === 'Enter'
}

export default function SlideTextEditor({
  textBox,
  onSave,
  onBlurCommit,
  onEscape,
  onTabNext,
}) {
  const ref = useRef(null)
  const blurFrameRef = useRef(null)
  const seedingRef = useRef(false)
  const [placeholderActive, setPlaceholderActive] = useState(false)

  function clearPlaceholder() {
    if (!placeholderActive) return
    if (ref.current) ref.current.innerHTML = ''
    setPlaceholderActive(false)
  }

  function saveCurrentValue() {
    if (!ref.current) return
    onSave(placeholderActive ? '' : normalizeEditorHtml(ref.current.innerHTML))
  }

  useEffect(() => {
    if (!ref.current) return
    const hasBody = slideBodyToPlainText(textBox?.body || '').trim().length > 0
    const placeholderText = resolvePlaceholderText(textBox?.placeholderText)
    const shouldShowPlaceholder = !hasBody && Boolean(placeholderText)

    seedingRef.current = true
    setPlaceholderActive(shouldShowPlaceholder)
    ref.current.innerHTML = shouldShowPlaceholder
      ? ''
      : slideBodyToHtml(textBox?.body || '')

    selectAllContents(ref.current, true)
    ref.current.focus()
    window.requestAnimationFrame(() => {
      seedingRef.current = false
    })
  }, [textBox?.id, textBox?.placeholderText])

  useEffect(() => () => {
    if (blurFrameRef.current) {
      window.cancelAnimationFrame(blurFrameRef.current)
    }
  }, [])

  function handleBeforeInput() {
    if (!ref.current || !placeholderActive) return
    ref.current.innerHTML = ''
    setPlaceholderActive(false)
  }

  function handleInput() {
    if (!ref.current) return
    const nextBody = normalizeEditorHtml(ref.current.innerHTML)
    const hasContent = slideBodyToPlainText(nextBody).trim() !== ''

    if (placeholderActive && hasContent) {
      setPlaceholderActive(false)
    }

    onSave(hasContent ? nextBody : '')
  }

  function handleKeyDown(e) {
    if (placeholderActive && (isTextInsertionKey(e) || e.key === 'Backspace' || e.key === 'Delete')) {
      clearPlaceholder()
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      saveCurrentValue()
      onEscape?.()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      saveCurrentValue()
      onTabNext?.(e.shiftKey ? -1 : 1)
    }
  }

  function handlePaste() {
    clearPlaceholder()
  }

  function handleBlur(e) {
    const nextTarget = e.relatedTarget
    if (nextTarget?.closest?.('[data-editor-toolbar="true"]')) return

    if (blurFrameRef.current) {
      window.cancelAnimationFrame(blurFrameRef.current)
    }

    blurFrameRef.current = window.requestAnimationFrame(() => {
      const active = document.activeElement
      if (active?.closest?.('[data-editor-toolbar="true"]') || isRecentEditorToolbarInteraction()) return
      saveCurrentValue()
      onBlurCommit?.()
    })
  }

  const style = textBox?.textStyle || {}

  return (
    <div className="w-full h-full flex flex-col" style={{ justifyContent: 'inherit' }}>
      <div
        ref={ref}
        data-slide-text-editor="true"
        data-text-box-id={textBox?.id || ''}
        data-placeholder-active={placeholderActive ? 'true' : 'false'}
        contentEditable
        suppressContentEditableWarning
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => {
          if (blurFrameRef.current) {
            window.cancelAnimationFrame(blurFrameRef.current)
            blurFrameRef.current = null
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full outline-none"
        style={{
          color: placeholderActive ? '#888888' : style.color || '#ffffff',
          fontSize: style.size || DEFAULT_TEXT_STYLE.size,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: placeholderActive ? 'italic' : (style.italic ? 'italic' : 'normal'),
          textDecoration: [style.underline ? 'underline' : null, style.strikethrough ? 'line-through' : null].filter(Boolean).join(' ') || 'none',
          textAlign: style.align || 'center',
          lineHeight: style.lineHeight || 1.3,
          fontFamily: style.fontFamily || 'Arial, sans-serif',
          caretColor: style.color || '#ffffff',
          userSelect: 'text',
          cursor: 'text',
          minHeight: '1em',
          whiteSpace: textBox?.wrapText === false ? 'nowrap' : 'normal',
          wordBreak: textBox?.wrapText === false ? 'normal' : 'break-word',
          writingMode: textBox?.textDirection === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
        }}
      />
    </div>
  )
}
