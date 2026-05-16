import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Film } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import SectionHeader from './SectionHeader'
import FilmstripSlide from './FilmstripSlide'
import ScaledSlideText from '@/components/shared/ScaledSlideText'
import SongEditorModal from '@/components/library/SongEditorModal'
import { createSection, createTextSlide, isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import { getMedia, getSongs } from '@/utils/ipc'
import { flushPendingNumericFieldCommit } from '@/utils/pendingNumericCommit'
import { getSlideTextBoxes, withUpdatedSlideTextBoxes } from '@/utils/textBoxes'
import { uuid } from '@/utils/uuid'
import { deleteSelectedSlideFromCurrentPresentation } from '@/utils/presentationCommands'
import { getEffectiveBackgroundId } from '@/utils/backgrounds'
import { flattenSongGroupsToSlides, getSongGroupsAndArrangement } from '@/utils/songSections'
import { applyDroppedMediaToTargets, isMediaLibraryDrag } from '@/utils/mediaDropActions'

const AUTO_SCROLL_EDGE = 72
const AUTO_SCROLL_MAX_STEP = 26

function stripDraggedSlide(sections, draggedSlide) {
  if (!draggedSlide) return sections

  return sections.map((section) => {
    if (section.id !== draggedSlide.sectionId) return section
    return {
      ...section,
      slides: section.slides.filter((slide) => slide.id !== draggedSlide.slideId),
    }
  })
}

function applySlideMove(sections, draggedSlide, dropTarget) {
  if (!draggedSlide || !dropTarget) return sections

  let movedSlide = null
  const withoutSource = sections.map((section) => {
    if (section.id !== draggedSlide.sectionId) return section
    movedSlide = section.slides.find((slide) => slide.id === draggedSlide.slideId) || null
    return {
      ...section,
      slides: section.slides.filter((slide) => slide.id !== draggedSlide.slideId),
    }
  })

  if (!movedSlide) return sections

  return withoutSource.map((section) => {
    if (section.id !== dropTarget.sectionId) return section

    const slides = [...section.slides]
    if (dropTarget.targetSlideId) {
      const index = slides.findIndex((slide) => slide.id === dropTarget.targetSlideId)
      const insertIndex = index === -1 ? slides.length : index
      slides.splice(insertIndex, 0, movedSlide)
    } else {
      slides.push(movedSlide)
    }

    return { ...section, slides }
  })
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function parseNodeKey(key) {
  const [sectionId, slideId] = key.split('::')
  return { sectionId, slideId }
}

function findSlideDropTarget(x, y, sectionId, slideNodeRefs, endNodeRefs) {
  for (const [key, node] of slideNodeRefs.current.entries()) {
    if (!node) continue
    const rect = node.getBoundingClientRect()
    if (pointInRect(x, y, rect)) {
      const parsed = parseNodeKey(key)
      if (parsed.sectionId !== sectionId) continue
      return { sectionId: parsed.sectionId, targetSlideId: parsed.slideId }
    }
  }

  for (const [targetSectionId, node] of endNodeRefs.current.entries()) {
    if (!node) continue
    if (targetSectionId !== sectionId) continue
    const rect = node.getBoundingClientRect()
    if (pointInRect(x, y, rect)) {
      return { sectionId: targetSectionId, targetSlideId: null }
    }
  }

  return null
}

function getGhostWidth(width, floating = false) {
  return Math.max(136, width - (floating ? 42 : 20))
}

function computeGhostPosition(pointerX, pointerY, width, anchor = { x: 0.5, y: 0.2 }) {
  const ghostWidth = getGhostWidth(width, true)
  return {
    x: pointerX - ghostWidth * anchor.x,
    y: pointerY - 18 - 160 * anchor.y,
  }
}

function getAllSlides(presentation) {
  return (presentation?.sections || []).flatMap((sec) =>
    sec.slides.map((sl) => ({ id: sl.id, sectionId: sec.id }))
  )
}

function getEffectiveSelectedSlideIds(selectedSlideIds = [], selectedSlideId = null) {
  const ids = [...selectedSlideIds]
  if (selectedSlideId && !ids.includes(selectedSlideId)) ids.push(selectedSlideId)
  return ids
}

function isSongLibraryDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('application/presenterpro-song-id')
}

function isGenericSlideLabel(label) {
  const normalized = String(label || '').trim().toLowerCase()
  return normalized === 'text' || normalized === 'lyrics' || normalized === 'notes'
}

function getDisplaySlideLabel(slide) {
  if (!slide?.label || isGenericSlideLabel(slide.label)) return ''
  return slide.label
}

function copyTextBoxAppearance(sourceBox, targetBox) {
  return {
    ...targetBox,
    textStyle: {
      ...targetBox.textStyle,
      ...sourceBox.textStyle,
    },
    fillType: sourceBox.fillType,
    backgroundColor: sourceBox.backgroundColor,
    fillOpacity: sourceBox.fillOpacity,
    outlineColor: sourceBox.outlineColor,
    outlineWidth: sourceBox.outlineWidth,
    outlineStyle: sourceBox.outlineStyle,
    outlineOpacity: sourceBox.outlineOpacity,
    shadowEnabled: sourceBox.shadowEnabled,
    shadowColor: sourceBox.shadowColor,
    shadowBlur: sourceBox.shadowBlur,
    shadowOffsetX: sourceBox.shadowOffsetX,
    shadowOffsetY: sourceBox.shadowOffsetY,
    cornerRadius: sourceBox.cornerRadius,
    paddingTop: sourceBox.paddingTop,
    paddingRight: sourceBox.paddingRight,
    paddingBottom: sourceBox.paddingBottom,
    paddingLeft: sourceBox.paddingLeft,
    wrapText: sourceBox.wrapText,
    autoFit: sourceBox.autoFit,
    textDirection: sourceBox.textDirection,
    opacity: sourceBox.opacity,
  }
}

function buildSlideAppearanceSnapshot(presentation, sectionId, slide) {
  if (!slide || isMediaSlide(slide)) return null

  const sourceBoxes = getSlideTextBoxes(slide)
  const primarySourceBox = sourceBoxes[0]
  if (!primarySourceBox) return null

  return {
    backgroundId: getEffectiveBackgroundId(presentation, sectionId, slide),
    textBoxes: sourceBoxes.map((box) => ({
      textStyle: { ...box.textStyle },
      fillType: box.fillType,
      backgroundColor: box.backgroundColor,
      fillOpacity: box.fillOpacity,
      outlineColor: box.outlineColor,
      outlineWidth: box.outlineWidth,
      outlineStyle: box.outlineStyle,
      outlineOpacity: box.outlineOpacity,
      shadowEnabled: box.shadowEnabled,
      shadowColor: box.shadowColor,
      shadowBlur: box.shadowBlur,
      shadowOffsetX: box.shadowOffsetX,
      shadowOffsetY: box.shadowOffsetY,
      cornerRadius: box.cornerRadius,
      paddingTop: box.paddingTop,
      paddingRight: box.paddingRight,
      paddingBottom: box.paddingBottom,
      paddingLeft: box.paddingLeft,
      wrapText: box.wrapText,
      autoFit: box.autoFit,
      textDirection: box.textDirection,
      opacity: box.opacity,
    })),
    primaryTextBox: {
      textStyle: { ...primarySourceBox.textStyle },
      fillType: primarySourceBox.fillType,
      backgroundColor: primarySourceBox.backgroundColor,
      fillOpacity: primarySourceBox.fillOpacity,
      outlineColor: primarySourceBox.outlineColor,
      outlineWidth: primarySourceBox.outlineWidth,
      outlineStyle: primarySourceBox.outlineStyle,
      outlineOpacity: primarySourceBox.outlineOpacity,
      shadowEnabled: primarySourceBox.shadowEnabled,
      shadowColor: primarySourceBox.shadowColor,
      shadowBlur: primarySourceBox.shadowBlur,
      shadowOffsetX: primarySourceBox.shadowOffsetX,
      shadowOffsetY: primarySourceBox.shadowOffsetY,
      cornerRadius: primarySourceBox.cornerRadius,
      paddingTop: primarySourceBox.paddingTop,
      paddingRight: primarySourceBox.paddingRight,
      paddingBottom: primarySourceBox.paddingBottom,
      paddingLeft: primarySourceBox.paddingLeft,
      wrapText: primarySourceBox.wrapText,
      autoFit: primarySourceBox.autoFit,
      textDirection: primarySourceBox.textDirection,
      opacity: primarySourceBox.opacity,
    },
  }
}

function applySlideAppearanceSnapshot(slide, snapshot) {
  if (!snapshot || isMediaSlide(slide)) return slide

  return withUpdatedSlideTextBoxes(
    {
      ...slide,
      backgroundId: snapshot.backgroundId,
    },
    (boxes) =>
      boxes.map((box, index) =>
        copyTextBoxAppearance(snapshot.textBoxes[index] || snapshot.primaryTextBox, box)
      )
  )
}

function GhostSlide({ slide, width, presentation, floating = false, compact = false, showLabel = true }) {
  const displayLabel = isMediaSlide(slide) ? (slide.label || 'Media') : getDisplaySlideLabel(slide)

  return (
    <div
      style={{
        width: getGhostWidth(width, floating),
        pointerEvents: 'none',
        opacity: floating ? 0.82 : 1,
        transform: 'none',
        filter: floating ? 'drop-shadow(0 10px 18px rgba(0,0,0,0.22))' : 'none',
      }}
    >
      <div
        className="rounded overflow-hidden"
        style={{
          padding: 2,
          background: floating ? 'rgba(74,124,255,0.12)' : 'rgba(74,124,255,0.16)',
          border: '1px solid rgba(74,124,255,0.28)',
        }}
      >
        <div
          className="w-full rounded flex items-center justify-center relative overflow-hidden"
          style={{
            aspectRatio: getPresentationAspectRatio(presentation),
            background: '#1a1a1a',
            border: '2px solid var(--accent)',
          }}
        >
          {isMediaSlide(slide) ? (
            <div className="flex flex-col items-center justify-center gap-1" style={{ color: '#d1d5db' }}>
              <Film size={16} />
              <div className="truncate text-[10px]">{slide.label || 'Media'}</div>
            </div>
          ) : (
            <ScaledSlideText
              presentation={presentation}
              slide={slide}
              empty="Click to edit"
              shadow="none"
              minPaddingX={6}
              minPaddingY={6}
            />
          )}
        </div>
      </div>
      {showLabel && displayLabel ? (
        <div
          className="text-center mt-1 truncate"
          style={{
            fontSize: compact ? 9 : 10,
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            opacity: compact ? 0.82 : 1,
          }}
        >
          {displayLabel}
        </div>
      ) : null}
    </div>
  )
}

function PreviewInsert({ slide, width, presentation }) {
  return (
    <div
      className="mx-2 mb-1 rounded"
      style={{
        transition: 'all 120ms ease',
        borderRadius: 10,
        border: '2px dashed rgba(74,124,255,0.9)',
        background: 'rgba(74,124,255,0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        className="text-center mb-1"
        style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(122,162,255,0.95)',
          fontWeight: 700,
        }}
      >
        Drop Here
      </div>
      <div
        style={{
          width: '100%',
          height: 8,
          borderRadius: 999,
          background: 'rgba(122,162,255,0.55)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.16)',
        }}
      />
    </div>
  )
}

export default function Filmstrip({ width = 224 }) {
  const presentation = useEditorStore((s) => s.presentation)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const selectedSlideIds = useEditorStore((s) => s.selectedSlideIds)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)
  const setSlideSelection = useEditorStore((s) => s.setSlideSelection)
  const setSelectedSlideIds = useEditorStore((s) => s.setSelectedSlideIds)
  const setSuppressAutoEditSlideId = useEditorStore((s) => s.setSuppressAutoEditSlideId)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const [collapsed, setCollapsed] = useState({})
  const [editSong, setEditSong] = useState(null)
  const [mediaLibrary, setMediaLibrary] = useState([])
  const [dragCandidate, setDragCandidate] = useState(null)
  const anchorSlideRef = useRef(null)
  const [activeSlideDrag, setActiveSlideDrag] = useState(null)
  const [slideDropTarget, setSlideDropTarget] = useState(null)
  const [dragGhost, setDragGhost] = useState(null)
  const containerRef = useRef(null)
  const activeSlideDragRef = useRef(null)
  const slideDropTargetRef = useRef(null)
  const dragPointerRef = useRef(null)
  const autoScrollFrameRef = useRef(null)
  const dragSection = useRef(null)
  const [dragOverSection, setDragOverSection] = useState(null)
  const [externalSongDropIndex, setExternalSongDropIndex] = useState(null)
  const [mediaDropTargetSlideId, setMediaDropTargetSlideId] = useState(null)
  const slideNodeRefs = useRef(new Map())
  const endNodeRefs = useRef(new Map())
  const effectiveSelectedSlideIds = useMemo(
    () => getEffectiveSelectedSlideIds(selectedSlideIds, selectedSlideId),
    [selectedSlideId, selectedSlideIds]
  )

  function maybeAutoScroll(clientY) {
    const container = containerRef.current
    if (!container) return 0

    const rect = container.getBoundingClientRect()
    const distanceToTop = clientY - rect.top
    const distanceToBottom = rect.bottom - clientY
    let delta = 0

    if (distanceToTop >= 0 && distanceToTop < AUTO_SCROLL_EDGE) {
      const intensity = 1 - distanceToTop / AUTO_SCROLL_EDGE
      delta = -Math.max(8, Math.round(AUTO_SCROLL_MAX_STEP * intensity))
    } else if (distanceToBottom >= 0 && distanceToBottom < AUTO_SCROLL_EDGE) {
      const intensity = 1 - distanceToBottom / AUTO_SCROLL_EDGE
      delta = Math.max(8, Math.round(AUTO_SCROLL_MAX_STEP * intensity))
    }

    if (!delta) return 0

    const nextScrollTop = Math.max(0, Math.min(container.scrollTop + delta, container.scrollHeight - container.clientHeight))
    if (nextScrollTop === container.scrollTop) return 0
    container.scrollTop = nextScrollTop
    return delta
  }

  useEffect(() => {
    const sections = presentation?.sections || []
    if (!sections.length) {
      setCollapsed({})
      return
    }

    const next = {}
    sections.forEach((section) => {
      next[section.id] = true
    })
    setCollapsed(next)
  }, [presentation?.id])

  useEffect(() => {
    getMedia().then((result) => {
      if (result?.success) setMediaLibrary(result.data || [])
    }).catch(() => {})
  }, [mediaLibraryOpen, presentation?.id])

  useEffect(() => {
    activeSlideDragRef.current = activeSlideDrag
  }, [activeSlideDrag])

  useEffect(() => {
    function handleDragEnd() {
      setExternalSongDropIndex(null)
      setMediaDropTargetSlideId(null)
    }

    window.addEventListener('dragend', handleDragEnd)
    window.addEventListener('drop', handleDragEnd)
    return () => {
      window.removeEventListener('dragend', handleDragEnd)
      window.removeEventListener('drop', handleDragEnd)
    }
  }, [])

  useEffect(() => {
    slideDropTargetRef.current = slideDropTarget
  }, [slideDropTarget])

  useEffect(() => {
    function stepAutoScroll() {
      const pointer = dragPointerRef.current
      const dragging = activeSlideDragRef.current

      if (!pointer || !dragging) {
        autoScrollFrameRef.current = null
        return
      }

      const delta = maybeAutoScroll(pointer.y)
      if (delta) {
        const nextTarget = findSlideDropTarget(
          pointer.x,
          pointer.y,
          dragging.sectionId,
          slideNodeRefs,
          endNodeRefs
        )
        if (nextTarget) setSlideDropTarget(nextTarget)
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(stepAutoScroll)
    }

    if (activeSlideDrag && !autoScrollFrameRef.current) {
      autoScrollFrameRef.current = window.requestAnimationFrame(stepAutoScroll)
    }

    if (!activeSlideDrag && autoScrollFrameRef.current) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }

    return () => {
      if (autoScrollFrameRef.current) {
        window.cancelAnimationFrame(autoScrollFrameRef.current)
        autoScrollFrameRef.current = null
      }
    }
  }, [activeSlideDrag])

  useEffect(() => {
    function handleMouseMove(e) {
      dragPointerRef.current = { x: e.clientX, y: e.clientY }

      if (dragCandidate && !activeSlideDrag) {
        const dx = e.clientX - dragCandidate.startX
        const dy = e.clientY - dragCandidate.startY
        if (Math.hypot(dx, dy) >= 6) {
          const nextActive = {
            sectionId: dragCandidate.sectionId,
            slideId: dragCandidate.slide.id,
            slide: dragCandidate.slide,
          }
          setActiveSlideDrag(nextActive)
          const nextPosition = computeGhostPosition(e.clientX, e.clientY, width, dragCandidate.anchor)
          setDragGhost({ slide: dragCandidate.slide, anchor: dragCandidate.anchor, ...nextPosition })
          setDragCandidate(null)
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'

          const nextTarget = findSlideDropTarget(
            e.clientX,
            e.clientY,
            nextActive.sectionId,
            slideNodeRefs,
            endNodeRefs
          )
          if (nextTarget) setSlideDropTarget(nextTarget)
        }
        return
      }

      if (!activeSlideDrag) return

      setDragGhost((prev) => prev ? { ...prev, ...computeGhostPosition(e.clientX, e.clientY, width, prev.anchor) } : prev)
      const nextTarget = findSlideDropTarget(
        e.clientX,
        e.clientY,
        activeSlideDrag.sectionId,
        slideNodeRefs,
        endNodeRefs
      )
      if (nextTarget) setSlideDropTarget(nextTarget)
    }

    function handleMouseUp() {
      const dragging = activeSlideDragRef.current
      const target = slideDropTargetRef.current

      if (dragging && target) {
        const isSameSpot =
          dragging.sectionId === target.sectionId &&
          dragging.slideId === target.targetSlideId

        if (!isSameSpot) {
          mutate((sections) => applySlideMove(sections, dragging, target))
        }
      }

      dragPointerRef.current = null
      setDragCandidate(null)
      setActiveSlideDrag(null)
      setSlideDropTarget(null)
      setDragGhost(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [activeSlideDrag, dragCandidate, width])

  const sectionsById = useMemo(
    () => new Map((presentation?.sections || []).map((section) => [section.id, section])),
    [presentation?.sections]
  )

  const sectionsForPreview = useMemo(
    () => stripDraggedSlide(presentation?.sections || [], activeSlideDrag),
    [presentation?.sections, activeSlideDrag]
  )
  const allSectionsCollapsed = useMemo(
    () => sectionsForPreview.length > 0 && sectionsForPreview.every((section) => collapsed[section.id]),
    [collapsed, sectionsForPreview]
  )

  if (!presentation) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ width, flexShrink: 0, background: 'var(--bg-filmstrip)', borderRight: '1px solid var(--border-default)' }}
      >
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No presentation open</p>
      </div>
    )
  }

  function registerSlideNode(sectionId, slideId, node) {
    const key = `${sectionId}::${slideId}`
    if (node) slideNodeRefs.current.set(key, node)
    else slideNodeRefs.current.delete(key)
  }

  function registerSectionEndNode(sectionId, node) {
    if (node) endNodeRefs.current.set(sectionId, node)
    else endNodeRefs.current.delete(sectionId)
  }

  function toggleSection(sectionId) {
    setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  function collapseAllSectionsNow() {
    const next = {}
    ;(presentation?.sections || []).forEach((section) => {
      next[section.id] = true
    })
    setCollapsed(next)
  }

  function collapseAllSections() {
    const next = {}
    ;(presentation?.sections || []).forEach((section) => {
      next[section.id] = !allSectionsCollapsed
    })
    setCollapsed(next)
  }

  function mutate(fn) {
    useEditorStore.getState().mutateSections(fn)
  }

  function buildSongSectionFromLibrarySong(song) {
    const { groups, arrangement } = getSongGroupsAndArrangement(song)
    const flattened = flattenSongGroupsToSlides(groups, arrangement, {
      regenerateSlideIds: true,
      regenerateGroupIds: true,
      songId: song.id,
    })

    return createSection('song', presentation.sections.length, {
      title: song.title,
      songId: song.id,
      songGroups: flattened.groups,
      songOrder: flattened.arrangement,
      slides: flattened.slides,
    })
  }

  async function insertSongAtIndex(songId, index) {
    const result = await getSongs()
    const songs = result?.success ? result.data : []
    const song = songs.find((entry) => String(entry.id) === String(songId)) || null
    if (!song) return

    const newSection = buildSongSectionFromLibrarySong(song)
    mutate((sections) => {
      const next = [...sections]
      next.splice(index, 0, newSection)
      return next
    })
    setCollapsed((current) => ({ ...current, [newSection.id]: true }))
    setSlideSelection(newSection.id, newSection.slides[0]?.id ?? null, newSection.slides[0]?.id ? [newSection.slides[0].id] : [])
  }

  function handleSongDropZoneDragOver(event, index) {
    if (!isSongLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    collapseAllSectionsNow()
    setExternalSongDropIndex(index)
  }

  async function handleSongDropZoneDrop(event, index) {
    if (!isSongLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    const songId = event.dataTransfer.getData('application/presenterpro-song-id')
    setExternalSongDropIndex(null)
    if (!songId) return
    await insertSongAtIndex(songId, index)
  }

  function getMediaDropTargets(sectionId, slideId) {
    if (effectiveSelectedSlideIds.length > 1 && effectiveSelectedSlideIds.includes(slideId)) {
      return (presentation?.sections || []).flatMap((section) =>
        section.slides
          .filter((slide) => effectiveSelectedSlideIds.includes(slide.id))
          .map((slide) => ({ sectionId: section.id, slideId: slide.id }))
      )
    }

    return [{ sectionId, slideId }]
  }

  function handleMediaSlideDragOver(event, sectionId, slideId) {
    if (!isMediaLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setMediaDropTargetSlideId(slideId)
  }

  async function handleMediaSlideDrop(event, sectionId, slideId) {
    if (!isMediaLibraryDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    const mediaId = Number(event.dataTransfer.getData('application/presenterpro-media-id'))
    setMediaDropTargetSlideId(null)
    if (!Number.isFinite(mediaId)) return
    await applyDroppedMediaToTargets(mediaId, getMediaDropTargets(sectionId, slideId))
  }

  function selectFirstAvailableSlide() {
    const nextPresentation = useEditorStore.getState().presentation
    const nextSection = nextPresentation?.sections?.find((section) => section.slides?.length)
    const nextSlide = nextSection?.slides?.[0]
    useEditorStore.getState().setSelectedSlide(nextSection?.id ?? null, nextSlide?.id ?? null)
  }

  function addSlideToSection(section) {
    const newSlide = createTextSlide(section.type)
    mutate((sections) =>
      sections.map((sec) =>
        sec.id === section.id ? { ...sec, slides: [...sec.slides, newSlide] } : sec
      )
    )
  }

  function duplicateSlide(section, slide) {
    const copy = { ...slide, id: uuid() }
    mutate((sections) =>
      sections.map((sec) => {
        if (sec.id !== section.id) return sec
        const idx = sec.slides.findIndex((sl) => sl.id === slide.id)
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, copy)
        return { ...sec, slides }
      })
    )
  }

  function insertSlideAfter(section, slide) {
    const newSlide = createTextSlide(section.type)
    mutate((sections) =>
      sections.map((sec) => {
        if (sec.id !== section.id) return sec
        const idx = sec.slides.findIndex((sl) => sl.id === slide.id)
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, newSlide)
        return { ...sec, slides }
      })
    )
    setSlideSelection(section.id, newSlide.id, [newSlide.id])
    setSuppressAutoEditSlideId(newSlide.id)
    anchorSlideRef.current = newSlide.id
  }

  function deleteSlide(section, slide) {
    flushPendingNumericFieldCommit()
    const selection = getEffectiveSelectedSlideIds(
      useEditorStore.getState().selectedSlideIds,
      useEditorStore.getState().selectedSlideId
    )
    if (!selection.includes(slide.id)) {
      setSlideSelection(section.id, slide.id, [slide.id])
      anchorSlideRef.current = slide.id
    }
    deleteSelectedSlideFromCurrentPresentation()
  }

  function removeSection(sectionId) {
    flushPendingNumericFieldCommit()
    mutate((sections) => sections.filter((sec) => sec.id !== sectionId))
    const selectedSectionId = useEditorStore.getState().selectedSectionId
    if (selectedSectionId === sectionId) selectFirstAvailableSlide()
  }

  function onSlideMouseDown(e, sectionId, slide) {
    if (e.button !== 0) return
    e.stopPropagation()
    flushPendingNumericFieldCommit()
    containerRef.current?.focus()

    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      handleSelectSlide(e, sectionId, slide)
      setDragCandidate(null)
      return
    }

    const nextIds = [slide.id]
    setSlideSelection(sectionId, slide.id, nextIds)
    anchorSlideRef.current = slide.id

    const rect = e.currentTarget.getBoundingClientRect()
    const anchor = {
      x: rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5,
      y: rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.2,
    }
    setDragCandidate({
      sectionId,
      slide,
      startX: e.clientX,
      startY: e.clientY,
      anchor,
    })
  }

  function onSectionDragStart(sectionId) {
    dragSection.current = sectionId
  }

  function onSectionDragOver(e, sectionId) {
    flushPendingNumericFieldCommit()
    if (dragCandidate || activeSlideDrag) return
    e.preventDefault()
    setDragOverSection(sectionId)
  }

  function onSectionDrop(targetSectionId) {
    flushPendingNumericFieldCommit()
    if (dragCandidate || activeSlideDrag) return
    const srcId = dragSection.current
    if (!srcId || srcId === targetSectionId) {
      dragSection.current = null
      setDragOverSection(null)
      return
    }
    mutate((sections) => {
      const srcIdx = sections.findIndex((s) => s.id === srcId)
      const tgtIdx = sections.findIndex((s) => s.id === targetSectionId)
      const arr = [...sections]
      const [moved] = arr.splice(srcIdx, 1)
      arr.splice(tgtIdx, 0, moved)
      return arr
    })
    dragSection.current = null
    setDragOverSection(null)
  }

  async function handleEditSong(section) {
    const songId = section?.songId || section?.slides?.find((slide) => slide.songId)?.songId
    if (!songId) return
    const result = await getSongs()
    const songs = result?.success ? result.data : []
    const song = songs.find((s) => s.id === songId) || null
    if (song) setEditSong(song)
  }

  function handleApplyTheme(sourceSectionId, sourceSlide) {
    flushPendingNumericFieldCommit()
    const appearance = buildSlideAppearanceSnapshot(presentation, sourceSectionId, sourceSlide)
    if (!appearance) return

    const ids = new Set(effectiveSelectedSlideIds)
    mutate((sections) =>
      sections.map((sec) => ({
        ...sec,
        slides: sec.slides.map((sl) =>
          ids.has(sl.id) && !isMediaSlide(sl)
            ? applySlideAppearanceSnapshot(sl, appearance)
            : sl
        ),
      }))
    )
  }

  let slideIndex = 0

  function handleSelectSlide(e, sectionId, slide) {
    flushPendingNumericFieldCommit()
    containerRef.current?.focus()
    const allSlides = getAllSlides(presentation)
    const metaToggle = Boolean(e?.metaKey || e?.ctrlKey)
    const rangeSelect = Boolean(e?.shiftKey)
    const currentSelection = getEffectiveSelectedSlideIds(
      useEditorStore.getState().selectedSlideIds,
      useEditorStore.getState().selectedSlideId
    )

    if (metaToggle) {
      const alreadyIn = currentSelection.includes(slide.id)
      if (alreadyIn && currentSelection.length === 1) {
        setSlideSelection(sectionId, slide.id, [slide.id])
        anchorSlideRef.current = slide.id
        return
      }

      const next = alreadyIn
        ? currentSelection.filter((id) => id !== slide.id)
        : [...currentSelection, slide.id]

      if (alreadyIn) {
        if (selectedSlideId === slide.id) {
          const fallbackId = next[next.length - 1] || null
          const fallbackSlide = fallbackId
            ? allSlides.find((item) => item.id === fallbackId)
            : null
          setSlideSelection(fallbackSlide?.sectionId ?? null, fallbackId, next)
        }

        if (anchorSlideRef.current === slide.id) {
          anchorSlideRef.current = next[next.length - 1] || null
        }
      } else {
        setSlideSelection(sectionId, slide.id, next)
        anchorSlideRef.current = slide.id
      }

      if (alreadyIn && selectedSlideId !== slide.id) {
        setSelectedSlideIds(next)
      }
    } else if (rangeSelect) {
      const anchorId = anchorSlideRef.current || selectedSlideId || slide.id
      anchorSlideRef.current = anchorId
      const anchorIdx = allSlides.findIndex((sl) => sl.id === anchorId)
      const thisIdx = allSlides.findIndex((sl) => sl.id === slide.id)
      if (anchorIdx >= 0 && thisIdx >= 0) {
        const [start, end] = [Math.min(anchorIdx, thisIdx), Math.max(anchorIdx, thisIdx)]
        setSlideSelection(sectionId, slide.id, allSlides.slice(start, end + 1).map((sl) => sl.id))
      } else {
        setSlideSelection(sectionId, slide.id, [slide.id])
        anchorSlideRef.current = slide.id
      }
    } else {
      setSlideSelection(sectionId, slide.id, [slide.id])
      anchorSlideRef.current = slide.id
    }
  }

  function handleFilmstripKeyDown(event) {
    flushPendingNumericFieldCommit()
    if (event.key === 'Escape') {
      if (effectiveSelectedSlideIds.length > 1 && selectedSlideId) {
        event.preventDefault()
        const primary = getAllSlides(presentation).find((entry) => entry.id === selectedSlideId)
        setSlideSelection(primary?.sectionId ?? null, selectedSlideId, [selectedSlideId])
        anchorSlideRef.current = selectedSlideId
      }
      return
    }

    const meta = event.metaKey || event.ctrlKey
    if (!meta || event.key.toLowerCase() !== 'a') return

    const allSlides = getAllSlides(presentation)
    if (!allSlides.length) return

    event.preventDefault()
    const primary =
      allSlides.find((entry) => entry.id === selectedSlideId) ||
      allSlides[0]
    setSlideSelection(primary.sectionId, primary.id, allSlides.map((slide) => slide.id))
    anchorSlideRef.current = primary.id
  }

  function renderSongDropZone(index) {
    const active = externalSongDropIndex === index
    return (
      <div
        key={`song-drop-zone-${index}`}
        onDragOver={(event) => handleSongDropZoneDragOver(event, index)}
        onDrop={(event) => { void handleSongDropZoneDrop(event, index) }}
        style={{
          height: active ? 18 : 10,
          padding: '0 10px',
          transition: 'height 120ms ease',
        }}
      >
        <div
          style={{
            height: 3,
            width: '100%',
            borderRadius: 999,
            background: active ? 'var(--accent)' : 'transparent',
            boxShadow: active ? '0 0 0 1px rgba(74,124,255,0.2)' : 'none',
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDownCapture={() => flushPendingNumericFieldCommit()}
      onKeyDown={handleFilmstripKeyDown}
      data-tour="filmstrip"
      className="h-full overflow-hidden shrink-0 flex flex-col"
      style={{
        width,
        background: 'var(--bg-filmstrip)',
        borderRight: '1px solid var(--border-default)',
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Service Order
        </div>
        <button
          type="button"
          onClick={collapseAllSections}
          className="px-2.5 py-1 rounded text-[11px] font-medium"
          style={{ color: 'var(--text-primary)', background: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'var(--bg-app)'
          }}
        >
          {allSectionsCollapsed ? 'Expand All' : 'Collapse All'}
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={(event) => {
          if (!isSongLibraryDrag(event)) return
          event.preventDefault()
          collapseAllSectionsNow()
          if (!sectionsForPreview.length) setExternalSongDropIndex(0)
        }}
      >
        {sectionsForPreview.length === 0 ? renderSongDropZone(0) : null}
        {sectionsForPreview.map((section, sectionIndex) => {
          const isCollapsed = collapsed[section.id]
          const originalSection = sectionsById.get(section.id) || section
          const showPreviewAtEnd =
            activeSlideDrag &&
            slideDropTarget?.sectionId === section.id &&
            slideDropTarget?.targetSlideId === null

          return (
            <React.Fragment key={section.id}>
              {renderSongDropZone(sectionIndex)}
              <div
                draggable={!dragCandidate && !activeSlideDrag}
                onDragStart={() => onSectionDragStart(section.id)}
                onDragOver={(e) => onSectionDragOver(e, section.id)}
                onDrop={() => onSectionDrop(section.id)}
                onDragEnd={() => {
                  dragSection.current = null
                  setDragOverSection(null)
                }}
                style={{
                  opacity: dragOverSection === section.id && dragSection.current !== section.id ? 0.6 : 1,
                  outline: dragOverSection === section.id && dragSection.current !== section.id
                    ? '2px solid var(--accent)'
                    : 'none',
                }}
              >
              <SectionHeader
                section={originalSection}
                collapsed={isCollapsed}
                onToggle={() => toggleSection(section.id)}
                onAddSlide={() => addSlideToSection(originalSection)}
                onRemove={() => removeSection(section.id)}
                onEditSong={originalSection.type === 'song' ? () => handleEditSong(originalSection) : undefined}
              />

              {!isCollapsed && (
                <div className="pt-2">
                  {(() => {
                let lastLabel = null
                return section.slides.map((slide) => {
                  slideIndex++
                  const idx = slideIndex
                  const showPreviewBefore =
                    activeSlideDrag &&
                    slideDropTarget?.sectionId === section.id &&
                    slideDropTarget?.targetSlideId === slide.id

                  const displayLabel = getDisplaySlideLabel(slide)
                  const showSubHeader = Boolean(displayLabel && displayLabel !== lastLabel)
                  if (showSubHeader) lastLabel = displayLabel

                  return (
                    <React.Fragment key={slide.id}>
                      {showSubHeader && (
                        <div
                          className="mx-2 mt-1 mb-0.5 truncate"
                          style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: 2 }}
                        >
                          {displayLabel}
                        </div>
                      )}
                      {showPreviewBefore && activeSlideDrag?.slide ? (
                        <PreviewInsert
                          slide={activeSlideDrag.slide}
                          width={width}
                          presentation={presentation}
                        />
                      ) : null}
                      <div
                        ref={(node) => registerSlideNode(originalSection.id, slide.id, node)}
                        onMouseDown={(e) => onSlideMouseDown(e, originalSection.id, slide)}
                        style={{
                          opacity: activeSlideDrag ? 0.96 : 1,
                          transition: 'opacity 120ms ease',
                        }}
                      >
                        <FilmstripSlide
                          slide={slide}
                          sectionId={originalSection.id}
                          sectionType={originalSection.type}
                          mediaLibrary={mediaLibrary}
                          index={idx}
                          selected={selectedSlideId === slide.id}
                          isMultiSelected={effectiveSelectedSlideIds.includes(slide.id)}
                          mediaDropHighlighted={
                            mediaDropTargetSlideId === slide.id ||
                            (mediaDropTargetSlideId && effectiveSelectedSlideIds.length > 1 && effectiveSelectedSlideIds.includes(slide.id))
                          }
                          onMediaDragOver={(event) => handleMediaSlideDragOver(event, originalSection.id, slide.id)}
                          onMediaDrop={(event) => { void handleMediaSlideDrop(event, originalSection.id, slide.id) }}
                          onSelect={(e) => handleSelectSlide(e, originalSection.id, slide)}
                          onNewSlide={() => insertSlideAfter(originalSection, slide)}
                          onDoubleClick={() => {
                            flushPendingNumericFieldCommit()
                            setSlideSelection(originalSection.id, slide.id, [slide.id])
                            setEditingSlide(slide.id)
                          }}
                          onDuplicate={() => duplicateSlide(originalSection, slide)}
                          onDelete={() => deleteSlide(originalSection, slide)}
                          onEditSong={originalSection.type === 'song' ? () => handleEditSong(originalSection) : undefined}
                          onApplyTheme={
                            effectiveSelectedSlideIds.includes(slide.id) && effectiveSelectedSlideIds.length > 1
                              ? () => handleApplyTheme(originalSection.id, slide)
                              : undefined
                          }
                        />
                      </div>
                    </React.Fragment>
                  )
                })
              })()}
                </div>
              )}

              {!isCollapsed && showPreviewAtEnd && activeSlideDrag?.slide ? (
                <PreviewInsert
                  slide={activeSlideDrag.slide}
                  width={width}
                  presentation={presentation}
                />
              ) : null}

              {!isCollapsed && (
                <div
                  ref={(node) => registerSectionEndNode(originalSection.id, node)}
                  className="mx-2 mb-1 rounded"
                  style={{
                    height: showPreviewAtEnd ? 6 : activeSlideDrag ? 12 : 12,
                    background: 'transparent',
                    border: '1px dashed transparent',
                    transition: 'height 160ms ease',
                  }}
                />
              )}
              </div>
            </React.Fragment>
          )
        })}
        {sectionsForPreview.length ? renderSongDropZone(sectionsForPreview.length) : null}
      </div>

      {dragGhost?.slide ? (
        <div
          style={{
            position: 'fixed',
            left: dragGhost.x,
            top: dragGhost.y,
            pointerEvents: 'none',
            zIndex: 1200,
          }}
        >
          <GhostSlide slide={dragGhost.slide} width={width} presentation={presentation} floating />
        </div>
      ) : null}

      {editSong && (
        <SongEditorModal
          song={editSong}
          onClose={() => setEditSong(null)}
          onSave={() => setEditSong(null)}
        />
      )}
    </div>
  )
}
