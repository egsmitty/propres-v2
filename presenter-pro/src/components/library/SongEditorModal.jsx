import React, { useState, useEffect } from 'react'
import { X, ArrowRight, Trash2, GripVertical } from 'lucide-react'
import { parseSlides } from '@/utils/slideParser'
import { createSong, updateSong } from '@/utils/ipc'
import { uuid } from '@/utils/uuid'
import { SECTION_TYPES, createTextSlide, getSectionColor } from '@/utils/sectionTypes'

function parseSongOrder(song) {
  try {
    const rawOrder = song?.songOrder ?? song?.song_order
    const parsed = typeof rawOrder === 'string' ? JSON.parse(rawOrder) : rawOrder
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function ensureOrderMatchesSlides(slides, order) {
  const validIds = new Set(slides.map((slide) => slide.id))
  const filtered = Array.isArray(order) ? order.filter((id) => validIds.has(id)) : []
  return filtered.length ? filtered : slides.map((slide) => slide.id)
}

function getSlideChipLabel(slide) {
  if (!slide) return 'Missing'
  return slide.label || SECTION_TYPES.find((item) => item.id === slide.type)?.label || 'Slide'
}

export default function SongEditorModal({ song, onClose, onSave }) {
  const [title, setTitle] = useState(song?.title || '')
  const [artist, setArtist] = useState(song?.artist || '')
  const [ccli, setCcli] = useState(song?.ccli || '')
  const [lyrics, setLyrics] = useState('')
  const [slides, setSlides] = useState([])
  const [songOrder, setSongOrder] = useState([])
  const [dragState, setDragState] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (song) {
      try {
        const parsed = typeof song.slides === 'string' ? JSON.parse(song.slides) : song.slides
        setSlides(parsed || [])
        setSongOrder(ensureOrderMatchesSlides(parsed || [], parseSongOrder(song)))
      } catch {}
    }
  }, [song])

  function handleParse() {
    if (!lyrics.trim()) return
    const parsed = parseSlides(lyrics)
    setSlides(parsed)
    setSongOrder(parsed.map((slide) => slide.id))
  }

  function updateSlide(id, field, value) {
    setSlides((prev) => {
      const next = prev.map((sl) => {
        if (sl.id !== id) return sl
        if (field === 'type') {
          const nextType = value
          const nextLabel = nextType === 'custom'
            ? sl.label
            : SECTION_TYPES.find((item) => item.id === nextType)?.label || sl.label
          return { ...sl, type: nextType, label: nextLabel }
        }
        return { ...sl, [field]: value }
      })
      setSongOrder((current) => ensureOrderMatchesSlides(next, current))
      return next
    })
  }

  function removeSlide(id) {
    setSlides((prev) => {
      const next = prev.filter((sl) => sl.id !== id)
      setSongOrder((current) => ensureOrderMatchesSlides(next, current.filter((entry) => entry !== id)))
      return next
    })
  }

  function addBlankSlide() {
    const slide = createTextSlide('song', {
      id: uuid(),
      type: 'verse',
      label: 'Verse',
      body: '',
    })
    setSlides((prev) => [...prev, slide])
    setSongOrder((prev) => [...prev, slide.id])
  }

  function moveSongOrder(fromIndex, toIndex) {
    setSongOrder((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex > prev.length) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      next.splice(insertIndex, 0, moved)
      return next
    })
  }

  function insertIntoSongOrder(slideId, index) {
    setSongOrder((prev) => {
      const next = [...prev]
      next.splice(index, 0, slideId)
      return next
    })
  }

  function handleDragStart(payload) {
    setDragState(payload)
  }

  function handleOrderDrop(index) {
    if (!dragState) return
    if (dragState.kind === 'order') {
      moveSongOrder(dragState.index, index)
    } else if (dragState.kind === 'source') {
      insertIntoSongOrder(dragState.slideId, index)
    }
    setDragState(null)
  }

  const orderSlides = songOrder
    .map((slideId, index) => ({
      index,
      slideId,
      slide: slides.find((item) => item.id === slideId) || null,
    }))
    .filter((entry) => entry.slide)

  const availableSlides = slides.map((slide) => ({ id: slide.id, label: getSlideChipLabel(slide), color: getSectionColor(slide.type) }))

  function removeOrderEntry(index) {
    setSongOrder((prev) => prev.filter((_, entryIndex) => entryIndex !== index))
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const normalizedOrder = ensureOrderMatchesSlides(slides, songOrder)
    const data = {
      title,
      artist,
      ccli,
      slides: JSON.stringify(slides),
      songOrder: JSON.stringify(normalizedOrder),
    }
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

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              {slides.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Paste lyrics and click "Parse Slides" to see a preview
                  </p>
                </div>
              ) : (
                <>
                  {slides.map((sl) => (
                    <SlidePreviewCard
                      key={sl.id}
                      slide={sl}
                      onChange={(f, v) => updateSlide(sl.id, f, v)}
                      onRemove={() => removeSlide(sl.id)}
                    />
                  ))}

                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          Song Order
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Drag section chips into the order you want when this song is inserted.
                        </p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Available Sections
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableSlides.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            draggable
                            onDragStart={() => handleDragStart({ kind: 'source', slideId: item.id })}
                            onDragEnd={() => setDragState(null)}
                            onClick={() => setSongOrder((prev) => [...prev, item.id])}
                            className="text-xs px-2 py-1 rounded-full"
                            style={{
                              background: `${item.color}22`,
                              border: `1px solid ${item.color}55`,
                              color: 'var(--text-primary)',
                              cursor: 'grab',
                            }}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Summary
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {orderSlides.length ? orderSlides.map((entry, index) => (
                          <React.Fragment key={`${entry.slideId}-${index}`}>
                            {index > 0 && (
                              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                →
                              </span>
                            )}
                            <span
                              className="text-xs px-2 py-1 rounded-full"
                              style={{
                                background: `${getSectionColor(entry.slide.type)}22`,
                                border: `1px solid ${getSectionColor(entry.slide.type)}55`,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {getSlideChipLabel(entry.slide)}
                            </span>
                          </React.Fragment>
                        )) : (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Add at least one section chip to define a custom order.
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Ordered Chips
                      </p>
                      <div
                        className="rounded-md p-2 min-h-16"
                        style={{ border: '1px dashed var(--border-default)', background: 'var(--bg-surface)' }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleOrderDrop(orderSlides.length)}
                      >
                        <div className="flex flex-wrap gap-2">
                          {orderSlides.map((entry, index) => (
                            <div
                              key={`${entry.slideId}-${index}-chip`}
                              className="flex items-center gap-1 rounded-full px-2 py-1"
                              draggable
                              onDragStart={() => handleDragStart({ kind: 'order', index })}
                              onDragEnd={() => setDragState(null)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleOrderDrop(index)
                              }}
                              style={{
                                background: `${getSectionColor(entry.slide.type)}22`,
                                border: `1px solid ${getSectionColor(entry.slide.type)}55`,
                                color: 'var(--text-primary)',
                                cursor: 'grab',
                              }}
                            >
                              <GripVertical size={12} style={{ color: 'var(--text-tertiary)' }} />
                              <span className="text-xs">{getSlideChipLabel(entry.slide)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeOrderEntry(index)
                                }}
                                className="text-xs"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
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
      className="flex rounded overflow-hidden"
      style={{
        background: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Color badge — left edge */}
      <div
        className="shrink-0"
        style={{ width: 4, background: getSectionColor(slide.type) }}
      />

      <div className="flex flex-1 gap-2 p-2">
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
          <div className="flex gap-1.5 flex-wrap">
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
              {SECTION_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {slide.type === 'custom' ? (
              <input
                value={slide.label}
                onChange={(e) => onChange('label', e.target.value)}
                maxLength={30}
                className="flex-1 px-1.5 py-0.5 rounded text-xs outline-none"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Label name..."
              />
            ) : (
              <span
                className="flex items-center text-xs px-1.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {slide.label}
              </span>
            )}
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
    </div>
  )
}
