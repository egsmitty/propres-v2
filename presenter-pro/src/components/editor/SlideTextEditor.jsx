import React, { useRef, useEffect, useState } from 'react'
import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup'

export default function SlideTextEditor({ slide, onSave, onCancel }) {
  const ref = useRef(null)
  const [placeholderActive, setPlaceholderActive] = useState(false)

  function saveCurrentValue() {
    if (!ref.current) return
    onSave(placeholderActive ? '' : ref.current.innerHTML)
  }

  useEffect(() => {
    if (!ref.current) return
    const hasBody = slideBodyToPlainText(slide.body).trim().length > 0
    const shouldShowPlaceholder = !hasBody && Boolean(slide.placeholderText)

    setPlaceholderActive(shouldShowPlaceholder)
    ref.current.innerHTML = shouldShowPlaceholder
      ? slide.placeholderText
      : slideBodyToHtml(slide.body)

    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(ref.current)
    if (!shouldShowPlaceholder) range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    ref.current.focus()
  }, [slide.body, slide.placeholderText])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      saveCurrentValue()
    }
  }

  function handleBeforeInput() {
    if (!ref.current || !placeholderActive) return
    ref.current.innerHTML = ''
    setPlaceholderActive(false)
  }

  function handleInput() {
    if (!ref.current) return
    if (placeholderActive && slideBodyToPlainText(ref.current.innerHTML).trim() !== slide.placeholderText) {
      setPlaceholderActive(false)
    }
  }

  function handleBlur(e) {
    const nextTarget = e.relatedTarget
    if (nextTarget?.closest?.('[data-editor-toolbar="true"]')) return
    saveCurrentValue()
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onBlur={handleBlur}
      className="w-full outline-none"
      style={{
        color: placeholderActive ? '#555' : slide.textStyle?.color || '#ffffff',
        fontSize: slide.textStyle?.size || 52,
        fontWeight: slide.textStyle?.bold ? 700 : 400,
        textAlign: slide.textStyle?.align || 'center',
        wordBreak: 'break-word',
        lineHeight: 1.3,
        caretColor: '#fff',
        userSelect: 'text',
        cursor: 'text',
        minHeight: '1em',
      }}
    />
  )
}
