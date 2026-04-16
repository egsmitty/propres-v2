import React, { useState } from 'react'
import { Film, Image } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { usePresenterStore } from '@/store/presenterStore'
import ContextMenu from '@/components/shared/ContextMenu'
import { isMediaSlide } from '@/utils/sectionTypes'
import { alertDialog, showDialog } from '@/utils/dialog'

export default function FilmstripSlide({ slide, index, selected, onSelect, onNewSlide, onDoubleClick, onDuplicate, onDelete }) {
  const presentation = useEditorStore((s) => s.presentation)
  const moveSlideToSection = useEditorStore((s) => s.moveSlideToSection)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)
  const isLive = liveSlideId === slide.id
  const [menu, setMenu] = useState(null)
  const mediaOnly = isMediaSlide(slide)

  const lines = mediaOnly ? [slide.label || 'Media'] : (slide.body || '').split('\n').filter(Boolean)
  const previewFontSize = Math.max(6, Math.min(12, Math.round((slide.textStyle?.size || 52) / 8)))

  function handleContextMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
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
    { label: 'Edit', onClick: onDoubleClick },
    { label: 'New Slide', onClick: onNewSlide },
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
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        onContextMenu={handleContextMenu}
        className="mx-2 mb-1 rounded cursor-pointer relative overflow-hidden"
        style={{
          aspectRatio: '16/9',
          padding: 2,
          background: selected ? 'var(--bg-selected)' : 'transparent',
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
            className="w-full px-1 text-center"
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: previewFontSize,
              color: slide.textStyle?.color || '#ffffff',
              fontWeight: slide.textStyle?.bold ? 700 : 400,
              lineHeight: 1.3,
              textAlign: slide.textStyle?.align || 'center',
            }}
          >
            {mediaOnly ? (
              <div className="flex flex-col items-center justify-center gap-1" style={{ color: '#d1d5db' }}>
                <Film size={16} />
                <div className="truncate">{slide.label || 'Media'}</div>
              </div>
            ) : (
              <>
                {lines.slice(0, 4).map((line, i) => (
                  <div key={i} className="truncate">{line}</div>
                ))}
                {lines.length > 4 && <div style={{ color: '#666', fontSize: 6 }}>…</div>}
              </>
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
