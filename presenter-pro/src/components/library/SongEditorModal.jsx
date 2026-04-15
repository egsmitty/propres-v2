import React, { useState, useEffect } from 'react'
import { X, ArrowRight, Trash2, GripVertical } from 'lucide-react'
import { parseSlides } from '@/utils/slideParser'
import { createSong, updateSong } from '@/utils/ipc'
import { uuid } from '@/utils/uuid'

const TYPES = ['verse', 'chorus', 'bridge', 'intro', 'outro', 'custom']

export default function SongEditorModal({ song, onClose, onSave }) {
  const [title, setTitle] = useState(song?.title || '')
  const [artist, setArtist] = useState(song?.artist || '')
  const [ccli, setCcli] = useState(song?.ccli || '')
  const [lyrics, setLyrics] = useState('')
  const [slides, setSlides] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (song) {
      try {
        const parsed = typeof song.slides === 'string' ? JSON.parse(song.slides) : song.slides
        setSlides(parsed || [])
      } catch {}
    }
  }, [song])

  function handleParse() {
    if (!lyrics.trim()) return
    setSlides(parseSlides(lyrics))
  }

  function updateSlide(id, field, value) {
    setSlides((prev) =>
      prev.map((sl) => (sl.id === id ? { ...sl, [field]: value } : sl))
    )
  }

  function removeSlide(id) {
    setSlides((prev) => prev.filter((sl) => sl.id !== id))
  }

  function addBlankSlide() {
    setSlides((prev) => [
      ...prev,
      {
        id: uuid(),
        type: 'verse',
        label: 'New Slide',
        body: '',
        notes: '',
        backgroundId: null,
        textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
      }
    ])
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const data = { title, artist, ccli, slides: JSON.stringify(slides) }
    if (song?.id) {
      await updateSong(song.id, data)
    } else {
      await createSong(data)
    }
    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '80vw',
          height: '80vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {song ? 'Edit Song' : 'New Song'}
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — input */}
          <div
            className="flex flex-col gap-3 p-4 overflow-y-auto"
            style={{ width: '45%', borderRight: '1px solid var(--border-subtle)' }}
          >
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
                className="w-full px-2.5 py-1.5 rounded text-sm outline-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Artist
                </label>
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                />
              </div>
              <div style={{ width: 100 }}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  CCLI #
                </label>
                <input
                  value={ccli}
                  onChange={(e) => setCcli(e.target.value)}
                  placeholder="CCLI"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Lyrics
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste or type song lyrics&#10;&#10;Separate slides with a blank line. Label verses with 'Verse 1', 'Chorus', 'Bridge', etc."
                className="flex-1 px-2.5 py-2 rounded text-xs outline-none resize-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  minHeight: 200,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Separate slides with a blank line. Label with "Verse 1", "Chorus", "Bridge", etc.
              </p>
              <button
                onClick={handleParse}
                disabled={!lyrics.trim()}
                className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded text-xs font-medium self-start"
                style={{
                  background: lyrics.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                  color: lyrics.trim() ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                Parse Slides
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Right — preview */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div
              className="px-4 py-2 shrink-0 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {slides.length} slide{slides.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={addBlankSlide}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: 'var(--accent)' }}
              >
                + Add slide
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {slides.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Paste lyrics and click "Parse Slides" to see a preview
                  </p>
                </div>
              ) : (
                slides.map((sl) => (
                  <SlidePreviewCard
                    key={sl.id}
                    slide={sl}
                    onChange={(f, v) => updateSlide(sl.id, f, v)}
                    onRemove={() => removeSlide(sl.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{
              background: title.trim() ? 'var(--accent)' : 'var(--bg-hover)',
              color: title.trim() ? '#fff' : 'var(--text-tertiary)',
            }}
          >
            {saving ? 'Saving…' : 'Save to Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlidePreviewCard({ slide, onChange, onRemove }) {
  return (
    <div
      className="flex gap-2 rounded p-2"
      style={{
        background: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Dark preview */}
      <div
        className="shrink-0 flex items-center justify-center rounded overflow-hidden"
        style={{
          width: 80,
          aspectRatio: '16/9',
          background: '#1a1a1a',
          fontSize: 6,
          color: '#fff',
          padding: 4,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.3,
        }}
      >
        {slide.body}
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <select
            value={slide.type}
            onChange={(e) => onChange('type', e.target.value)}
            className="text-xs px-1.5 py-0.5 rounded outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <input
            value={slide.label}
            onChange={(e) => onChange('label', e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded text-xs outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            placeholder="Label"
          />
        </div>
        <textarea
          value={slide.body}
          onChange={(e) => onChange('body', e.target.value)}
          className="flex-1 px-1.5 py-1 rounded text-xs outline-none resize-none"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            minHeight: 48,
          }}
        />
      </div>

      <button
        onClick={onRemove}
        className="shrink-0 self-start mt-0.5 flex items-center justify-center w-5 h-5 rounded"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--danger-dim)'
          e.currentTarget.style.color = 'var(--danger)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-tertiary)'
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
