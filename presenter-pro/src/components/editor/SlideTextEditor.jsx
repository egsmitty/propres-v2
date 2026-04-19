import React, { useEffect, useRef, useState } from 'react'
import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup'
import { resolvePlaceholderText } from '@/utils/textBoxes'

function selectAllContents(element, collapseToEnd = false) {
  const range = document.createRange()
  const selection = window.getSelection()
  range.selectNodeContents(element)
  if (collapseToEnd) range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function SlideTextEditor({
  textBox,
  onSave,
  onBlurCommit,
  onEscape,
  onTabNext,
}) {
  const ref = useRef(null)
  const [placeholderActive, setPlaceholderActive] = useState(false)

  function saveCurrentValue() {
    if (!ref.current) return
    onSave(placeholderActive ? '' : ref.current.innerHTML)
  }

  useEffect(() => {
    if (!ref.current) return
    const hasBody = slideBodyToPlainText(textBox?.body || '').trim().length > 0
    const placeholderText = resolvePlaceholderText(textBox?.placeholderText)
    const shouldShowPlaceholder = !hasBody && Boolean(placeholderText)

    setPlaceholderActive(shouldShowPlaceholder)
    ref.current.innerHTML = shouldShowPlaceholder
      ? placeholderText
      : slideBodyToHtml(textBox?.body || '')

    selectAllContents(ref.current, !shouldShowPlaceholder)
    ref.current.focus()
  }, [textBox?.body, textBox?.placeholderText, textBox?.id])

  function handleBeforeInput() {
    if (!ref.current || !placeholderActive) return
    ref.current.innerHTML = ''
    setPlaceholderActive(false)
  }

  function handleInput() {
    if (!ref.current || !placeholderActive) return
    if (slideBodyToPlainText(ref.current.innerHTML).trim() !== '') {
      setPlaceholderActive(false)
    }
  }

  function handleKeyDown(e) {
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

  function handleBlur(e) {
    const nextTarget = e.relatedTarget
    if (nextTarget?.closest?.('[data-editor-toolbar="true"]')) return
    saveCurrentValue()
    onBlurCommit?.()
  }

  const style = textBox?.textStyle || {}

  return (
    <div className="w-full h-full flex flex-col" style={{ justifyContent: 'inherit' }}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full outline-none"
        style={{
          color: placeholderActive ? '#6b7280' : style.color || '#ffffff',
          fontSize: style.size || 100,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: style.italic ? 'italic' : 'normal',
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
