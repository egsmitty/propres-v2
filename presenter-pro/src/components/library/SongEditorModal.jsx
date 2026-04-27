import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { createSong, updateSong } from '@/utils/ipc'
import { SECTION_TYPES, getSectionColor } from '@/utils/sectionTypes'
import {
  createSongSectionGroup,
  flattenSongGroupsToSlides,
  getSongGroupsAndArrangement,
  makeSongGroupLabel,
  parseSongGroupsFromLyrics,
} from '@/utils/songSections'
import { uuid } from '@/utils/uuid'

function nextGroupLabel(type, groups) {
  const count = groups.filter((group) => group.type === type).length + 1
  return makeSongGroupLabel(type, '', count > 1 ? String(count) : '')
}

function groupsToLyrics(groups) {
  return groups
    .map((group) => {
      const header = group.label || makeSongGroupLabel(group.type)
      const slides = (group.slides || []).map((slide) => slide.body || '')
      return [header, ...slides].join('\n\n')
    })
    .join('\n\n')
}

function clampFocusCount(count) {
  return Math.max(0, count)
}

function getGroupSlideSelection(groups, arrangement, selectedGroupId, selectedSlideId) {
  const fallbackGroupId = arrangement.find((groupId) => groups.some((group) => group.id === groupId)) || groups[0]?.id || null
  const resolvedGroupId = groups.some((group) => group.id === selectedGroupId) ? selectedGroupId : fallbackGroupId
  const group = groups.find((entry) => entry.id === resolvedGroupId) || null
  const slide = group?.slides?.find((entry) => entry.id === selectedSlideId) || group?.slides?.[0] || null

  return {
    group,
    groupId: group?.id || null,
    slide,
    slideId: slide?.id || null,
  }
}

function updateGroupCollection(groups, groupId, updater) {
  return groups.map((group) => (group.id === groupId ? updater(group) : group))
}

function GroupChip({ label, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full"
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color: 'var(--text-primary)',
      }}
    >
      {label}
    </button>
  )
}

function ArrangementChip({ label, color, onRemove, onDragStart, onDragEnd, onDrop, index }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDrop(index)
      }}
      className="flex items-center gap-1 rounded-full px-2 py-1"
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color: 'var(--text-primary)',
        cursor: 'grab',
      }}
    >
      <GripVertical size={12} style={{ color: 'var(--text-tertiary)' }} />
      <span className="text-xs">{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
        className="text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        ×
      </button>
    </div>
  )
}

export default function SongEditorModal({ song, onClose, onSave }) {
  const [title, setTitle] = useState(song?.title || '')
  const [artist, setArtist] = useState(song?.artist || '')
  const [ccli, setCcli] = useState(song?.ccli || '')
  const [lyrics, setLyrics] = useState('')
  const [groups, setGroups] = useState([])
  const [arrangement, setArrangement] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [selectedSlideId, setSelectedSlideId] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lyricsFocusCount, setLyricsFocusCount] = useState(0)
  const [rawLyricsFocused, setRawLyricsFocused] = useState(false)
  const [rawLyricsDirty, setRawLyricsDirty] = useState(false)

  const editingLyrics = lyricsFocusCount > 0

  useEffect(() => {
    const { groups: nextGroups, arrangement: nextArrangement } = getSongGroupsAndArrangement(song)
    setGroups(nextGroups)
    setArrangement(nextArrangement)
    setLyrics(groupsToLyrics(nextGroups))
    setRawLyricsDirty(false)
    const selection = getGroupSlideSelection(nextGroups, nextArrangement, null, null)
    setSelectedGroupId(selection.groupId)
    setSelectedSlideId(selection.slideId)
  }, [song])

  useEffect(() => {
    if (rawLyricsFocused || rawLyricsDirty) return
    setLyrics(groupsToLyrics(groups))
  }, [groups, rawLyricsDirty, rawLyricsFocused])

  useEffect(() => {
    const selection = getGroupSlideSelection(groups, arrangement, selectedGroupId, selectedSlideId)
    if (selection.groupId !== selectedGroupId) setSelectedGroupId(selection.groupId)
    if (selection.slideId !== selectedSlideId) setSelectedSlideId(selection.slideId)
  }, [arrangement, groups, selectedGroupId, selectedSlideId])

  const selection = useMemo(
    () => getGroupSlideSelection(groups, arrangement, selectedGroupId, selectedSlideId),
    [arrangement, groups, selectedGroupId, selectedSlideId]
  )
  const selectedGroup = selection.group
  const selectedSlide = selection.slide

  const availableSections = useMemo(
    () => groups.map((group) => ({ id: group.id, label: group.label, color: getSectionColor(group.type) })),
    [groups]
  )

  const arrangementEntries = useMemo(
    () => arrangement.map((groupId, index) => {
      const group = groups.find((entry) => entry.id === groupId) || null
      return { groupId, index, group }
    }).filter((entry) => entry.group),
    [arrangement, groups]
  )

  function beginLyricsEditing() {
    setLyricsFocusCount((count) => count + 1)
  }

  function endLyricsEditing() {
    setLyricsFocusCount((count) => clampFocusCount(count - 1))
  }

  function handleParse() {
    if (!lyrics.trim()) return
    const nextGroups = parseSongGroupsFromLyrics(lyrics)
    const nextArrangement = nextGroups.map((group) => group.id)
    setGroups(nextGroups)
    setArrangement(nextArrangement)
    setLyrics(groupsToLyrics(nextGroups))
    setRawLyricsDirty(false)
    const nextSelection = getGroupSlideSelection(nextGroups, nextArrangement, null, null)
    setSelectedGroupId(nextSelection.groupId)
    setSelectedSlideId(nextSelection.slideId)
  }

  function selectSlide(groupId, slideId) {
    setSelectedGroupId(groupId)
    setSelectedSlideId(slideId)
  }

  function updateGroup(groupId, updater) {
    setGroups((current) => updateGroupCollection(current, groupId, updater))
  }

  function updateGroupType(groupId, type) {
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group
      const nextLabel = group.label === group.type || group.label === makeSongGroupLabel(group.type)
        ? nextGroupLabel(type, current.filter((entry) => entry.id !== groupId))
        : group.label
      return { ...group, type, label: nextLabel }
    }))
  }

  function updateSlideBody(groupId, slideId, body) {
    updateGroup(groupId, (group) => ({
      ...group,
      slides: group.slides.map((slide) => (slide.id === slideId ? { ...slide, body } : slide)),
    }))
  }

  function addGroup(type = 'verse') {
    const label = nextGroupLabel(type, groups)
    const group = createSongSectionGroup(type, label, [{ id: uuid(), body: '' }], uuid())
    setGroups((current) => [...current, group])
    setArrangement((current) => [...current, group.id])
    setSelectedGroupId(group.id)
    setSelectedSlideId(group.slides[0].id)
  }

  function removeGroup(groupId) {
    const remainingGroups = groups.filter((group) => group.id !== groupId)
    const remainingArrangement = arrangement.filter((entry) => entry !== groupId)
    setGroups(remainingGroups)
    setArrangement(remainingArrangement)
    const nextSelection = getGroupSlideSelection(remainingGroups, remainingArrangement, null, null)
    setSelectedGroupId(nextSelection.groupId)
    setSelectedSlideId(nextSelection.slideId)
  }

  function addSlideToGroup(groupId) {
    const slideId = uuid()
    updateGroup(groupId, (group) => ({
      ...group,
      slides: [...group.slides, { id: slideId, body: '' }],
    }))
    setSelectedGroupId(groupId)
    setSelectedSlideId(slideId)
  }

  function removeSlideFromGroup(groupId, slideId) {
    const group = groups.find((entry) => entry.id === groupId)
    if (!group) return
    if (group.slides.length <= 1) {
      removeGroup(groupId)
      return
    }

    updateGroup(groupId, (current) => ({
      ...current,
      slides: current.slides.filter((slide) => slide.id !== slideId),
    }))

    if (selectedSlideId === slideId) {
      const nextSlide = group.slides.find((slide) => slide.id !== slideId)
      setSelectedGroupId(groupId)
      setSelectedSlideId(nextSlide?.id || null)
    }
  }

  function moveArrangementEntry(fromIndex, toIndex) {
    setArrangement((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex > current.length) {
        return current
      }
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      next.splice(insertIndex, 0, moved)
      return next
    })
  }

  function insertIntoArrangement(groupId, index) {
    setArrangement((current) => {
      const next = [...current]
      next.splice(index, 0, groupId)
      return next
    })
  }

  function handleArrangementDrop(index) {
    if (!dragState) return
    if (dragState.kind === 'arrangement') {
      moveArrangementEntry(dragState.index, index)
    } else if (dragState.kind === 'available') {
      insertIntoArrangement(dragState.groupId, index)
    }
    setDragState(null)
  }

  function removeArrangementEntry(index) {
    setArrangement((current) => current.filter((_, entryIndex) => entryIndex !== index))
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const flattened = flattenSongGroupsToSlides(groups, arrangement)
    const data = {
      title,
      artist,
      ccli,
      slides: JSON.stringify(flattened.slides),
      songOrder: JSON.stringify(flattened.arrangement),
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
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '88vw',
          height: '84vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
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
            onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div
            className="flex flex-col gap-3 p-4 overflow-y-auto"
            style={{ width: '28%', borderRight: '1px solid var(--border-subtle)' }}
          >
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Title *
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Song title"
                className="w-full px-2.5 py-1.5 rounded text-sm outline-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Artist
                </label>
                <input
                  value={artist}
                  onChange={(event) => setArtist(event.target.value)}
                  placeholder="Artist name"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div style={{ width: 110 }}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  CCLI #
                </label>
                <input
                  value={ccli}
                  onChange={(event) => setCcli(event.target.value)}
                  placeholder="CCLI"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Raw Lyrics Import
                </label>
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!lyrics.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                  style={{
                    background: lyrics.trim() ? 'var(--accent)' : 'var(--bg-hover)',
                    color: lyrics.trim() ? '#fff' : 'var(--text-tertiary)',
                  }}
                >
                  Parse Song
                  <ArrowRight size={12} />
                </button>
              </div>
              <textarea
                value={lyrics}
                onChange={(event) => {
                  setLyrics(event.target.value)
                  setRawLyricsDirty(true)
                }}
                onFocus={() => {
                  setRawLyricsFocused(true)
                  beginLyricsEditing()
                }}
                onBlur={() => {
                  setRawLyricsFocused(false)
                  endLyricsEditing()
                }}
                placeholder="Paste or type song lyrics. Blank lines create a new slide inside the current section. A new section starts only when you label it as Verse, Chorus, Bridge, etc."
                className="flex-1 px-2.5 py-2 rounded text-xs outline-none resize-none"
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  minHeight: 240,
                }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                Blank lines create slides. Section labels like &quot;Verse 1&quot; or &quot;Chorus&quot; create a new section group.
              </p>
              <button
                type="button"
                onClick={() => addGroup('verse')}
                className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded text-xs font-medium self-start"
                style={{
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <Plus size={12} />
                Add Section Group
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {selectedGroup && selectedSlide ? (
              <div
                className="shrink-0 px-4 py-3"
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  opacity: editingLyrics ? 0.55 : 1,
                  pointerEvents: editingLyrics ? 'none' : 'auto',
                }}
              >
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      Song Order
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Add section groups to the arrangement above the preview.
                    </p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    Available Sections
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSections.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        draggable
                        onDragStart={() => setDragState({ kind: 'available', groupId: group.id })}
                        onDragEnd={() => setDragState(null)}
                        onClick={() => setArrangement((current) => [...current, group.id])}
                        className="text-xs px-2.5 py-1 rounded-full"
                        style={{
                          background: `${group.color}22`,
                          border: `1px solid ${group.color}55`,
                          color: 'var(--text-primary)',
                          cursor: 'grab',
                        }}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    Arrangement
                  </p>
                  <div
                    className="rounded-md p-2 min-h-16"
                    style={{ border: '1px dashed var(--border-default)', background: 'var(--bg-surface)' }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleArrangementDrop(arrangementEntries.length)}
                  >
                    <div className="flex flex-wrap gap-2">
                      {arrangementEntries.length ? arrangementEntries.map((entry) => (
                        <ArrangementChip
                          key={`${entry.groupId}-${entry.index}`}
                          index={entry.index}
                          label={entry.group.label}
                          color={getSectionColor(entry.group.type)}
                          onDragStart={() => setDragState({ kind: 'arrangement', index: entry.index })}
                          onDragEnd={() => setDragState(null)}
                          onDrop={handleArrangementDrop}
                          onRemove={() => removeArrangementEntry(entry.index)}
                        />
                      )) : (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Add at least one section group to define an arrangement.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {selectedGroup && selectedSlide ? (
                <div className="flex flex-col gap-4 h-full">
                  <div
                    className="rounded-lg overflow-hidden flex items-center justify-center"
                    style={{
                      minHeight: 220,
                      background: '#1a1a1a',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: '#ffffff',
                      textAlign: 'center',
                      padding: 28,
                    }}
                  >
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 26,
                        lineHeight: 1,
                        maxWidth: '80%',
                      }}
                    >
                      {selectedSlide.body || 'Selected slide preview'}
                    </div>
                  </div>

                  <div
                    className="rounded-lg p-4"
                    style={{
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {selectedGroup.label}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Slide {selectedGroup.slides.findIndex((slide) => slide.id === selectedSlide.id) + 1}
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={selectedSlide.body}
                      onChange={(event) => updateSlideBody(selectedGroup.id, selectedSlide.id, event.target.value)}
                      onFocus={beginLyricsEditing}
                      onBlur={endLyricsEditing}
                      className="w-full rounded text-sm outline-none resize-none"
                      style={{
                        minHeight: 180,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        padding: 12,
                        lineHeight: 1.45,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Parse lyrics or add a section group to start editing song slides.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className="flex flex-col min-h-0 overflow-hidden"
            style={{ width: '34%', borderLeft: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Song Section Groups
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Edit each group and the slides inside it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => addGroup('verse')}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <Plus size={12} />
                Group
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-lg overflow-hidden shrink-0"
                  style={{
                    background: 'var(--bg-app)',
                    border: group.id === selectedGroupId ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    boxShadow: group.id === selectedGroupId ? '0 0 0 2px rgba(74,124,255,0.12)' : 'none',
                  }}
                >
                  <div
                    className="px-3 py-3 flex items-center gap-2"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <select
                      value={group.type}
                      onChange={(event) => updateGroupType(group.id, event.target.value)}
                      className="text-xs px-2 py-1 rounded outline-none"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {SECTION_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <input
                      value={group.label}
                      onChange={(event) => updateGroup(group.id, (current) => ({ ...current, label: event.target.value }))}
                      className="flex-1 px-2 py-1 rounded text-xs outline-none"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="flex items-center justify-center w-7 h-7 rounded"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="px-3 py-3 flex flex-col gap-2">
                    {group.slides.map((slide, index) => {
                      const selected = group.id === selectedGroupId && slide.id === selectedSlideId
                      return (
                        <div
                          key={slide.id}
                          className="rounded-md p-2"
                          style={{
                            background: selected ? 'rgba(74,124,255,0.08)' : 'var(--bg-surface)',
                            border: selected ? '1px solid rgba(74,124,255,0.42)' : '1px solid var(--border-default)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <button
                              type="button"
                              onClick={() => selectSlide(group.id, slide.id)}
                              className="text-xs font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              Slide {index + 1}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSlideFromGroup(group.id, slide.id)}
                              className="text-xs"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              Remove
                            </button>
                          </div>
                          <textarea
                            value={slide.body}
                            onFocus={() => {
                              beginLyricsEditing()
                              selectSlide(group.id, slide.id)
                            }}
                            onBlur={endLyricsEditing}
                            onChange={(event) => updateSlideBody(group.id, slide.id, event.target.value)}
                            className="w-full rounded text-xs outline-none resize-none"
                            style={{
                              minHeight: 72,
                              background: 'var(--bg-app)',
                              border: '1px solid var(--border-default)',
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                              padding: 8,
                            }}
                          />
                        </div>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => addSlideToGroup(group.id)}
                      className="self-start flex items-center gap-1 px-2.5 py-1 rounded text-xs"
                      style={{
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Plus size={12} />
                      Add Slide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

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
