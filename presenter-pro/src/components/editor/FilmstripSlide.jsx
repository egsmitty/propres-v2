import React, { useState } from 'react'
import { Film, Image } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { usePresenterStore } from '@/store/presenterStore'
import ContextMenu from '@/components/shared/ContextMenu'
import SlidePreviewSurface from '@/components/shared/SlidePreviewSurface'
import { getSectionTypeLabel, isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import { importMediaToSelectedSlide } from '@/utils/presentationCommands'
import { alertDialog, showDialog } from '@/utils/dialog'

function isGenericLabel(label) {
  const normalized = String(label || '').trim().toLowerCase()
  return normalized === 'text' || normalized === 'lyrics' || normalized === 'notes'
}

export default function FilmstripSlide({ slide, sectionId = null, sectionType = 'announcement', mediaLibrary = [], index, selected, isMultiSelected, mediaDropHighlighted = false, onMediaDragOver, onMediaDrop, onSelect, onNewSlide, onDoubleClick, onDuplicate, onDelete, onEditSong, onApplyTheme }) {
  const presentation = useEditorStore((s) => s.presentation)
  const moveSlideToSection = useEditorStore((s) => s.moveSlideToSection)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen)
  const setNewSongEditorOpen = useAppStore((s) => s.setNewSongEditorOpen)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)
  const isLive = liveSlideId === slide.id
  const [menu, setMenu] = useState(null)
  const mediaOnly = isMediaSlide(slide)
  const multiOnly = isMultiSelected && !selected

  function handleContextMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!(selected || isMultiSelected)) {
      onSelect?.({ metaKey: false, ctrlKey: false, shiftKey: false })
    }
    setMenu({ x: e.clientX, y: e.clientY })
  }

  function openMediaLibrary() {
    setSongLibraryOpen(false)
    setNewSongEditorOpen(false)
    setMediaLibraryOpen(true)
  }

  async function handleMoveToSection() {
    const sections = presentation?.sections || []
    if (sections.length === 0) return
    if (sections.length === 1) {
      await alertDialog('There is only one section.', { title: 'Move Slide' })
      return
    }

    const result = await showDialog({
      title: 'Move Slide',
      description: 'Choose a target section:',
      fields: [
        {
          name: 'sectionId',
          label: 'Section',
          type: 'select',
          defaultValue: sections[0].id,
          options: sections.map((section) => ({ value: section.id, label: section.title })),
        },
      ],
      actions: [
        { label: 'Cancel', value: null, cancel: true },
        { label: 'Move', value: 'confirm', primary: true },
      ],
    })
    if (!result || result.action !== 'confirm') return

    moveSlideToSection(slide.id, result.values.sectionId)
  }

  const menuItems = [
    ...(onEditSong ? [{ label: 'Edit Song', onClick: onEditSong }] : []),
    ...(onApplyTheme ? [{ label: 'Style Slides…', onClick: () => window.setTimeout(() => onApplyTheme(), 0) }, { divider: true }] : []),
    { label: 'New Slide', onClick: onNewSlide },
    { label: 'Insert Image…', onClick: () => importMediaToSelectedSlide('image') },
    { label: 'Insert Video…', onClick: () => importMediaToSelectedSlide('video') },
    { label: 'Set Slide Background', onClick: () => openMediaLibrary() },
    { label: `Set ${getSectionTypeLabel(sectionType)} Background`, onClick: () => openMediaLibrary() },
    { label: 'Move to Section…', onClick: handleMoveToSection },
    { divider: true },
    { label: 'Duplicate', onClick: onDuplicate },
    { divider: true },
    { label: 'Delete', danger: true, onClick: onDelete },
  ]

  return (
    <>
      <div
        onDoubleClick={onDoubleClick}
        onContextMenu={handleContextMenu}
        onDragOver={onMediaDragOver}
        onDrop={onMediaDrop}
        className="mx-2 mb-2 rounded cursor-pointer relative overflow-visible"
        style={{
          aspectRatio: getPresentationAspectRatio(presentation),
          padding: 0,
          background: 'transparent',
          boxShadow: 'none',
        }}
      >
        <div
          className="w-full rounded flex items-center justify-center relative overflow-hidden"
          style={{
            aspectRatio: getPresentationAspectRatio(presentation),
            background: '#1a1a1a',
            border: isLive
              ? '2px solid var(--live)'
              : mediaDropHighlighted
              ? '3px solid rgba(74,124,255,0.95)'
              : selected
              ? '2px solid rgba(74,124,255,1)'
              : multiOnly
              ? '2px solid rgba(74,124,255,0.82)'
              : '1px solid #333',
            boxShadow: selected
              ? '0 0 0 1px rgba(255,255,255,0.14), 0 0 0 3px rgba(74,124,255,0.16)'
              : mediaDropHighlighted
                ? '0 0 0 1px rgba(255,255,255,0.14), 0 0 0 4px rgba(74,124,255,0.18)'
              : multiOnly
                ? '0 0 0 1px rgba(255,255,255,0.1), 0 0 0 2px rgba(74,124,255,0.12)'
                : 'none',
          }}
        >
          <span
            className="absolute top-0.5 left-1 leading-none"
            style={{ color: 'var(--text-tertiary)', fontSize: 8, fontFamily: 'monospace' }}
          >
            {index}
          </span>

          <div className="w-full h-full relative">
            <SlidePreviewSurface
              presentation={presentation}
              slide={slide}
              sectionId={sectionId}
              mediaLibrary={mediaLibrary}
              empty="Click to edit"
              shadow="none"
              showPlaceholder
              missingMediaLabel={slide.label || 'Media'}
            />
          </div>

          {isLive && (
            <div
              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--live)' }}
            />
          )}
          {!isLive && slide.backgroundId && (
            <div
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.48)', color: '#d1d5db' }}
              title="Slide background override"
            >
              <Image size={8} />
            </div>
          )}

        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
