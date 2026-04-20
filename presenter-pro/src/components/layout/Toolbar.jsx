import React from 'react'
import { Plus, Copy, Trash2, Music, Image, FileText, BookOpen, Play, Type } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { uuid } from '@/utils/uuid'
import {
  insertNewSectionIntoCurrentPresentation,
  insertNewSlideIntoCurrentPresentation,
} from '@/utils/presentationCommands'

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

export default function Toolbar({ onPresent, onTogglePanel, presenterPanelOpen }) {
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const songLibraryOpen = useAppStore((s) => s.songLibraryOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const addSlideTextBox = useEditorStore((s) => s.addSlideTextBox)
  const isPresenting = usePresenterStore((s) => s.isPresenting)

  const hasPresentation = !!presentation
  const hasSlide = !!selectedSlideId
  const panelOpen = songLibraryOpen || mediaLibraryOpen

  function handleNewSlide() {
    insertNewSlideIntoCurrentPresentation()
  }

  function handleDuplicate() {
    if (!presentation || !selectedSlideId) return
    useEditorStore.getState().mutateSections((sections) =>
      sections.map((sec) => {
        const idx = sec.slides.findIndex((sl) => sl.id === selectedSlideId)
        if (idx === -1) return sec
        const copy = { ...sec.slides[idx], id: uuid() }
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, copy)
        return { ...sec, slides }
      })
    )
  }

  function handleDelete() {
    if (!presentation || !selectedSlideId) return
    const state = useEditorStore.getState()
    state.mutateSections((sections) =>
      sections.map((sec) => ({
        ...sec,
        slides: sec.slides.filter((sl) => sl.id !== selectedSlideId),
      }))
    )
    const nextPresentation = useEditorStore.getState().presentation
    const nextSection = nextPresentation?.sections?.find((section) => section.slides?.length)
    const nextSlide = nextSection?.slides?.[0]
    state.setSelectedSlide(nextSection?.id ?? null, nextSlide?.id ?? null)
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
      <ToolbarBtn icon={Plus} label="New Slide" shortcut="⌘M" onClick={handleNewSlide} disabled={!hasPresentation || panelOpen} />
      <ToolbarBtn icon={Copy} label="Duplicate Slide" onClick={handleDuplicate} disabled={!hasSlide || panelOpen} />
      <ToolbarBtn icon={Trash2} label="Delete Slide" onClick={handleDelete} disabled={!hasSlide || panelOpen} />
      <ToolbarBtn icon={Type} label="Add Text Box" onClick={() => addSlideTextBox(selectedSectionId, selectedSlideId)} disabled={!hasSlide || panelOpen} />

      <Separator />

      <ToolbarBtn
        icon={Music}
        label="Song Library"
        onClick={() => {
          setMediaLibraryOpen(false)
          setSongLibraryOpen(!songLibraryOpen)
        }}
      />
      <ToolbarBtn icon={FileText} label="Add Announcement Section" onClick={() => insertNewSectionIntoCurrentPresentation('announcement')} disabled={!hasPresentation || panelOpen} />
      <ToolbarBtn icon={BookOpen} label="Add Sermon Section" onClick={() => insertNewSectionIntoCurrentPresentation('sermon')} disabled={!hasPresentation || panelOpen} />
      <ToolbarBtn
        icon={Image}
        label="Media Library"
        onClick={() => {
          setSongLibraryOpen(false)
          setMediaLibraryOpen(!mediaLibraryOpen)
        }}
      />

      <Separator />

      <button
        data-tour="present-button"
        onClick={onPresent}
        title="Present (F5)"
        disabled={panelOpen}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ml-1"
        style={{
          background: panelOpen ? 'var(--border-default)' : isPresenting ? 'var(--live)' : 'var(--accent)',
          color: '#ffffff',
          cursor: panelOpen ? 'default' : 'pointer',
          opacity: panelOpen ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (panelOpen) return
          e.currentTarget.style.background = isPresenting ? '#15803d' : 'var(--accent-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = panelOpen ? 'var(--border-default)' : isPresenting ? 'var(--live)' : 'var(--accent)'
        }}
      >
        <Play size={13} />
        {isPresenting ? 'Stop' : 'Present'}
      </button>

      {onTogglePanel && (
        <button
          onClick={onTogglePanel}
          title="Toggle Presenter Panel"
          className="flex items-center gap-1 px-2 py-1 rounded text-xs ml-1"
          style={{
            background: presenterPanelOpen ? 'var(--bg-hover)' : 'transparent',
            color: presenterPanelOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = presenterPanelOpen ? 'var(--bg-hover)' : 'transparent'
            e.currentTarget.style.color = presenterPanelOpen ? 'var(--text-primary)' : 'var(--text-secondary)'
          }}
        >
          ⊞ Presenter
        </button>
      )}
    </div>
  )
}
