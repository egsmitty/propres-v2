import React, { useRef, useEffect } from 'react'
import { slideBodyToHtml } from '@/utils/slideMarkup'

export default function SlideTextEditor({ slide, onSave, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = slideBodyToHtml(slide.body)
    // Place cursor at end
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(ref.current)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    ref.current.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onSave(ref.current.innerHTML)
    }
  }

  function handleBlur(e) {
    const nextTarget = e.relatedTarget
    if (nextTarget?.closest?.('[data-editor-toolbar="true"]')) return
    onSave(ref.current.innerHTML)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-full outline-none"
      style={{
        color: slide.textStyle?.color || '#ffffff',
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
