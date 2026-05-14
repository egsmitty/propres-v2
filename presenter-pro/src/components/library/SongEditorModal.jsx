import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { createSong, updateSong } from '@/utils/ipc'
import { confirmDialog } from '@/utils/dialog'
import { SECTION_TYPES, getSectionColor } from '@/utils/sectionTypes'
import {
  createSongSectionGroup,
  flattenSongGroupsToSlides,
  getSongGroupsAndArrangement,
  makeSongGroupLabel,
  parseSongGroupsFromLyrics,
} from '@/utils/songSections'
import { uuid } from '@/utils/uuid'

const CUSTOM_GROUP_NAME_LIMIT = 24
const CUSTOM_GROUP_DEFAULT_LABEL = 'Custom'
const DEFAULT_UNTITLED_SONG_TITLE = 'Untitled Song'
const SONG_EDITOR_SECTION_TYPES = SECTION_TYPES.filter((type) => type.id !== 'blank')

function normalizeSongEditorGroupType(type = 'verse') {
  return type === 'blank' ? 'custom' : type
}

function isCustomSongEditorGroupType(type = 'verse') {
  return normalizeSongEditorGroupType(type) === 'custom'
}

function sanitizeCustomGroupLabel(label = '') {
  return String(label || '').slice(0, CUSTOM_GROUP_NAME_LIMIT)
}

function finalizeCustomGroupLabel(label = '') {
  const normalized = sanitizeCustomGroupLabel(label)
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || CUSTOM_GROUP_DEFAULT_LABEL
}

function resolveSongEditorGroupLabel(group) {
  if (!group) return ''
  if (isCustomSongEditorGroupType(group.type)) {
    return finalizeCustomGroupLabel(group.label)
  }

  return group.label || makeSongGroupLabel(group.type)
}

function nextGroupLabel(type, groups) {
  const normalizedType = normalizeSongEditorGroupType(type)
  const count = groups.filter((group) => normalizeSongEditorGroupType(group.type) === normalizedType).length + 1
  return makeSongGroupLabel(normalizedType, '', count > 1 ? String(count) : '')
}

function normalizeSongEditorGroups(groups = []) {
  const counts = new Map()

  return groups.map((group) => {
    const type = normalizeSongEditorGroupType(group?.type || 'verse')
    const slides = Array.isArray(group?.slides)
      ? group.slides.map((slide) => ({
          id: slide.id || uuid(),
          body: slide.body || '',
        }))
      : []

    if (isCustomSongEditorGroupType(type)) {
      return {
        ...group,
        type,
        label: sanitizeCustomGroupLabel(group?.label),
        slides,
      }
    }

    const occurrence = (counts.get(type) || 0) + 1
    counts.set(type, occurrence)

    return {
      ...group,
      type,
      label: makeSongGroupLabel(type, '', occurrence > 1 ? String(occurrence) : ''),
      slides,
    }
  })
}

function groupsToLyrics(groups) {
  return groups
    .map((group) => {
      const header = resolveSongEditorGroupLabel(group)
      const slides = (group.slides || []).map((slide) => slide.body || '')
      return [header, ...slides].join('\n\n')
    })
    .join('\n\n')
}

function finalizeSongEditorGroups(groups = []) {
  return normalizeSongEditorGroups(groups.map((group) => (
    isCustomSongEditorGroupType(group?.type)
      ? { ...group, label: finalizeCustomGroupLabel(group?.label) }
      : group
  )))
}

function buildSongEditorStateFromLyrics(lyrics = '') {
  const parsedGroups = normalizeSongEditorGroups(parseSongGroupsFromLyrics(lyrics))
  return {
    groups: parsedGroups,
    arrangement: parsedGroups.map((group) => group.id),
    lyrics: parsedGroups.length ? groupsToLyrics(parsedGroups) : '',
  }
}

function createSongEditorSnapshot({ title, artist, ccli, lyrics, groups, arrangement }) {
  return JSON.stringify({
    title: title || '',
    artist: artist || '',
    ccli: ccli || '',
    lyrics: lyrics || '',
    arrangement: Array.isArray(arrangement) ? arrangement : [],
    groups: (groups || []).map((group) => ({
      id: group.id,
      type: normalizeSongEditorGroupType(group.type),
      label: group.label || '',
      slides: (group.slides || []).map((slide) => ({
        id: slide.id,
        body: slide.body || '',
      })),
    })),
  })
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

function ArrangementChip({ label, color, onRemove, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
  const [collapsedGroupIds, setCollapsedGroupIds] = useState([])
  const [pendingCustomFocusGroupId, setPendingCustomFocusGroupId] = useState(null)

  const initialSnapshotRef = useRef('')
  const editingLyrics = lyricsFocusCount > 0

  function commitGroups(nextGroupsOrUpdater) {
    setGroups((current) => normalizeSongEditorGroups(
      typeof nextGroupsOrUpdater === 'function'
        ? nextGroupsOrUpdater(current)
        : nextGroupsOrUpdater
    ))
  }

  useEffect(() => {
    const nextTitle = song?.title || ''
    const nextArtist = song?.artist || ''
    const nextCcli = song?.ccli || ''
    const { groups: loadedGroups, arrangement: nextArrangement } = getSongGroupsAndArrangement(song)
    const nextGroups = normalizeSongEditorGroups(loadedGroups)
    const nextLyrics = groupsToLyrics(nextGroups)

    setTitle(nextTitle)
    setArtist(nextArtist)
    setCcli(nextCcli)
    setGroups(nextGroups)
    setArrangement(nextArrangement)
    setLyrics(nextLyrics)
    setRawLyricsFocused(false)
    setRawLyricsDirty(false)
    setCollapsedGroupIds([])
    setPendingCustomFocusGroupId(null)

    const selection = getGroupSlideSelection(nextGroups, nextArrangement, null, null)
    setSelectedGroupId(selection.groupId)
    setSelectedSlideId(selection.slideId)

    initialSnapshotRef.current = createSongEditorSnapshot({
      title: nextTitle,
      artist: nextArtist,
      ccli: nextCcli,
      lyrics: nextLyrics,
      groups: nextGroups,
      arrangement: nextArrangement,
    })
  }, [song])

  useEffect(() => {
    setCollapsedGroupIds((current) => current.filter((groupId) => groups.some((group) => group.id === groupId)))
  }, [groups])

  useEffect(() => {
    if (rawLyricsFocused || rawLyricsDirty) return
    setLyrics(groupsToLyrics(groups))
  }, [groups, rawLyricsDirty, rawLyricsFocused])

  useEffect(() => {
    const selection = getGroupSlideSelection(groups, arrangement, selectedGroupId, selectedSlideId)
    if (selection.groupId !== selectedGroupId) setSelectedGroupId(selection.groupId)
    if (selection.slideId !== selectedSlideId) setSelectedSlideId(selection.slideId)
  }, [arrangement, groups, selectedGroupId, selectedSlideId])

  useEffect(() => {
    if (!pendingCustomFocusGroupId) return undefined

    const hasFocusedCustomGroup = groups.some((group) => (
      group.id === pendingCustomFocusGroupId && isCustomSongEditorGroupType(group.type)
    ))

    if (!hasFocusedCustomGroup) return undefined

    const frame = window.requestAnimationFrame(() => setPendingCustomFocusGroupId(null))
    return () => window.cancelAnimationFrame(frame)
  }, [groups, pendingCustomFocusGroupId])

  const selection = useMemo(
    () => getGroupSlideSelection(groups, arrangement, selectedGroupId, selectedSlideId),
    [arrangement, groups, selectedGroupId, selectedSlideId]
  )
  const selectedGroup = selection.group
  const selectedSlide = selection.slide

  const isDirty = useMemo(
    () => createSongEditorSnapshot({ title, artist, ccli, lyrics, groups, arrangement }) !== initialSnapshotRef.current,
    [arrangement, artist, ccli, groups, lyrics, title]
  )

  const availableSections = useMemo(
    () => groups.map((group) => ({ id: group.id, label: resolveSongEditorGroupLabel(group), color: getSectionColor(group.type) })),
    [groups]
  )
  const allGroupsCollapsed = groups.length > 0 && groups.every((group) => collapsedGroupIds.includes(group.id))

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
    const nextSongState = buildSongEditorStateFromLyrics(lyrics)
    setGroups(nextSongState.groups)
    setArrangement(nextSongState.arrangement)
    setLyrics(nextSongState.lyrics)
    setRawLyricsDirty(false)
    const nextSelection = getGroupSlideSelection(nextSongState.groups, nextSongState.arrangement, null, null)
    setSelectedGroupId(nextSelection.groupId)
    setSelectedSlideId(nextSelection.slideId)
  }

  function selectSlide(groupId, slideId) {
    setCollapsedGroupIds((current) => current.filter((id) => id !== groupId))
    setSelectedGroupId(groupId)
    setSelectedSlideId(slideId)
  }

  function toggleGroupCollapsed(groupId) {
    setCollapsedGroupIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ))
  }

  function collapseAllGroups() {
    setCollapsedGroupIds((current) => (
      current.length === groups.length ? [] : groups.map((group) => group.id)
    ))
  }

  function updateGroup(groupId, updater) {
    commitGroups((current) => updateGroupCollection(current, groupId, updater))
  }

  function updateGroupType(groupId, type) {
    const normalizedType = normalizeSongEditorGroupType(type)

    if (isCustomSongEditorGroupType(normalizedType)) {
      setPendingCustomFocusGroupId(groupId)
    }

    commitGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group

      if (isCustomSongEditorGroupType(normalizedType)) {
        return {
          ...group,
          type: normalizedType,
          label: isCustomSongEditorGroupType(group.type) ? group.label : CUSTOM_GROUP_DEFAULT_LABEL,
        }
      }

      return {
        ...group,
        type: normalizedType,
        label: '',
      }
    }))
  }

  function updateCustomGroupLabel(groupId, label) {
    updateGroup(groupId, (group) => ({
      ...group,
      label: sanitizeCustomGroupLabel(label),
    }))
  }

  function finalizeCustomGroup(groupId) {
    updateGroup(groupId, (group) => {
      if (!isCustomSongEditorGroupType(group.type)) return group

      const nextLabel = finalizeCustomGroupLabel(group.label)
      if (nextLabel === group.label) return group

      return {
        ...group,
        label: nextLabel,
      }
    })
  }

  function updateSlideBody(groupId, slideId, body) {
    updateGroup(groupId, (group) => ({
      ...group,
      slides: group.slides.map((slide) => (slide.id === slideId ? { ...slide, body } : slide)),
    }))
  }

  function addGroup(type = 'verse') {
    const normalizedType = normalizeSongEditorGroupType(type)
    const group = createSongSectionGroup(
      normalizedType,
      isCustomSongEditorGroupType(normalizedType) ? CUSTOM_GROUP_DEFAULT_LABEL : '',
      [{ id: uuid(), body: '' }],
      uuid()
    )

    commitGroups((current) => [...current, group])
    setArrangement((current) => [...current, group.id])
    setCollapsedGroupIds((current) => current.filter((id) => id !== group.id))
    setSelectedGroupId(group.id)
    setSelectedSlideId(group.slides[0].id)

    if (isCustomSongEditorGroupType(normalizedType)) {
      setPendingCustomFocusGroupId(group.id)
    }
  }

  function removeGroup(groupId) {
    const remainingGroups = groups.filter((group) => group.id !== groupId)
    const remainingArrangement = arrangement.filter((entry) => entry !== groupId)
    setGroups(remainingGroups)
    setArrangement(remainingArrangement)
    setCollapsedGroupIds((current) => current.filter((id) => id !== groupId))
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

  async function handleRequestClose() {
    if (saving) return
    if (!isDirty) {
      onClose()
      return
    }

    const ok = await confirmDialog('Close song editor without saving your changes?', {
      title: 'Unsaved Changes',
      confirmLabel: 'Discard',
      danger: true,
    })

    if (!ok) return
    onClose()
  }

  async function handleSave() {
    setSaving(true)

    try {
      const resolvedTitle = title.trim() || DEFAULT_UNTITLED_SONG_TITLE
      if (resolvedTitle !== title) {
        setTitle(resolvedTitle)
      }

      const nextSongState = rawLyricsDirty
        ? buildSongEditorStateFromLyrics(lyrics)
        : { groups, arrangement, lyrics }
      const finalizedGroups = finalizeSongEditorGroups(nextSongState.groups)
      const flattened = flattenSongGroupsToSlides(finalizedGroups, nextSongState.arrangement)
      const data = {
        title: resolvedTitle,
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

      onSave()
      onClose()
    } catch (error) {
      console.error('Failed to save song', error)
    } finally {
      setSaving(false)
    }
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
            onClick={handleRequestClose}
            disabled={saving}
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
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-xs font-medium leading-none" style={{ color: 'var(--text-secondary)' }}>
                  Raw Lyrics Import
                </label>
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!lyrics.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 px-3.5 h-8 rounded text-xs font-medium"
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
                        onDragEnd={() => {
                          setDragState(null)
                        }}
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
                    onDragOver={(event) => {
                      event.preventDefault()
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleArrangementDrop(arrangementEntries.length)
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {arrangementEntries.length ? arrangementEntries.map((entry) => (
                        <div
                          key={`${entry.groupId}-${entry.index}`}
                          className="relative shrink-0"
                        >
                          <div
                            aria-hidden="true"
                            onDragOver={(event) => {
                              event.preventDefault()
                              if (!dragState) return
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleArrangementDrop(entry.index)
                            }}
                            style={{
                              position: 'absolute',
                              left: -7,
                              top: 0,
                              bottom: 0,
                              width: 14,
                              zIndex: 1,
                            }}
                          />
                          <div
                            aria-hidden="true"
                            onDragOver={(event) => {
                              event.preventDefault()
                              if (!dragState) return
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleArrangementDrop(entry.index + 1)
                            }}
                            style={{
                              position: 'absolute',
                              right: -7,
                              top: 0,
                              bottom: 0,
                              width: 14,
                              zIndex: 1,
                            }}
                          />
                          <ArrangementChip
                            label={resolveSongEditorGroupLabel(entry.group)}
                            color={getSectionColor(entry.group.type)}
                            onDragStart={() => setDragState({ kind: 'arrangement', index: entry.index })}
                            onDragEnd={() => {
                              setDragState(null)
                            }}
                            onRemove={() => removeArrangementEntry(entry.index)}
                          />
                        </div>
                      )) : (
                        <button
                          type="button"
                          aria-label="Insert at beginning"
                          onDragOver={(event) => {
                            event.preventDefault()
                            if (!dragState) return
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleArrangementDrop(0)
                          }}
                          className="w-full rounded-md px-3 py-3 text-left transition-all"
                          style={{
                            background: 'transparent',
                            border: '1px dashed transparent',
                            color: 'var(--text-tertiary)',
                            cursor: dragState ? 'copy' : 'default',
                          }}
                        >
                          <span className="text-xs">
                            Drag or add section groups here to define an arrangement.
                          </span>
                        </button>
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
                          {resolveSongEditorGroupLabel(selectedGroup)}
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
                onClick={collapseAllGroups}
                className="px-2.5 py-1 rounded text-[11px] font-medium"
                style={{ color: 'var(--text-primary)', background: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
              >
                {allGroupsCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => addGroup('verse')}
                className="self-end inline-flex items-center justify-center gap-1.5 px-4 h-8 rounded-md text-sm font-medium"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <Plus size={12} />
                Add Section Group
              </button>
              {groups.map((group) => {
                const collapsed = collapsedGroupIds.includes(group.id)
                const customGroup = isCustomSongEditorGroupType(group.type)
                const groupDisplayLabel = resolveSongEditorGroupLabel(group)

                return (
                  <div key={group.id} className="shrink-0">
                    <div
                      className="mb-1 px-1 text-sm font-semibold tracking-[0.01em] truncate"
                      style={{
                        color: 'var(--text-primary)',
                      }}
                      title={groupDisplayLabel}
                    >
                      {groupDisplayLabel}
                    </div>
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{
                        background: 'var(--bg-app)',
                        border: group.id === selectedGroupId ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                        boxShadow: group.id === selectedGroupId ? '0 0 0 2px rgba(74,124,255,0.12)' : 'none',
                      }}
                    >
                      <div
                        className="px-3 py-3 flex items-start gap-2"
                        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)' }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroupCollapsed(group.id)}
                          className="flex items-center justify-center w-7 h-7 rounded shrink-0"
                          style={{
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                          }}
                          title={collapsed ? 'Expand group' : 'Collapse group'}
                        >
                          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <select
                            value={group.type}
                            onChange={(event) => updateGroupType(group.id, event.target.value)}
                            className="text-xs px-2 py-1 rounded outline-none min-w-0 w-full"
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-default)',
                              color: 'var(--text-primary)',
                              minWidth: 156,
                            }}
                          >
                            {SONG_EDITOR_SECTION_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>{type.label}</option>
                            ))}
                          </select>
                        </div>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                          {group.slides.length} slide{group.slides.length === 1 ? '' : 's'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGroup(group.id)}
                          className="flex items-center justify-center w-7 h-7 rounded shrink-0"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {!collapsed ? (
                        <div className="px-3 py-3 flex flex-col gap-2">
                          {customGroup ? (
                            <div>
                              <input
                                value={group.label}
                                onChange={(event) => updateCustomGroupLabel(group.id, event.target.value)}
                                onBlur={() => finalizeCustomGroup(group.id)}
                                maxLength={CUSTOM_GROUP_NAME_LIMIT}
                                autoFocus={pendingCustomFocusGroupId === group.id}
                                placeholder="Custom section name"
                                className="w-full px-2.5 py-2 rounded text-xs outline-none"
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-default)',
                                  color: 'var(--text-primary)',
                                }}
                              />
                              <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-tertiary)' }}>
                                Custom names are limited to {CUSTOM_GROUP_NAME_LIMIT} characters.
                              </p>
                            </div>
                          ) : null}
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
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {title.trim() ? 'Songs save to the library with the current arrangement and section groups.' : 'Leaving the name blank will default to Untitled Song'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestClose}
              disabled={saving}
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
              disabled={saving}
              title={title.trim() ? 'Save this song to the library' : 'Save this song as Untitled Song'}
              className="px-3 py-1.5 rounded text-xs font-medium"
              style={{
                background: saving ? 'var(--bg-hover)' : 'var(--accent)',
                color: saving ? 'var(--text-tertiary)' : '#fff',
              }}
            >
              {saving ? 'Saving…' : 'Save to Library'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
