import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { getMedia } from '@/utils/ipc'
import { getEffectiveBackgroundId, getMediaAssetUrl, isVideoMedia } from '@/utils/backgrounds'
import { getSectionColor, getSectionTypeLabel, isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationDimensions, getPresentationAspectRatio } from '@/utils/presentationSizing'
import { slideBodyToHtml } from '@/utils/slideMarkup'
import { clearEditorFormatting, runEditorCommand } from '@/utils/richTextEditor'
import { flattenSongGroupsToSlides, getSongSectionGroupsAndArrangement } from '@/utils/songSections'
import ContextMenu from '@/components/shared/ContextMenu'
import {
  clearSelectedSlide,
  copySelectedSlideToClipboard,
  deleteSelectedSlideFromCurrentPresentation,
  pasteSlideAfterSelected,
} from '@/utils/presentationCommands'
import {
  DEFAULT_TEXT_BOX,
  DEFAULT_TEXT_STYLE,
  getSlideTextBoxes,
  resolvePlaceholderText,
} from '@/utils/textBoxes'
import { flushPendingNumericFieldCommit } from '@/utils/pendingNumericCommit'
import SlideTextEditor from './SlideTextEditor'

const SNAP_THRESHOLD = 8
const MIN_TEXT_BOX_WIDTH = 20
const MIN_TEXT_BOX_HEIGHT = 20
const ROTATION_SNAP = 15
const DEFAULT_GHOST_OFFSET = 24
const MARQUEE_FILL = 'rgba(74,124,255,0.12)'
const MARQUEE_BORDER = 'rgba(74,124,255,0.9)'
const INDICATOR_STYLE = {
  position: 'absolute',
  padding: '14px 22px',
  borderRadius: 999,
  background: 'rgba(12, 18, 32, 0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '0.03em',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  boxShadow: '0 12px 28px rgba(0,0,0,0.32)',
}

function getSelectedSlide(presentation, selectedSectionId, selectedSlideId) {
  if (!presentation) return null
  const section = presentation.sections.find((item) => item.id === selectedSectionId)
  if (!section) return null
  return section.slides.find((item) => item.id === selectedSlideId) || null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getResizeHandleCode(handle) {
  return String(handle || '').replace(/^resize_/, '')
}

function getResizeHandleDirections(handle) {
  const code = getResizeHandleCode(handle)
  return {
    x: code.includes('e') ? 1 : code.includes('w') ? -1 : 0,
    y: code.includes('s') ? 1 : code.includes('n') ? -1 : 0,
  }
}

function resizeBoxFromCenter(box, handle, pointerX, pointerY, nativeW, nativeH, keepRatio = false) {
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const maxWidth = 2 * Math.min(centerX, nativeW - centerX)
  const maxHeight = 2 * Math.min(centerY, nativeH - centerY)
  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const direction = getResizeHandleDirections(handle)

  let width = box.width
  let height = box.height

  if (keepRatio && direction.x && direction.y) {
    const scaleX = halfWidth > 0 ? (halfWidth + direction.x * pointerX) / halfWidth : 1
    const scaleY = halfHeight > 0 ? (halfHeight + direction.y * pointerY) / halfHeight : 1
    let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
    const minScale = Math.max(
      MIN_TEXT_BOX_WIDTH / Math.max(1, box.width),
      MIN_TEXT_BOX_HEIGHT / Math.max(1, box.height)
    )
    const maxScale = Math.min(
      maxWidth / Math.max(1, box.width),
      maxHeight / Math.max(1, box.height)
    )

    scale = clamp(scale, minScale, maxScale)
    width = clamp(box.width * scale, MIN_TEXT_BOX_WIDTH, maxWidth)
    height = clamp(box.height * scale, MIN_TEXT_BOX_HEIGHT, maxHeight)
  } else {
    if (direction.x) {
      const nextHalfWidth = halfWidth + direction.x * pointerX
      width = clamp(nextHalfWidth * 2, MIN_TEXT_BOX_WIDTH, maxWidth)
    }
    if (direction.y) {
      const nextHalfHeight = halfHeight + direction.y * pointerY
      height = clamp(nextHalfHeight * 2, MIN_TEXT_BOX_HEIGHT, maxHeight)
    }
  }

  return {
    ...box,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }
}

function normalizeRect(startX, startY, endX, endY) {
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  return { x: left, y: top, width, height }
}

function rectsIntersect(a, b) {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

function boxBounds(box) {
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
  }
}

function resolveVerticalAlignment(textStyle) {
  if (textStyle?.valign === 'top') return 'flex-start'
  if (textStyle?.valign === 'bottom') return 'flex-end'
  return 'center'
}

function renderOutline(box) {
  const width = box.outlineWidth || 0
  if (!width || box.outlineColor === 'transparent') return 'none'
  return `${Math.max(1, width)}px ${box.outlineStyle || 'solid'} ${box.outlineColor || '#ffffff'}`
}

function renderShadow(box) {
  if (!box.shadowEnabled) return 'none'
  return `${box.shadowOffsetX || 0}px ${box.shadowOffsetY || 10}px ${Math.max(2, box.shadowBlur || 18)}px ${box.shadowColor || 'rgba(0,0,0,0.35)'}`
}

function renderTextDecoration(style) {
  return [style?.underline ? 'underline' : null, style?.strikethrough ? 'line-through' : null].filter(Boolean).join(' ') || 'none'
}

function baseHighlightStyle(style) {
  const color = style?.highlightColor
  if (!color || color === 'transparent') return null
  return {
    display: 'inline-block',
    maxWidth: '100%',
    backgroundColor: color,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    padding: '0 0.05em',
  }
}

function renderTextBody(bodyHtml, style) {
  const highlightStyle = baseHighlightStyle(style)
  if (!highlightStyle) {
    return <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  }

  return (
    <div style={{ width: '100%', textAlign: style?.align || 'center' }}>
      <span style={highlightStyle} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  )
}

function cycleCase(text, index) {
  const modes = ['sentence', 'lower', 'upper', 'title', 'toggle']
  const mode = modes[index % modes.length]
  if (mode === 'lower') return text.toLowerCase()
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'title') return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  if (mode === 'toggle') return text.split('').map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join('')
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function snapGroupToGuides(movingBoxes, otherBoxes, nativeWidth, nativeHeight) {
  if (!movingBoxes.length) return { dx: 0, dy: 0, guides: { vertical: null, horizontal: null } }

  const threshold = SNAP_THRESHOLD
  const group = movingBoxes.reduce((acc, box) => ({
    left: Math.min(acc.left, box.x),
    top: Math.min(acc.top, box.y),
    right: Math.max(acc.right, box.x + box.width),
    bottom: Math.max(acc.bottom, box.y + box.height),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
  const width = group.right - group.left
  const height = group.bottom - group.top
  const centerX = group.left + width / 2
  const centerY = group.top + height / 2

  const verticalCandidates = [
    { value: nativeWidth / 2, source: centerX, guide: nativeWidth / 2 },
  ]
  const horizontalCandidates = [
    { value: nativeHeight / 2, source: centerY, guide: nativeHeight / 2 },
  ]

  otherBoxes.forEach((box) => {
    const bounds = boxBounds(box)
    verticalCandidates.push(
      { value: bounds.left, source: group.left, guide: bounds.left },
      { value: bounds.right, source: group.right, guide: bounds.right },
      { value: bounds.centerX, source: centerX, guide: bounds.centerX }
    )
    horizontalCandidates.push(
      { value: bounds.top, source: group.top, guide: bounds.top },
      { value: bounds.bottom, source: group.bottom, guide: bounds.bottom },
      { value: bounds.centerY, source: centerY, guide: bounds.centerY }
    )
  })

  let bestVertical = { delta: 0, distance: Infinity, guide: null }
  let bestHorizontal = { delta: 0, distance: Infinity, guide: null }

  verticalCandidates.forEach((candidate) => {
    const delta = candidate.value - candidate.source
    const distance = Math.abs(delta)
    if (distance <= threshold && distance < bestVertical.distance) {
      bestVertical = { delta, distance, guide: candidate.guide }
    }
  })

  horizontalCandidates.forEach((candidate) => {
    const delta = candidate.value - candidate.source
    const distance = Math.abs(delta)
    if (distance <= threshold && distance < bestHorizontal.distance) {
      bestHorizontal = { delta, distance, guide: candidate.guide }
    }
  })

  return {
    dx: bestVertical.guide === null ? 0 : bestVertical.delta,
    dy: bestHorizontal.guide === null ? 0 : bestHorizontal.delta,
    guides: {
      vertical: bestVertical.guide,
      horizontal: bestHorizontal.guide,
    },
  }
}

function getRotationFromPointer(box, pointerX, pointerY, shiftKey) {
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const angle = Math.atan2(pointerY - centerY, pointerX - centerX) * (180 / Math.PI) + 90
  if (!shiftKey) return angle
  return Math.round(angle / ROTATION_SNAP) * ROTATION_SNAP
}

function handleCursor(mode) {
  if (mode === 'move') return 'move'
  if (mode === 'rotate') return 'crosshair'
  if (mode === 'resize_nw' || mode === 'resize_se') return 'nwse-resize'
  if (mode === 'resize_ne' || mode === 'resize_sw') return 'nesw-resize'
  if (mode === 'resize_n' || mode === 'resize_s') return 'ns-resize'
  if (mode === 'resize_e' || mode === 'resize_w') return 'ew-resize'
  return 'default'
}

export default function Canvas() {
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const editingSlideId = useEditorStore((s) => s.editingSlideId)
  const lastAddedTextBoxId = useEditorStore((s) => s.lastAddedTextBoxId)
  const suppressAutoEditSlideId = useEditorStore((s) => s.suppressAutoEditSlideId)
  const clearLastAddedTextBoxId = useEditorStore((s) => s.clearLastAddedTextBoxId)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const setSuppressAutoEditSlideId = useEditorStore((s) => s.setSuppressAutoEditSlideId)
  const setSelectedTextBoxIdsInStore = useEditorStore((s) => s.setSelectedTextBoxIds)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const updateSlideTextBoxes = useEditorStore((s) => s.updateSlideTextBoxes)
  const duplicateSlideTextBoxes = useEditorStore((s) => s.duplicateSlideTextBoxes)
  const removeSlideTextBoxes = useEditorStore((s) => s.removeSlideTextBoxes)
  const reorderSlideTextBoxes = useEditorStore((s) => s.reorderSlideTextBoxes)
  const mutateSections = useEditorStore((s) => s.mutateSections)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const slideClipboard = useAppStore((s) => s.slideClipboard)
  const textBoxClipboard = useAppStore((s) => s.textBoxClipboard)
  const setTextBoxClipboard = useAppStore((s) => s.setTextBoxClipboard)

  const [media, setMedia] = useState([])
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [menu, setMenu] = useState(null)
  const [selectedTextBoxIds, setSelectedTextBoxIds] = useState([])
  const [editingTextBoxId, setEditingTextBoxId] = useState(null)
  const [draftBoxes, setDraftBoxes] = useState(null)
  const [snapGuides, setSnapGuides] = useState({ vertical: null, horizontal: null })
  const [selectionRect, setSelectionRect] = useState(null)
  const [metric, setMetric] = useState(null)
  const [caseModeIndex, setCaseModeIndex] = useState(0)
  const [songOrderDragState, setSongOrderDragState] = useState(null)
  const [songOrderTrayCollapsed, setSongOrderTrayCollapsed] = useState(false)
  const [songSectionsCollapsed, setSongSectionsCollapsed] = useState(false)

  const canvasRef = useRef(null)
  const interactionRef = useRef(null)
  const pendingOutsideBlurRef = useRef(false)
  const previousSlideIdRef = useRef(null)
  const activeEditorCommitRef = useRef(null)
  const suppressBlurCommitRef = useRef(false)

  const slide = getSelectedSlide(presentation, selectedSectionId, selectedSlideId)
  const section = presentation?.sections?.find((item) => item.id === selectedSectionId) || null
  const mediaOnlySlide = isMediaSlide(slide)
  const resolvedSongId = section?.songId || slide?.songId || null
  const songSectionData = useMemo(
    () => (section?.type === 'song' && resolvedSongId ? getSongSectionGroupsAndArrangement(section) : null),
    [resolvedSongId, section]
  )
  const effectiveBackgroundId = getEffectiveBackgroundId(presentation, selectedSectionId, slide)
  const backgroundMedia = useMemo(() => media.find((item) => item.id === effectiveBackgroundId) || null, [media, effectiveBackgroundId])
  const slideMedia = useMemo(() => media.find((item) => item.id === slide?.mediaId) || null, [media, slide?.mediaId])
  const textBoxes = useMemo(() => getSlideTextBoxes(slide), [slide])
  const renderedBoxes = draftBoxes || textBoxes
  const primaryTextBoxId = selectedTextBoxIds[selectedTextBoxIds.length - 1] || selectedTextBoxIds[0] || null
  const primaryTextBox = renderedBoxes.find((box) => box.id === primaryTextBoxId) || null
  const isEditing = editingSlideId === selectedSlideId && Boolean(editingTextBoxId)
  const showSongOrderTray = Boolean(section?.type === 'song' && resolvedSongId && songSectionData)
  const songOrderDisabled = !showSongOrderTray || isEditing
  const songOrderEntries = useMemo(
    () => songSectionData?.arrangement?.map((groupId, index) => ({
      index,
      groupId,
      group: songSectionData.groups.find((entry) => entry.id === groupId) || null,
    })).filter((entry) => entry.group) || [],
    [songSectionData]
  )

  const { width: nativeW, height: nativeH } = getPresentationDimensions(presentation || slide || undefined)
  const scale = canvasWidth > 0 ? canvasWidth / nativeW : 1

  function registerEditorCommitHandler(handler) {
    activeEditorCommitRef.current = handler || null
  }

  function commitActiveEditor() {
    activeEditorCommitRef.current?.()
  }

  function finishInlineEditing(nextSelectedIds = []) {
    flushPendingNumericFieldCommit()
    if (!editingTextBoxId) return
    suppressBlurCommitRef.current = true
    commitActiveEditor()
    const active = document.activeElement
    if (active?.isContentEditable) active.blur()
    activeEditorCommitRef.current = null
    setEditingTextBoxId(null)
    setEditingSlide(null)
    setSelectedTextBoxIds(nextSelectedIds)
  }

  function applySongArrangement(nextArrangement) {
    if (!songSectionData || !resolvedSongId || !selectedSectionId) return

    const flattened = flattenSongGroupsToSlides(songSectionData.groups, nextArrangement, {
      preserveEmptyArrangement: true,
      songId: resolvedSongId,
    })
    const currentGroupId = slide?.groupId || flattened.arrangement[0] || null
    const nextSelected =
      flattened.slides.find((entry) => entry.groupId === currentGroupId) ||
      flattened.slides[0] ||
      null

    mutateSections((sections) =>
      sections.map((entry) => (
        entry.id === selectedSectionId
          ? {
              ...entry,
              songId: resolvedSongId,
              songGroups: flattened.groups,
              songOrder: flattened.arrangement,
              slides: flattened.slides,
            }
          : entry
      ))
    )

    if (nextSelected) {
      setSelectedSlide(selectedSectionId, nextSelected.id)
    } else {
      setSelectedSlide(selectedSectionId, null)
    }
  }

  function handleSongArrangementDrop(index) {
    if (!songSectionData || !songOrderDragState || songOrderDisabled) return

    if (songOrderDragState.kind === 'arrangement') {
      const current = [...songSectionData.arrangement]
      const fromIndex = songOrderDragState.index
      if (fromIndex < 0 || fromIndex >= current.length) {
        setSongOrderDragState(null)
        return
      }
      const [moved] = current.splice(fromIndex, 1)
      const insertIndex = fromIndex < index ? index - 1 : index
      current.splice(insertIndex, 0, moved)
      applySongArrangement(current)
    } else if (songOrderDragState.kind === 'available') {
      const current = [...songSectionData.arrangement]
      current.splice(index, 0, songOrderDragState.groupId)
      applySongArrangement(current)
    }

    setSongOrderDragState(null)
  }

  useEffect(() => {
    if (!canvasRef.current) return undefined

    const node = canvasRef.current
    const measure = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0) setCanvasWidth(rect.width)
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(node)
    window.addEventListener('resize', measure)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    async function loadMedia() {
      const result = await getMedia()
      if (result?.success) setMedia(result.data)
    }
    loadMedia()
  }, [mediaLibraryOpen])

  useEffect(() => {
    interactionRef.current = null
    setDraftBoxes(null)
    setSelectedTextBoxIds([])
    setSelectedTextBoxIdsInStore([])
    setEditingTextBoxId(null)
    setSnapGuides({ vertical: null, horizontal: null })
    setSelectionRect(null)
    setMetric(null)
    setEditingSlide(null)
    setSongOrderDragState(null)
    activeEditorCommitRef.current = null
    suppressBlurCommitRef.current = false
  }, [selectedSectionId, selectedSlideId, setEditingSlide, setSelectedTextBoxIdsInStore])

  useEffect(() => {
    setSongOrderTrayCollapsed(false)
    setSongSectionsCollapsed(false)
  }, [selectedSectionId])

  useEffect(() => {
    setSelectedTextBoxIdsInStore(selectedTextBoxIds)
  }, [selectedTextBoxIds, setSelectedTextBoxIdsInStore])

  useEffect(() => {
    const currentSlideId = slide?.id ?? null
    const slideChanged = previousSlideIdRef.current !== currentSlideId
    previousSlideIdRef.current = currentSlideId

    if (!slideChanged || !slide || mediaOnlySlide) return
    if (textBoxes.length !== 1) return

    const [box] = textBoxes
    if ((box.body || '').trim()) return

    if (suppressAutoEditSlideId === slide.id) {
      setSelectedTextBoxIds([box.id])
      setEditingSlide(null)
      setSuppressAutoEditSlideId(null)
      return
    }

    setSelectedTextBoxIds([box.id])
    setEditingSlide(slide.id)
  }, [mediaOnlySlide, setEditingSlide, setSuppressAutoEditSlideId, slide?.id, suppressAutoEditSlideId, textBoxes])

  useEffect(() => {
    if (!lastAddedTextBoxId || !slide || mediaOnlySlide) return

    const addedBox = textBoxes.find((box) => box.id === lastAddedTextBoxId)
    if (!addedBox) return

    setDraftBoxes(null)
    setEditingTextBoxId(null)
    setSelectedTextBoxIds([lastAddedTextBoxId])
    setSnapGuides({ vertical: null, horizontal: null })
    setSelectionRect(null)
    setMetric(null)
    setEditingSlide(null)
    clearLastAddedTextBoxId()
  }, [
    clearLastAddedTextBoxId,
    lastAddedTextBoxId,
    mediaOnlySlide,
    setEditingSlide,
    slide,
    textBoxes,
  ])

  useEffect(() => {
    if (!slide || mediaOnlySlide) return undefined

    function handlePointerMove(event) {
      const state = interactionRef.current
      if (!state) return

      const pointerX = (event.clientX - state.startClientX) / state.scale
      const pointerY = (event.clientY - state.startClientY) / state.scale

      if (state.type === 'marquee') {
        const rect = normalizeRect(state.originX, state.originY, state.originX + pointerX, state.originY + pointerY)
        setSelectionRect(rect)
        return
      }

      if (state.type === 'move') {
        const moved = state.boxes.map((box) => ({ ...box, x: clamp(box.x + pointerX, 0, nativeW - box.width), y: clamp(box.y + pointerY, 0, nativeH - box.height) }))
        const snapped = snapGroupToGuides(moved, state.otherBoxes, nativeW, nativeH)
        const next = moved.map((box) => ({ ...box, x: clamp(box.x + snapped.dx, 0, nativeW - box.width), y: clamp(box.y + snapped.dy, 0, nativeH - box.height) }))
        setDraftBoxes(renderedBoxes.map((box) => next.find((candidate) => candidate.id === box.id) || box))
        setSnapGuides(snapped.guides)
        const lead = next[0]
        if (lead) setMetric({ type: 'move', x: Math.round(lead.x), y: Math.round(lead.y) })
        return
      }

      if (state.type === 'resize') {
        const box = state.box
        const modifierSymmetric = event.metaKey || event.ctrlKey
        const keepRatio = state.corner && (event.shiftKey || modifierSymmetric)
        const handleCode = getResizeHandleCode(state.handle)

        if (modifierSymmetric) {
          const updated = resizeBoxFromCenter(box, state.handle, pointerX, pointerY, nativeW, nativeH, keepRatio)
          setDraftBoxes(renderedBoxes.map((item) => item.id === box.id ? updated : item))
          setSnapGuides({ vertical: null, horizontal: null })
          setMetric({ type: 'resize', width: Math.round(updated.width), height: Math.round(updated.height) })
          return
        }

        let x = box.x
        let y = box.y
        let width = box.width
        let height = box.height
        const ratio = box.width / Math.max(1, box.height)

        if (handleCode.includes('e')) width = clamp(box.width + pointerX, MIN_TEXT_BOX_WIDTH, nativeW - x)
        if (handleCode.includes('s')) height = clamp(box.height + pointerY, MIN_TEXT_BOX_HEIGHT, nativeH - y)
        if (handleCode.includes('w')) {
          const nextWidth = clamp(box.width - pointerX, MIN_TEXT_BOX_WIDTH, box.x + box.width)
          x = box.x + box.width - nextWidth
          width = nextWidth
        }
        if (handleCode.includes('n')) {
          const nextHeight = clamp(box.height - pointerY, MIN_TEXT_BOX_HEIGHT, box.y + box.height)
          y = box.y + box.height - nextHeight
          height = nextHeight
        }

        if (keepRatio) {
          if (Math.abs(pointerX) > Math.abs(pointerY)) {
            height = clamp(width / ratio, MIN_TEXT_BOX_HEIGHT, nativeH - y)
          } else {
            width = clamp(height * ratio, MIN_TEXT_BOX_WIDTH, nativeW - x)
          }
          if (handleCode.includes('w')) x = box.x + box.width - width
          if (handleCode.includes('n')) y = box.y + box.height - height
        }

        const updated = { ...box, x, y, width, height }
        setDraftBoxes(renderedBoxes.map((item) => item.id === box.id ? updated : item))
        setSnapGuides({ vertical: null, horizontal: null })
        setMetric({ type: 'resize', width: Math.round(width), height: Math.round(height) })
        return
      }

      if (state.type === 'rotate') {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const localX = (event.clientX - rect.left) / state.scale
        const localY = (event.clientY - rect.top) / state.scale
        const nextAngle = getRotationFromPointer(state.box, localX, localY, event.shiftKey)
        const updated = { ...state.box, rotation: nextAngle }
        setDraftBoxes(renderedBoxes.map((item) => item.id === state.box.id ? updated : item))
        setMetric({ type: 'rotate', rotation: Math.round(nextAngle) })
      }
    }

    function handlePointerUp() {
      const state = interactionRef.current
      if (!state) return
      interactionRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      if (state.type === 'marquee') {
        const rect = selectionRect
        if (rect && (rect.width > 3 || rect.height > 3)) {
          const touched = textBoxes
            .filter((box) => rectsIntersect(rect, { x: box.x, y: box.y, width: box.width, height: box.height }))
            .map((box) => box.id)
          setSelectedTextBoxIds(touched)
        } else if (!pendingOutsideBlurRef.current) {
          setSelectedTextBoxIds([])
        }
        setSelectionRect(null)
        return
      }

      if (draftBoxes) {
        updateSlideTextBoxes(selectedSectionId, selectedSlideId, () => draftBoxes)
      }

      setDraftBoxes(null)
      setSnapGuides({ vertical: null, horizontal: null })
      setMetric(null)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [draftBoxes, mediaOnlySlide, nativeH, nativeW, renderedBoxes, selectedSectionId, selectedSlideId, selectionRect, slide, textBoxes, updateSlideTextBoxes])

  useEffect(() => {
    function handleKeyDown(event) {
      if (!slide || mediaOnlySlide) return
      const meta = event.metaKey || event.ctrlKey

      if (event.key === 'Escape') {
        if (isEditing) {
          event.preventDefault()
          const active = document.activeElement
          if (active?.isContentEditable) active.blur()
          setEditingTextBoxId(null)
          setEditingSlide(null)
          return
        }
        if (selectedTextBoxIds.length) {
          event.preventDefault()
          setSelectedTextBoxIds([])
        }
        return
      }

      if (isEditing && meta) {
        const lower = event.key.toLowerCase()
        if (lower === 'b') { event.preventDefault(); if (!runEditorCommand('bold')) useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { bold: !primaryTextBox?.textStyle?.bold }, selectedTextBoxIds); return }
        if (lower === 'i') { event.preventDefault(); if (!runEditorCommand('italic')) useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { italic: !primaryTextBox?.textStyle?.italic }, selectedTextBoxIds); return }
        if (lower === 'u') { event.preventDefault(); if (!runEditorCommand('underline')) useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { underline: !primaryTextBox?.textStyle?.underline }, selectedTextBoxIds); return }
        if (lower === 'l' || lower === 'e' || lower === 'r' || lower === 'j') {
          event.preventDefault()
          const commandMap = { l: 'justifyLeft', e: 'justifyCenter', r: 'justifyRight', j: 'justifyFull' }
          const styleMap = { l: 'left', e: 'center', r: 'right', j: 'justify' }
          if (!runEditorCommand(commandMap[lower])) {
            useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { align: styleMap[lower] }, selectedTextBoxIds)
          }
          return
        }
        if (event.key === ' ') { event.preventDefault(); if (!clearEditorFormatting()) useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, DEFAULT_TEXT_STYLE, selectedTextBoxIds); return }
      }

      if (meta && event.key.toLowerCase() === 'v' && textBoxClipboard?.length) {
        event.preventDefault()
        const stamp = Date.now()
        const pastedIds = textBoxClipboard.map((box, index) => `${box.id}-paste-${stamp}-${index}`)
        updateSlideTextBoxes(selectedSectionId, selectedSlideId, (boxes) => {
          const maxZ = boxes.reduce((max, box) => Math.max(max, box.zIndex ?? 0), -1)
          const clones = textBoxClipboard.map((box, index) => ({
            ...box,
            id: pastedIds[index],
            x: box.x + DEFAULT_GHOST_OFFSET,
            y: box.y + DEFAULT_GHOST_OFFSET,
            zIndex: maxZ + index + 1,
          }))
          return [...boxes, ...clones]
        })
        setSelectedTextBoxIds(pastedIds)
        return
      }

      if (!selectedTextBoxIds.length) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (isEditing) return
        event.preventDefault()
        event.stopPropagation()
        removeSlideTextBoxes(selectedSectionId, selectedSlideId, selectedTextBoxIds)
        setSelectedTextBoxIds([])
        return
      }

      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        setTextBoxClipboard(JSON.parse(JSON.stringify(textBoxes.filter((box) => selectedTextBoxIds.includes(box.id)))))
        return
      }

      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSlideTextBoxes(selectedSectionId, selectedSlideId, selectedTextBoxIds)
        return
      }

      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { bold: !primaryTextBox?.textStyle?.bold }, selectedTextBoxIds)
        return
      }
      if (meta && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { italic: !primaryTextBox?.textStyle?.italic }, selectedTextBoxIds)
        return
      }
      if (meta && event.key.toLowerCase() === 'u') {
        event.preventDefault()
        useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { underline: !primaryTextBox?.textStyle?.underline }, selectedTextBoxIds)
        return
      }
      if (meta && event.key === ' ') {
        event.preventDefault()
        useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, DEFAULT_TEXT_STYLE, selectedTextBoxIds)
        return
      }
      if (meta && ['l', 'e', 'r', 'j'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        const map = { l: 'left', e: 'center', r: 'right', j: 'justify' }
        useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { align: map[event.key.toLowerCase()] }, selectedTextBoxIds)
        return
      }
      if (event.shiftKey && event.key === 'F3' && primaryTextBox) {
        event.preventDefault()
        const nextIndex = (caseModeIndex + 1) % 5
        setCaseModeIndex(nextIndex)
        updateSlideBody(selectedSectionId, selectedSlideId, cycleCase(primaryTextBox.body || '', nextIndex), primaryTextBox.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [caseModeIndex, duplicateSlideTextBoxes, isEditing, mediaOnlySlide, primaryTextBox, removeSlideTextBoxes, selectedSectionId, selectedSlideId, selectedTextBoxIds, setEditingSlide, setTextBoxClipboard, slide, textBoxClipboard, textBoxes, updateSlideBody, updateSlideTextBoxes])

  useEffect(() => {
    function clearActiveSelection() {
      flushPendingNumericFieldCommit()
      if (editingTextBoxId) {
        finishInlineEditing([])
        return
      }
      setSelectedTextBoxIds([])
      setEditingSlide(null)
    }

    function onDocMouseDown(e) {
      if (!selectedTextBoxIds.length && !editingTextBoxId) return
      if (e.target.closest?.('[data-textbox-root="true"]')) return
      if (e.target.closest?.('[data-editor-toolbar="true"]')) return
      if (e.target.closest?.('[data-context-menu="true"]')) return
      clearActiveSelection()
    }

    function onWindowBlur() {
      if (!selectedTextBoxIds.length && !editingTextBoxId) return
      clearActiveSelection()
    }

    function onVisibilityChange() {
      if (document.visibilityState !== 'hidden') return
      if (!selectedTextBoxIds.length && !editingTextBoxId) return
      clearActiveSelection()
    }

    document.addEventListener('mousedown', onDocMouseDown, true)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [editingTextBoxId, selectedTextBoxIds, setEditingSlide])

  function beginInteraction(event, type, options = {}) {
    event.preventDefault()
    event.stopPropagation()
    pendingOutsideBlurRef.current = false
    interactionRef.current = {
      type,
      scale: scale || 1,
      startClientX: event.clientX,
      startClientY: event.clientY,
      ...options,
    }
    document.body.style.cursor = handleCursor(type === 'resize' ? options.handle : type)
    document.body.style.userSelect = 'none'
  }

  function selectOnly(textBoxId) {
    setSelectedTextBoxIds(textBoxId ? [textBoxId] : [])
  }

  function handleBlankMouseDown(event) {
    if (event.button !== 0) return
    if (event.target.closest?.('[data-textbox-root="true"]')) return
    pendingOutsideBlurRef.current = true
    flushPendingNumericFieldCommit()

    if (isEditing) {
      finishInlineEditing([])
      pendingOutsideBlurRef.current = false
      return
    }

    setSelectedTextBoxIds([])
    setEditingSlide(null)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = (event.clientX - rect.left) / scale
    const localY = (event.clientY - rect.top) / scale
    setSelectionRect({ x: localX, y: localY, width: 0, height: 0 })
    beginInteraction(event, 'marquee', { originX: localX, originY: localY })
  }

  function handleTextBoxMouseDown(event, textBox) {
    if (event.button !== 0) return
    flushPendingNumericFieldCommit()
    if (isEditing && editingTextBoxId === textBox.id) return
    if (isEditing) {
      finishInlineEditing([textBox.id])
    }
    const alreadySelected = selectedTextBoxIds.includes(textBox.id)

    if (event.shiftKey) {
      setEditingSlide(slide?.id || null)
      setSelectedTextBoxIds((current) => current.includes(textBox.id) ? current.filter((id) => id !== textBox.id) : [...current, textBox.id])
      return
    }

    const nextIds = alreadySelected && selectedTextBoxIds.length ? selectedTextBoxIds : [textBox.id]
    setSelectedTextBoxIds(nextIds)
    setEditingSlide(slide?.id || null)

    beginInteraction(event, 'move', {
      boxes: renderedBoxes.filter((box) => nextIds.includes(box.id)),
      otherBoxes: renderedBoxes.filter((box) => !nextIds.includes(box.id)),
    })
  }

  function handleTextBoxDoubleClick(event, textBoxId) {
    flushPendingNumericFieldCommit()
    if (isEditing && editingTextBoxId === textBoxId) return
    event.preventDefault()
    event.stopPropagation()
    if (isEditing && editingTextBoxId !== textBoxId) {
      finishInlineEditing([textBoxId])
    }
    setSelectedTextBoxIds([textBoxId])
    setEditingTextBoxId(textBoxId)
    setEditingSlide(slide.id)
  }

  function handleSaveText(body, textBoxId) {
    updateSlideBody(selectedSectionId, selectedSlideId, body, textBoxId)
  }

  function handleTabDirection(direction) {
    const ids = renderedBoxes.map((box) => box.id)
    if (!ids.length || !editingTextBoxId) return
    const currentIndex = ids.indexOf(editingTextBoxId)
    const nextIndex = (currentIndex + direction + ids.length) % ids.length
    const nextId = ids[nextIndex]
    setSelectedTextBoxIds([nextId])
    setEditingTextBoxId(nextId)
    setEditingSlide(slide.id)
  }

  function handleTextBoxContextMenu(event, textBoxId) {
    event.preventDefault()
    event.stopPropagation()
    if (!selectedTextBoxIds.includes(textBoxId)) setSelectedTextBoxIds([textBoxId])
    setMenu({ x: event.clientX, y: event.clientY, target: 'textbox' })
  }

  function renderTextBox(box) {
    const selected = selectedTextBoxIds.includes(box.id)
    const editing = editingTextBoxId === box.id && isEditing
    const style = box.textStyle || {}
    const placeholder = !box.body
    const showSingleSelectionChrome = selected && selectedTextBoxIds.length === 1

    return (
      <div
        key={box.id}
        data-textbox-root="true"
        onMouseDown={(event) => handleTextBoxMouseDown(event, box)}
        onDoubleClick={(event) => handleTextBoxDoubleClick(event, box.id)}
        onContextMenu={(event) => handleTextBoxContextMenu(event, box.id)}
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          cursor: editing ? 'text' : 'move',
          overflow: 'visible',
          transform: box.rotation ? `rotate(${box.rotation}deg)` : 'none',
          transformOrigin: 'center center',
          opacity: box.opacity ?? 1,
          userSelect: editing ? 'text' : 'none',
          zIndex: showSingleSelectionChrome ? 20 : box.zIndex + 1,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: resolveVerticalAlignment(style),
            paddingTop: box.paddingTop || DEFAULT_TEXT_BOX.paddingTop,
            paddingRight: box.paddingRight || DEFAULT_TEXT_BOX.paddingRight,
            paddingBottom: box.paddingBottom || DEFAULT_TEXT_BOX.paddingBottom,
            paddingLeft: box.paddingLeft || DEFAULT_TEXT_BOX.paddingLeft,
            textAlign: style.align || 'center',
            color: placeholder ? '#888888' : style.color || '#ffffff',
            fontSize: style.size || DEFAULT_TEXT_STYLE.size,
            fontWeight: style.bold ? 700 : 400,
            fontStyle: placeholder ? 'italic' : (style.italic ? 'italic' : 'normal'),
            textDecoration: renderTextDecoration(style),
            lineHeight: style.lineHeight || DEFAULT_TEXT_STYLE.lineHeight,
            fontFamily: style.fontFamily || 'Arial, sans-serif',
            wordBreak: box.wrapText === false ? 'normal' : 'break-word',
            whiteSpace: box.wrapText === false ? 'nowrap' : 'normal',
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
            background: box.backgroundColor || 'transparent',
            border: renderOutline(box),
            borderRadius: box.cornerRadius ?? DEFAULT_TEXT_BOX.cornerRadius,
            boxShadow: renderShadow(box),
            overflow: 'hidden',
            writingMode: box.textDirection === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
          }}
        >
          {editing ? (
            <SlideTextEditor
              textBox={box}
              onSave={(body) => handleSaveText(body, box.id)}
              onBlurCommit={() => {
                if (suppressBlurCommitRef.current) {
                  suppressBlurCommitRef.current = false
                  return
                }
                setEditingTextBoxId(null)
                setEditingSlide(null)
                setSelectedTextBoxIds([])
              }}
              onEscape={() => {
                setEditingTextBoxId(null)
                setEditingSlide(null)
                setSelectedTextBoxIds([box.id])
              }}
              onTabNext={handleTabDirection}
              registerCommitHandler={registerEditorCommitHandler}
            />
          ) : placeholder ? (
            <span>{resolvePlaceholderText(box.placeholderText)}</span>
          ) : (
            renderTextBody(slideBodyToHtml(box.body), style)
          )}
        </div>

        {selected && (
          <div
            style={{
              position: 'absolute',
              inset: -1,
              borderRadius: (box.cornerRadius ?? DEFAULT_TEXT_BOX.cornerRadius) + 1,
              border: '2px solid rgba(74,124,255,0.92)',
              boxShadow: '0 0 0 3px rgba(74,124,255,0.14)',
              pointerEvents: 'none',
            }}
          />
        )}

        {showSingleSelectionChrome && (
          <>
            <ResizeHandles
              onBegin={(event, handle) => beginInteraction(event, 'resize', { box, handle, corner: ['resize_nw', 'resize_ne', 'resize_se', 'resize_sw'].includes(handle) })}
            />
            <RotationHandle onBegin={(event) => beginInteraction(event, 'rotate', { box })} />
          </>
        )}
      </div>
    )
  }

  if (!presentation) {
    return <EmptyState message="Open a presentation to get started" />
  }

  if (!slide && !showSongOrderTray) {
    return <EmptyState message="Select a slide from the service order" />
  }

  return (
    <div data-tour="canvas" className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {showSongOrderTray ? (
        <SongOrderTray
          groups={songSectionData.groups}
          entries={songOrderEntries}
          disabled={songOrderDisabled}
          collapsed={songOrderTrayCollapsed}
          onToggleCollapsed={() => setSongOrderTrayCollapsed((current) => !current)}
          sectionsCollapsed={songSectionsCollapsed}
          onToggleSections={() => setSongSectionsCollapsed((current) => !current)}
          onAddGroup={(groupId) => {
            if (songOrderDisabled) return
            applySongArrangement([...(songSectionData?.arrangement || []), groupId])
          }}
          onRemoveEntry={(index) => {
            if (songOrderDisabled) return
            applySongArrangement(songSectionData.arrangement.filter((_, entryIndex) => entryIndex !== index))
          }}
          onArrangementDrop={handleSongArrangementDrop}
          setDragState={setSongOrderDragState}
        />
      ) : null}

        <div
          className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-6"
          onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, target: 'slide' }) }}
        >
          {slide ? (
            <div
              ref={canvasRef}
              className="relative rounded shadow-2xl overflow-hidden"
              style={{ width: '100%', maxHeight: '100%', aspectRatio: getPresentationAspectRatio(presentation), background: '#1a1a1a' }}
            >
              <div
                onMouseDown={handleBlankMouseDown}
                style={{ position: 'absolute', top: 0, left: 0, width: nativeW, height: nativeH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                {!mediaOnlySlide && backgroundMedia && <CanvasBackground media={backgroundMedia} />}
                {!mediaOnlySlide && <div style={{ position: 'absolute', inset: 0, background: backgroundMedia ? 'rgba(0,0,0,0.18)' : 'transparent' }} />}

                {mediaOnlySlide ? (
                  slideMedia ? <CanvasBackground media={slideMedia} /> : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>Media slide</div>
                ) : (
                  <>
                    {snapGuides.vertical !== null && <GuideLine direction="vertical" position={snapGuides.vertical} />}
                    {snapGuides.horizontal !== null && <GuideLine direction="horizontal" position={snapGuides.horizontal} />}
                    {selectionRect && <SelectionRect rect={selectionRect} />}
                    {renderedBoxes.map(renderTextBox)}
                    {metric && primaryTextBox && (
                      <div style={{ ...INDICATOR_STYLE, left: primaryTextBox.x + 8, top: primaryTextBox.y - 72 }}>
                        {metric.type === 'move' && `X ${metric.x} · Y ${metric.y}`}
                        {metric.type === 'resize' && `${metric.width} × ${metric.height}`}
                        {metric.type === 'rotate' && `${metric.rotation}°`}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className="w-full max-w-[980px] rounded-2xl border border-dashed flex items-center justify-center px-8 py-16 text-center"
              style={{
                minHeight: 300,
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-secondary)',
              }}
            >
              <div>
                <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Arrangement is empty
                </p>
                <p className="text-sm leading-6">
                  Add sections from the available list above to build this presentation&apos;s version of the song.
                </p>
              </div>
            </div>
          )}
        </div>

        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menu.target === 'textbox'
              ? [
                  { label: 'Bring to Front', onClick: () => reorderSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds, 'front') },
                  { label: 'Bring Forward', onClick: () => reorderSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds, 'forward') },
                  { label: 'Send Backward', onClick: () => reorderSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds, 'backward') },
                  { label: 'Send to Back', onClick: () => reorderSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds, 'back') },
                  { divider: true },
                  { label: 'Duplicate Text Box', onClick: () => duplicateSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds) },
                  { label: 'Delete Text Box', onClick: () => { removeSlideTextBoxes(selectedSectionId, slide.id, selectedTextBoxIds); setSelectedTextBoxIds([]) }, danger: true },
                ]
              : [
                  { label: 'Set Background', onClick: () => setMediaLibraryOpen(true) },
                  { divider: true },
                  { label: 'Copy Slide', onClick: () => copySelectedSlideToClipboard() },
                  { label: 'Paste Slide', onClick: () => pasteSlideAfterSelected(), disabled: !slideClipboard },
                  { label: 'Clear Slide', onClick: () => clearSelectedSlide() },
                  { label: 'Delete Slide', onClick: () => deleteSelectedSlideFromCurrentPresentation(), danger: true },
                ]}
            onClose={() => setMenu(null)}
          />
        )}

        <div
          className="shrink-0 px-4 py-2"
          style={{ background: 'var(--bg-toolbar)', borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 justify-between flex-wrap">
            <div className="min-w-[220px] flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>
                {section ? `${getSectionTypeLabel(section.type)} Background` : 'Section Background'}
              </div>
              <div className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-tertiary)' }}>
                {mediaOnlySlide ? slideMedia?.name || 'Media slide' : backgroundMedia ? backgroundMedia.name : 'No background'}
              </div>
            </div>
            <button
              className="shrink-0 text-xs px-3 py-1.5 rounded-md font-medium"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'var(--bg-surface)')}
              onClick={() => setMediaLibraryOpen(true)}
            >
              {mediaOnlySlide ? 'Change Media' : 'Set Background'}
            </button>
          </div>
        </div>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{message}</p>
    </div>
  )
}

function SongOrderTray({
  groups,
  entries,
  disabled,
  collapsed,
  onToggleCollapsed,
  sectionsCollapsed,
  onToggleSections,
  onAddGroup,
  onRemoveEntry,
  onArrangementDrop,
  setDragState,
}) {
  return (
    <div
      className="shrink-0 px-4 py-3"
      style={{
        background: 'var(--bg-toolbar)',
        opacity: disabled ? 0.58 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
          style={{
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            <div className="min-w-0">
              <p className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                Song Order
              </p>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                {entries.length} arranged · {groups.length} available
              </p>
            </div>
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
            {collapsed ? 'Show' : 'Hide'}
          </span>
        </button>

        {!collapsed ? (
          <div
            className="px-4 pb-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <div className="max-h-[320px] overflow-y-auto pt-3 pr-1">
              <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Drag to arrange section groups above the selected slide preview.
              </p>

              <div
                className="mb-4 rounded-xl"
                style={{
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                }}
              >
                <button
                  type="button"
                  onClick={onToggleSections}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <div className="flex items-center gap-2">
                    {sectionsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                      Available Sections
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {groups.length} section{groups.length === 1 ? '' : 's'}
                  </span>
                </button>

                {!sectionsCollapsed ? (
                  <div
                    className="flex flex-wrap gap-2 border-t px-3 py-3"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        draggable={!disabled}
                        onDragStart={() => setDragState({ kind: 'available', groupId: group.id })}
                        onDragEnd={() => setDragState(null)}
                        onClick={() => onAddGroup(group.id)}
                        className="text-sm px-3 py-1.5 rounded-full"
                        style={{
                          background: `${getSectionColor(group.type)}22`,
                          border: `1px solid ${getSectionColor(group.type)}55`,
                          color: 'var(--text-primary)',
                          cursor: disabled ? 'default' : 'grab',
                        }}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-[11px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
                    Arrangement
                  </p>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {entries.length} item{entries.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  className="rounded-xl p-3.5"
                  style={{
                    border: '1px dashed var(--border-default)',
                    background: 'var(--bg-surface)',
                    minHeight: 112,
                    maxHeight: 112,
                    overflowY: 'auto',
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onArrangementDrop(entries.length)}
                >
                  <div className="flex flex-wrap content-start gap-2 min-h-[28px]">
                    {entries.map((entry) => (
                      <div
                        key={`${entry.groupId}-${entry.index}`}
                        draggable={!disabled}
                        onDragStart={() => setDragState({ kind: 'arrangement', index: entry.index })}
                        onDragEnd={() => setDragState(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onArrangementDrop(entry.index)
                        }}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1.5"
                        style={{
                          background: `${getSectionColor(entry.group.type)}22`,
                          border: `1px solid ${getSectionColor(entry.group.type)}55`,
                          color: 'var(--text-primary)',
                          cursor: disabled ? 'default' : 'grab',
                        }}
                      >
                        <GripVertical size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-sm">{entry.group.label}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemoveEntry(entry.index)
                          }}
                          className="text-sm"
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
          </div>
        ) : null}
      </div>
    </div>
  )
}

const RESIZE_HANDLES = [
  { handle: 'resize_nw', style: { top: -6, left: -6, cursor: 'nwse-resize' } },
  { handle: 'resize_n', style: { top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
  { handle: 'resize_ne', style: { top: -6, right: -6, cursor: 'nesw-resize' } },
  { handle: 'resize_e', style: { top: '50%', right: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
  { handle: 'resize_se', style: { bottom: -6, right: -6, cursor: 'nwse-resize' } },
  { handle: 'resize_s', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
  { handle: 'resize_sw', style: { bottom: -6, left: -6, cursor: 'nesw-resize' } },
  { handle: 'resize_w', style: { top: '50%', left: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
]

function ResizeHandles({ onBegin }) {
  return RESIZE_HANDLES.map(({ handle, style }) => (
    <div
      key={handle}
      onMouseDown={(event) => onBegin(event, handle)}
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        background: '#ffffff',
        border: '1.5px solid rgba(74,124,255,0.96)',
        borderRadius: 999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
        zIndex: 10,
        ...style,
      }}
    />
  ))
}

function RotationHandle({ onBegin }) {
  return (
    <>
      <div style={{ position: 'absolute', top: -30, left: '50%', width: 1, height: 22, background: 'rgba(74,124,255,0.9)', transform: 'translateX(-50%)' }} />
      <button
        type="button"
        onMouseDown={onBegin}
        style={{
          position: 'absolute',
          top: -46,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1.5px solid rgba(74,124,255,0.96)',
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
        }}
      />
    </>
  )
}

function GuideLine({ direction, position }) {
  return (
    <div
      style={direction === 'vertical'
        ? { position: 'absolute', top: 0, bottom: 0, left: position, width: 1, background: 'rgba(74,124,255,0.88)', pointerEvents: 'none' }
        : { position: 'absolute', left: 0, right: 0, top: position, height: 1, background: 'rgba(74,124,255,0.88)', pointerEvents: 'none' }}
    />
  )
}

function SelectionRect({ rect }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: MARQUEE_FILL,
        border: `1px solid ${MARQUEE_BORDER}`,
        pointerEvents: 'none',
      }}
    />
  )
}

function CanvasBackground({ media }) {
  if (!media?.file_path) return null
  const src = getMediaAssetUrl(media)

  if (!src || media.file_exists === false) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: 'rgba(10, 10, 10, 0.92)',
          color: 'rgba(255,255,255,0.76)',
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        Missing media file
      </div>
    )
  }

  if (isVideoMedia(media)) {
    return (
      <video
        src={src}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return <img src={src} alt={media.name} className="absolute inset-0 w-full h-full object-cover" />
}
