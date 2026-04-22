import React, { useState } from 'react'
import { Film, Image } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { usePresenterStore } from '@/store/presenterStore'
import ContextMenu from '@/components/shared/ContextMenu'
import ScaledSlideText from '@/components/shared/ScaledSlideText'
import { isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import { importMediaToSelectedSlide } from '@/utils/presentationCommands'
import { alertDialog, showDialog } from '@/utils/dialog'

export default function FilmstripSlide({ slide, index, selected, isMultiSelected, onSelect, onNewSlide, onDoubleClick, onDuplicate, onDelete, onEditSong, onApplyTheme }) {
  const presentation = useEditorStore((s) => s.presentation)
  const moveSlideToSection = useEditorStore((s) => s.moveSlideToSection)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)
  const isLive = liveSlideId === slide.id
  const [menu, setMenu] = useState(null)
  const mediaOnly = isMediaSlide(slide)

  function handleContextMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.({ metaKey: false, ctrlKey: false, shiftKey: false })
    setMenu({ x: e.clientX, y: e.clientY })
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
    ...(onApplyTheme ? [{ label: 'Apply Theme to Selection', onClick: onApplyTheme }, { divider: true }] : []),
    { label: 'Edit', onClick: onDoubleClick },
    { label: 'New Slide', onClick: onNewSlide },
    { label: 'Insert Image…', onClick: () => importMediaToSelectedSlide('image') },
    { label: 'Insert Video…', onClick: () => importMediaToSelectedSlide('video') },
    { label: 'Set Background', onClick: () => setMediaLibraryOpen(true) },
    { label: 'Move to Section…', onClick: handleMoveToSection },
    { divider: true },
    { label: 'Duplicate', onClick: onDuplicate },
    { divider: true },
    { label: 'Delete', danger: true, onClick: onDelete },
  ]

  return (
    <>
      <div
        onClick={(e) => onSelect(e)}
        onDoubleClick={onDoubleClick}
        onContextMenu={handleContextMenu}
        className="mx-2 mb-1 rounded cursor-pointer relative overflow-hidden"
        style={{
          aspectRatio: getPresentationAspectRatio(presentation),
          padding: 2,
          background: selected ? 'var(--bg-selected)' : isMultiSelected ? 'rgba(74,124,255,0.08)' : 'transparent',
        }}
      >
        <div
          className="w-full h-full rounded flex items-center justify-center relative overflow-hidden"
          style={{
            background: '#1a1a1a',
            border: isLive
              ? '2px solid var(--live)'
              : selected
              ? '2px solid var(--accent)'
              : isMultiSelected
              ? '2px solid rgba(74,124,255,0.55)'
              : '1px solid #333',
          }}
        >
          <span
            className="absolute top-0.5 left-1 leading-none"
            style={{ color: 'var(--text-tertiary)', fontSize: 8, fontFamily: 'monospace' }}
          >
            {index}
          </span>

          <div
            className="w-full h-full"
          >
            {mediaOnly ? (
              <div className="flex flex-col items-center justify-center gap-1" style={{ color: '#d1d5db' }}>
                <Film size={16} />
                <div className="truncate">{slide.label || 'Media'}</div>
              </div>
            ) : (
              <ScaledSlideText
                presentation={presentation}
                slide={slide}
                empty="Click to edit"
                shadow="none"
                basePaddingX={96}
                basePaddingY={80}
                minPaddingX={6}
                minPaddingY={6}
              />
            )}
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

        <div
          className="text-center mt-0.5 truncate"
          style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}
        >
          {slide.label || slide.type}
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
