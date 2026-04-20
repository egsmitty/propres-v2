import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useAppStore } from '@/store/appStore'
import { getMedia } from '@/utils/ipc'
import { fileUrlForPath, getEffectiveBackgroundId, isVideoMedia } from '@/utils/backgrounds'
import { getSectionTypeLabel, isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationDimensions, getPresentationAspectRatio } from '@/utils/presentationSizing'
import { slideBodyToHtml } from '@/utils/slideMarkup'
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
import SlideTextEditor from './SlideTextEditor'
import FormattingToolbar from './FormattingToolbar'

const SNAP_THRESHOLD = 8
const MIN_TEXT_BOX_WIDTH = 20
const MIN_TEXT_BOX_HEIGHT = 20
const ROTATION_SNAP = 15
const DEFAULT_GHOST_OFFSET = 24
const MARQUEE_FILL = 'rgba(74,124,255,0.12)'
const MARQUEE_BORDER = 'rgba(74,124,255,0.9)'
const INDICATOR_STYLE = {
  position: 'absolute',
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(12, 18, 32, 0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.03em',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
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
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const updateSlideTextBoxes = useEditorStore((s) => s.updateSlideTextBoxes)
  const duplicateSlideTextBoxes = useEditorStore((s) => s.duplicateSlideTextBoxes)
  const removeSlideTextBoxes = useEditorStore((s) => s.removeSlideTextBoxes)
  const reorderSlideTextBoxes = useEditorStore((s) => s.reorderSlideTextBoxes)
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

  const canvasRef = useRef(null)
  const interactionRef = useRef(null)
  const pendingOutsideBlurRef = useRef(false)

  const slide = getSelectedSlide(presentation, selectedSectionId, selectedSlideId)
  const section = presentation?.sections?.find((item) => item.id === selectedSectionId) || null
  const mediaOnlySlide = isMediaSlide(slide)
  const effectiveBackgroundId = getEffectiveBackgroundId(presentation, selectedSectionId, slide)
  const backgroundMedia = useMemo(() => media.find((item) => item.id === effectiveBackgroundId) || null, [media, effectiveBackgroundId])
  const slideMedia = useMemo(() => media.find((item) => item.id === slide?.mediaId) || null, [media, slide?.mediaId])
  const textBoxes = useMemo(() => getSlideTextBoxes(slide), [slide])
  const renderedBoxes = draftBoxes || textBoxes
  const primaryTextBoxId = selectedTextBoxIds[selectedTextBoxIds.length - 1] || selectedTextBoxIds[0] || null
  const primaryTextBox = renderedBoxes.find((box) => box.id === primaryTextBoxId) || null
  const isEditing = editingSlideId === selectedSlideId && Boolean(editingTextBoxId)

  const { width: nativeW, height: nativeH } = getPresentationDimensions(presentation || slide || undefined)
  const scale = canvasWidth > 0 ? canvasWidth / nativeW : 1

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
    setEditingTextBoxId(null)
    setSnapGuides({ vertical: null, horizontal: null })
    setSelectionRect(null)
    setMetric(null)
    setEditingSlide(null)
  }, [selectedSectionId, selectedSlideId, setEditingSlide])

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
        let x = box.x
        let y = box.y
        let width = box.width
        let height = box.height
        const ratio = box.width / Math.max(1, box.height)
        const keepRatio = event.shiftKey && state.corner

        if (state.handle.includes('e')) width = clamp(box.width + pointerX, MIN_TEXT_BOX_WIDTH, nativeW - x)
        if (state.handle.includes('s')) height = clamp(box.height + pointerY, MIN_TEXT_BOX_HEIGHT, nativeH - y)
        if (state.handle.includes('w')) {
          const nextWidth = clamp(box.width - pointerX, MIN_TEXT_BOX_WIDTH, box.x + box.width)
          x = box.x + box.width - nextWidth
          width = nextWidth
        }
        if (state.handle.includes('n')) {
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
          if (state.handle.includes('w')) x = box.x + box.width - width
          if (state.handle.includes('n')) y = box.y + box.height - height
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
        if (lower === 'b') { event.preventDefault(); useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { bold: !primaryTextBox?.textStyle?.bold }, selectedTextBoxIds); return }
        if (lower === 'i') { event.preventDefault(); useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { italic: !primaryTextBox?.textStyle?.italic }, selectedTextBoxIds); return }
        if (lower === 'u') { event.preventDefault(); useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { underline: !primaryTextBox?.textStyle?.underline }, selectedTextBoxIds); return }
        if (lower === 'l' || lower === 'e' || lower === 'r' || lower === 'j') { event.preventDefault(); const map = { l: 'left', e: 'center', r: 'right', j: 'justify' }; useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, { align: map[lower] }, selectedTextBoxIds); return }
        if (event.key === ' ') { event.preventDefault(); useEditorStore.getState().updateSlideStyle(selectedSectionId, selectedSlideId, DEFAULT_TEXT_STYLE, selectedTextBoxIds); return }
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
    function onDocMouseDown(e) {
      if (!selectedTextBoxIds.length && !editingTextBoxId) return
      if (e.target.closest?.('[data-tour="canvas"]')) return
      if (e.target.closest?.('[data-editor-toolbar="true"]')) return
      setSelectedTextBoxIds([])
      if (editingTextBoxId) {
        setEditingTextBoxId(null)
        setEditingSlide(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [selectedTextBoxIds, editingTextBoxId, setEditingSlide])

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
    pendingOutsideBlurRef.current = true

    if (isEditing) {
      const active = document.activeElement
      if (active?.isContentEditable) active.blur()
      setEditingTextBoxId(null)
      setEditingSlide(null)
      setSelectedTextBoxIds([])
      pendingOutsideBlurRef.current = false
      return
    }

    setSelectedTextBoxIds([])
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = (event.clientX - rect.left) / scale
    const localY = (event.clientY - rect.top) / scale
    setSelectionRect({ x: localX, y: localY, width: 0, height: 0 })
    beginInteraction(event, 'marquee', { originX: localX, originY: localY })
  }

  function handleTextBoxMouseDown(event, textBox) {
    if (event.button !== 0 || isEditing) return
    const alreadySelected = selectedTextBoxIds.includes(textBox.id)

    if (event.shiftKey) {
      setSelectedTextBoxIds((current) => current.includes(textBox.id) ? current.filter((id) => id !== textBox.id) : [...current, textBox.id])
      return
    }

    const nextIds = alreadySelected && selectedTextBoxIds.length ? selectedTextBoxIds : [textBox.id]
    setSelectedTextBoxIds(nextIds)

    beginInteraction(event, 'move', {
      boxes: renderedBoxes.filter((box) => nextIds.includes(box.id)),
      otherBoxes: renderedBoxes.filter((box) => !nextIds.includes(box.id)),
    })
  }

  function handleTextBoxDoubleClick(event, textBoxId) {
    event.preventDefault()
    event.stopPropagation()
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
            color: placeholder ? '#6b7280' : style.color || '#ffffff',
            fontSize: style.size || 100,
            fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? 'italic' : 'normal',
            textDecoration: renderTextDecoration(style),
            lineHeight: style.lineHeight || 1.3,
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
            />
          ) : placeholder ? (
            <span>{resolvePlaceholderText(box.placeholderText)}</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: slideBodyToHtml(box.body) }} />
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

  if (!slide) {
    return <EmptyState message="Select a slide from the filmstrip" />
  }

  return (
    <div data-tour="canvas" className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <FormattingToolbar
        sectionId={selectedSectionId}
        slideId={slide.id}
        selectedTextBoxIds={selectedTextBoxIds}
        primaryTextBox={primaryTextBox}
        canvasRef={canvasRef}
        scale={scale}
      />

      <div className="flex-1 flex items-center justify-center p-6" onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, target: 'slide' }) }}>
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
                  <div style={{ ...INDICATOR_STYLE, left: primaryTextBox.x + 8, top: primaryTextBox.y - 44 }}>
                    {metric.type === 'move' && `X ${metric.x} · Y ${metric.y}`}
                    {metric.type === 'resize' && `${metric.width} × ${metric.height}`}
                    {metric.type === 'rotate' && `${metric.rotation}°`}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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

      <div className="shrink-0 flex items-center px-4 h-9 gap-3" style={{ background: 'var(--bg-toolbar)', borderTop: '1px solid var(--border-subtle)' }}>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {section ? `${getSectionTypeLabel(section.type)} Background:` : 'Section Background:'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {mediaOnlySlide ? slideMedia?.name || 'Media slide' : backgroundMedia ? backgroundMedia.name : 'No background'}
        </span>
        <button
          className="ml-auto text-xs px-2.5 py-1 rounded"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(event) => (event.currentTarget.style.background = 'var(--bg-surface)')}
          onClick={() => setMediaLibraryOpen(true)}
        >
          {mediaOnlySlide ? 'Change Media' : 'Set Background'}
        </button>
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

  if (isVideoMedia(media)) {
    return (
      <video
        src={fileUrlForPath(media.file_path)}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return <img src={fileUrlForPath(media.file_path)} alt={media.name} className="absolute inset-0 w-full h-full object-cover" />
}
