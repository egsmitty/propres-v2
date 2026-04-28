import React, { useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { deleteSong } from '@/utils/ipc'
import { createSection } from '@/utils/sectionTypes'
import { confirmDialog } from '@/utils/dialog'
import ContextMenu from '@/components/shared/ContextMenu'
import { flattenSongGroupsToSlides, getOrderedSongSlides, getSongGroupsAndArrangement } from '@/utils/songSections'
import { insertSectionAfterCurrentSelection } from '@/utils/presentationCommands'

function resolveOrderedSlides(song) {
  return getOrderedSongSlides(song)
}

export default function SongCard({ song, onEdit, onInsert, onRefresh }) {
  const addSection = useEditorStore((s) => s.addSection)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)
  const presentation = useEditorStore((s) => s.presentation)
  const [isInserting, setIsInserting] = useState(false)

  const slides = resolveOrderedSlides(song)
  const [menu, setMenu] = useState(null)

  async function handleInsert() {
    if (!presentation || isInserting) return
    setIsInserting(true)
    try {
      const { groups, arrangement } = getSongGroupsAndArrangement(song)
      const flattened = flattenSongGroupsToSlides(groups, arrangement, {
        regenerateSlideIds: true,
        regenerateGroupIds: true,
        songId: song.id,
      })
      const newSection = createSection('song', presentation.sections.length, {
        title: song.title,
        songId: song.id,
        songGroups: flattened.groups,
        songOrder: flattened.arrangement,
        slides: flattened.slides,
      })
      insertSectionAfterCurrentSelection(newSection)
      await Promise.resolve(onInsert?.(newSection))
    } finally {
      setIsInserting(false)
    }
  }

  async function handleDelete() {
    const ok = await confirmDialog(`Delete "${song.title}" from library?`, {
      title: 'Delete Song',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteSong(song.id)
    onRefresh()
  }

  const menuItems = [
    { label: 'Edit Song', onClick: onEdit },
    { divider: true },
    { label: 'Delete Song', danger: true, onClick: handleDelete },
  ]

  return (
    <>
    <div
      className="flex items-center px-3 py-2 group"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {song.title}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {song.artist || 'Unknown artist'}
        </p>
      </div>

      <span
        className="text-xs mx-2 shrink-0"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {slides.length} slides
      </span>

      {/* Insert button — visible on hover */}
      <button
        onClick={handleInsert}
        disabled={isInserting || !presentation}
        className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-xs font-medium shrink-0"
        style={{
          background: isInserting || !presentation ? 'var(--border-default)' : 'var(--accent)',
          color: '#fff',
          cursor: isInserting || !presentation ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isInserting && presentation) e.currentTarget.style.background = 'var(--accent-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isInserting || !presentation
            ? 'var(--border-default)'
            : 'var(--accent)'
        }}
      >
        {isInserting ? 'Inserted' : 'Insert'}
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
