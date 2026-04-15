import React, { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Image } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import ContextMenu from '@/components/shared/ContextMenu'
import { getSectionTypeLabel, normalizeSectionType } from '@/utils/sectionTypes'

export default function SectionHeader({ section, collapsed, onToggle, onAddSlide, onRemove }) {
  const [menu, setMenu] = useState(null)
  const updateSectionMeta = useEditorStore((s) => s.updateSectionMeta)

  function handleContextMenu(e) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  function handleEditSection() {
    const title = window.prompt('Section title:', section.title)?.trim()
    if (!title) return
    updateSectionMeta(section.id, { title })
  }

  function handleChangeColor() {
    const color = window.prompt('Section color (hex):', section.color || '#4a7cff')?.trim()
    if (!color) return
    updateSectionMeta(section.id, { color })
  }

  function handleChangeType() {
    const nextType = window.prompt(
      'Section type: song, announcement, or sermon',
      normalizeSectionType(section.type)
    )?.trim()
    if (!nextType) return
    const normalizedType = normalizeSectionType(nextType.toLowerCase())
    updateSectionMeta(section.id, { type: normalizedType })
  }

  const menuItems = [
    { label: 'Edit Section', onClick: handleEditSection },
    { label: 'Change Section Type', onClick: handleChangeType },
    { label: 'Change Color', onClick: handleChangeColor },
    { divider: true },
    { label: 'Add Slide', onClick: onAddSlide },
    { divider: true },
    { label: 'Remove Section', danger: true, onClick: onRemove },
  ]

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className="flex items-center min-h-10 px-2 py-1 relative group"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          borderLeft: `3px solid ${section.color || 'var(--section-1)'}`,
        }}
      >
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-4 h-4 shrink-0 mr-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-wide mb-0.5"
            style={{ color: 'var(--accent)' }}
            title={getSectionTypeLabel(section.type)}
          >
            {getSectionTypeLabel(section.type)}
          </div>
          <div
            className="text-xs font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
            title={section.title}
          >
            {section.title}
          </div>
        </div>

        {section.backgroundId && (
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full mr-1"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
            title="Section background set"
          >
            <Image size={10} />
          </span>
        )}

        <span className="text-xs mr-1" style={{ color: 'var(--text-tertiary)' }}>
          {section.slides.length}
        </span>

        <button
          onClick={onAddSlide}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-4 h-4 rounded"
          style={{ color: 'var(--text-tertiary)' }}
          title="Add slide to this section"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <Plus size={11} />
        </button>
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
