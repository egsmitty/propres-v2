import React from 'react'
import { Plus, Copy, Trash2, Music, Image, Square, Play } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { uuid } from '@/utils/uuid'

function ToolbarBtn({ icon: Icon, label, shortcut, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex items-center justify-center w-7 h-7 rounded"
      style={{ color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer' }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)'
      }}
    >
      <Icon size={15} />
    </button>
  )
}

function Separator() {
  return <div className="mx-1 h-5 w-px" style={{ background: 'var(--border-default)' }} />
}

export default function Toolbar({ onPresent }) {
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const isPresenting = usePresenterStore((s) => s.isPresenting)

  const hasPresentation = !!presentation
  const hasSlide = !!selectedSlideId

  function handleNewSlide() {
    if (!presentation) return
    const targetSection =
      presentation.sections.find((s) => s.id === selectedSectionId) ||
      presentation.sections[0]
    if (!targetSection) return
    const newSlide = {
      id: uuid(),
      type: 'blank',
      label: 'Slide',
      body: '',
      notes: '',
      backgroundId: null,
      textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
    }
    const sections = presentation.sections.map((sec) =>
      sec.id === targetSection.id ? { ...sec, slides: [...sec.slides, newSlide] } : sec
    )
    useEditorStore.getState().setPresentation({ ...presentation, sections })
    useEditorStore.getState().setDirty(true)
    useEditorStore.getState().setSelectedSlide(targetSection.id, newSlide.id)
  }

  function handleDuplicate() {
    if (!presentation || !selectedSlideId) return
    const state = useEditorStore.getState()
    const sections = presentation.sections.map((sec) => {
      const idx = sec.slides.findIndex((sl) => sl.id === selectedSlideId)
      if (idx === -1) return sec
      const copy = { ...sec.slides[idx], id: uuid() }
      const slides = [...sec.slides]
      slides.splice(idx + 1, 0, copy)
      return { ...sec, slides }
    })
    state.setPresentation({ ...presentation, sections })
    state.setDirty(true)
  }

  function handleDelete() {
    if (!presentation || !selectedSlideId) return
    const state = useEditorStore.getState()
    const sections = presentation.sections.map((sec) => ({
      ...sec,
      slides: sec.slides.filter((sl) => sl.id !== selectedSlideId),
    }))
    state.setPresentation({ ...presentation, sections })
    state.setDirty(true)
    state.setSelectedSlide(null, null)
  }

  return (
    <div
      data-tour="editor-toolbar"
      className="flex items-center px-2 h-9 shrink-0 gap-0.5"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <ToolbarBtn icon={Plus} label="New Slide" shortcut="⌘M" onClick={handleNewSlide} disabled={!hasPresentation} />
      <ToolbarBtn icon={Copy} label="Duplicate Slide" onClick={handleDuplicate} disabled={!hasSlide} />
      <ToolbarBtn icon={Trash2} label="Delete Slide" onClick={handleDelete} disabled={!hasSlide} />

      <Separator />

      <ToolbarBtn icon={Music} label="Song Library" onClick={() => setSongLibraryOpen(true)} />
      <ToolbarBtn icon={Image} label="Media Library" onClick={() => setMediaLibraryOpen(true)} />
      <ToolbarBtn icon={Square} label="Insert Blank Slide" onClick={handleNewSlide} disabled={!hasPresentation} />

      <Separator />

      <button
        data-tour="present-button"
        onClick={onPresent}
        title="Present (F5)"
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ml-1"
        style={{
          background: isPresenting ? 'var(--live)' : 'var(--accent)',
          color: '#ffffff',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isPresenting ? '#15803d' : 'var(--accent-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isPresenting ? 'var(--live)' : 'var(--accent)'
        }}
      >
        <Play size={13} />
        {isPresenting ? 'Stop' : 'Present'}
      </button>
    </div>
  )
}
