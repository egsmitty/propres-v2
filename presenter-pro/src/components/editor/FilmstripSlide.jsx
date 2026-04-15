import React, { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { usePresenterStore } from '@/store/presenterStore'
import ContextMenu from '@/components/shared/ContextMenu'

export default function FilmstripSlide({ slide, index, selected, onSelect, onDoubleClick, onDuplicate, onDelete }) {
  const presentation = useEditorStore((s) => s.presentation)
  const moveSlideToSection = useEditorStore((s) => s.moveSlideToSection)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)
  const isLive = liveSlideId === slide.id
  const [menu, setMenu] = useState(null)

  const lines = (slide.body || '').split('\n').filter(Boolean)
  const previewFontSize = Math.max(6, Math.min(12, Math.round((slide.textStyle?.size || 52) / 8)))

  function handleContextMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  function handleMoveToSection() {
    const sectionTitles = presentation?.sections?.map((section) => section.title).join(', ') || ''
    const targetTitle = window.prompt(`Move slide to section:\n${sectionTitles}`)?.trim()
    if (!targetTitle) return

    const targetSection = presentation?.sections?.find((section) => section.title === targetTitle)
    if (!targetSection) {
      window.alert('Section not found.')
      return
    }

    moveSlideToSection(slide.id, targetSection.id)
  }

  const menuItems = [
    { label: 'Edit', onClick: onDoubleClick },
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
            {lines.slice(0, 4).map((line, i) => (
              <div key={i} className="truncate">{line}</div>
            ))}
            {lines.length > 4 && <div style={{ color: '#666', fontSize: 6 }}>…</div>}
          </div>

          {isLive && (
            <div
              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--live)' }}
            />
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
