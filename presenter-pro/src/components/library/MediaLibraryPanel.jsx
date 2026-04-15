import React, { useState, useEffect } from 'react'
import { X, Image, Upload, Film } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { getMedia, importMedia } from '@/utils/ipc'
import { fileUrlForPath, isVideoMedia } from '@/utils/backgrounds'

export default function MediaLibraryPanel() {
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const setSlideBackground = useEditorStore((s) => s.setSlideBackground)
  const setPresentationBackground = useEditorStore((s) => s.setPresentationBackground)
  const [media, setMedia] = useState([])
  const [tab, setTab] = useState('images')

  useEffect(() => {
    loadMedia()
  }, [])

  async function loadMedia() {
    const result = await getMedia()
    if (result?.success) setMedia(result.data)
  }

  async function handleImport() {
    const result = await importMedia()
    if (result?.success) loadMedia()
  }

  function applyToSlide(mediaId) {
    if (!selectedSectionId || !selectedSlideId) return
    setSlideBackground(selectedSectionId, selectedSlideId, mediaId)
  }

  function applyToPresentation(mediaId) {
    if (!presentation) return
    setPresentationBackground(mediaId)
  }

  const filtered = media.filter((m) =>
    tab === 'images' ? m.type === 'image' : m.type === 'video'
  )

  return (
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
          <Image size={14} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Media Library
          </span>
        </div>
        <button
          onClick={() => setMediaLibraryOpen(false)}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {['images', 'videos'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 text-xs capitalize"
            style={{
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t ? 500 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Media grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            {tab === 'images'
              ? <Image size={24} style={{ color: 'var(--text-tertiary)' }} />
              : <Film size={24} style={{ color: 'var(--text-tertiary)' }} />}
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No {tab} imported yet
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded overflow-hidden group"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ aspectRatio: '16/9' }} className="relative overflow-hidden">
                  <MediaPreview item={item} />
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 gap-1"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.15))' }}
                  >
                    <button
                      onClick={() => applyToSlide(item.id)}
                      disabled={!selectedSlideId}
                      className="w-full rounded px-2 py-1 text-[11px] font-medium"
                      style={{
                        background: selectedSlideId ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        cursor: selectedSlideId ? 'pointer' : 'default',
                      }}
                    >
                      Set Slide Background
                    </button>
                    <button
                      onClick={() => applyToPresentation(item.id)}
                      disabled={!presentation}
                      className="w-full rounded px-2 py-1 text-[11px] font-medium"
                      style={{
                        background: presentation ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        cursor: presentation ? 'pointer' : 'default',
                      }}
                    >
                      Set Presentation Background
                    </button>
                  </div>
                </div>
                <div
                  className="px-2 py-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[11px] font-medium truncate" style={{ color: '#f3f4f6' }}>
                    {item.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                    {item.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-2 shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={handleImport}
          className="flex items-center gap-1.5 w-full justify-center py-1.5 rounded text-xs font-medium"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
        >
          <Upload size={13} />
          Import Media…
        </button>
      </div>
    </div>
  )
}

function MediaPreview({ item }) {
  const src = fileUrlForPath(item.thumbnail_path || item.file_path)

  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Image size={20} style={{ color: '#555' }} />
      </div>
    )
  }

  if (isVideoMedia(item)) {
    return (
      <video
        src={src}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return (
    <img
      src={src}
      alt={item.name}
      className="w-full h-full object-cover"
    />
  )
}
