import React, { useState, useEffect } from 'react'
import { X, Search, Music, Plus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { getSongs } from '@/utils/ipc'
import SongCard from './SongCard'
import SongEditorModal from './SongEditorModal'

export default function SongLibraryPanel() {
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen)
  const [songs, setSongs] = useState([])
  const [query, setQuery] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editSong, setEditSong] = useState(null)

  useEffect(() => {
    loadSongs()
  }, [])

  async function loadSongs() {
    const result = await getSongs()
    if (result?.success) setSongs(result.data)
  }

  function handleInsert() {
    setSongLibraryOpen(false)
  }

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      (s.artist || '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <>
      <div
        className="absolute left-0 top-0 h-full z-30 flex flex-col shadow-xl"
        style={{
          width: 320,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-default)',
          animation: 'slide-in-left 150ms ease',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Music size={14} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Song Library
            </span>
          </div>
          <button
            onClick={() => setSongLibraryOpen(false)}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            className="flex items-center gap-2 px-2 py-1 rounded"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
          >
            <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs…"
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Music size={24} style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {query ? 'No songs found' : 'No songs in library'}
              </p>
            </div>
          ) : (
            filtered.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                onInsert={handleInsert}
                onEdit={() => {
                  setEditSong(song)
                  setShowEditor(true)
                }}
                onRefresh={loadSongs}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="px-3 py-2 shrink-0"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={() => { setEditSong(null); setShowEditor(true) }}
            className="flex items-center gap-1.5 w-full justify-center py-1.5 rounded text-xs font-medium"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          >
            <Plus size={13} />
            New Song
          </button>
        </div>
      </div>

      {showEditor && (
        <SongEditorModal
          song={editSong}
          onClose={() => { setShowEditor(false); setEditSong(null) }}
          onSave={loadSongs}
        />
      )}
    </>
  )
}
