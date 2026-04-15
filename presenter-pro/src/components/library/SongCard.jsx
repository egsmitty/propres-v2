import React from 'react'
import { useEditorStore } from '@/store/editorStore'
import { deleteSong } from '@/utils/ipc'
import { uuid } from '@/utils/uuid'

const SECTION_COLORS = [
  'var(--section-1)',
  'var(--section-2)',
  'var(--section-3)',
  'var(--section-4)',
  'var(--section-5)',
]

export default function SongCard({ song, onEdit, onRefresh }) {
  const addSection = useEditorStore((s) => s.addSection)
  const presentation = useEditorStore((s) => s.presentation)

  let slides = []
  try {
    slides = typeof song.slides === 'string' ? JSON.parse(song.slides) : song.slides
  } catch {}

  function handleInsert() {
    if (!presentation) return
    const colorIdx = presentation.sections.length % SECTION_COLORS.length
    const newSection = {
      id: uuid(),
      title: song.title,
      type: 'song',
      color: SECTION_COLORS[colorIdx],
      collapsed: false,
      slides: slides.map((sl) => ({ ...sl, id: uuid() })),
      backgroundId: null,
    }
    addSection(newSection)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${song.title}" from library?`)) return
    await deleteSong(song.id)
    onRefresh()
  }

  return (
    <div
      className="flex items-center px-3 py-2 group"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
        className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-xs font-medium shrink-0"
        style={{ background: 'var(--accent)', color: '#fff' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
      >
        Insert
      </button>
    </div>
  )
}
