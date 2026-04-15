import React, { useRef, useEffect } from 'react'

export default function SlideTextEditor({ slide, onSave, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      // Place cursor at end
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onSave(ref.current.innerText)
    }
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onBlur={() => onSave(ref.current.innerText)}
      className="w-full h-full outline-none"
      style={{
        color: slide.textStyle?.color || '#ffffff',
        fontSize: slide.textStyle?.size || 52,
        fontWeight: slide.textStyle?.bold ? 700 : 400,
        textAlign: slide.textStyle?.align || 'center',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 1.3,
        caretColor: '#fff',
        userSelect: 'text',
        cursor: 'text',
      }}
    >
      {slide.body}
    </div>
  )
}
