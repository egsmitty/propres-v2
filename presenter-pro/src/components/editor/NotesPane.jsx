import React, { useState, useEffect, useRef } from 'react'
import { FileText, ChevronUp } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'

export default function NotesPane() {
  const [isOpen, setIsOpen] = useState(false)
  const [localNotes, setLocalNotes] = useState('')
  const textareaRef = useRef(null)

  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const presentation = useEditorStore((s) => s.presentation)
  const updateSlideNotes = useEditorStore((s) => s.updateSlideNotes)

  const slide = presentation?.sections
    ?.find((s) => s.id === selectedSectionId)
    ?.slides?.find((sl) => sl.id === selectedSlideId) || null

  // Sync local notes when selected slide changes
  useEffect(() => {
    setLocalNotes(slide?.notes || '')
  }, [selectedSlideId])

  function handleBlur() {
    if (!selectedSectionId || !selectedSlideId) return
    if (localNotes !== (slide?.notes || '')) {
      updateSlideNotes(selectedSectionId, selectedSlideId, localNotes)
    }
  }

  const hasSlide = !!selectedSlideId

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        height: isOpen ? 120 : 28,
        transition: 'height 0.2s ease',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-toolbar)',
      }}
    >
      {/* Toggle bar */}
      <div
        className="flex items-center px-3 cursor-pointer select-none"
        style={{ height: 28 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <FileText size={14} style={{ color: 'var(--text-secondary)', marginRight: 6 }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Notes</span>
        <ChevronUp
          size={14}
          style={{
            color: 'var(--text-secondary)',
            marginLeft: 'auto',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

      {/* Textarea area */}
      <textarea
        ref={textareaRef}
        value={localNotes}
        onChange={(e) => setLocalNotes(e.target.value)}
        onBlur={handleBlur}
        disabled={!hasSlide}
        placeholder={hasSlide ? 'Speaker notes for this slide...' : 'Select a slide to add notes'}
        style={{
          display: 'block',
          width: '100%',
          height: 92,
          padding: '10px 12px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          fontSize: 13,
          lineHeight: 1.5,
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  )
}
