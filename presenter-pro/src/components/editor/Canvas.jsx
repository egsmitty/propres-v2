import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { useAppStore } from '@/store/appStore'
import { getMedia, sendSlide } from '@/utils/ipc'
import { fileUrlForPath, getEffectiveBackgroundId, isVideoMedia } from '@/utils/backgrounds'
import { DEFAULT_TEXT_BOX, getSectionTypeLabel, isMediaSlide, resolvePlaceholderText } from '@/utils/sectionTypes'
import { getPresentationDimensions, getPresentationAspectRatio } from '@/utils/presentationSizing'
import { slideBodyToHtml } from '@/utils/slideMarkup'
import ContextMenu from '@/components/shared/ContextMenu'
import {
  clearSelectedSlide,
  copySelectedSlideToClipboard,
  deleteSelectedSlideFromCurrentPresentation,
  pasteSlideAfterSelected,
} from '@/utils/presentationCommands'
import SlideTextEditor from './SlideTextEditor'
import FormattingToolbar from './FormattingToolbar'

function getSelectedSlide(presentation, selectedSectionId, selectedSlideId) {
  if (!presentation) return null
  const section = presentation.sections.find((s) => s.id === selectedSectionId)
  if (!section) return null
  return section.slides.find((sl) => sl.id === selectedSlideId) || null
}

const SNAP_THRESHOLD = 10
const MIN_TEXT_BOX_WIDTH = 260
const MIN_TEXT_BOX_HEIGHT = 140

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export default function Canvas() {
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const editingSlideId = useEditorStore((s) => s.editingSlideId)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const updateSlideTextBox = useEditorStore((s) => s.updateSlideTextBox)
  const isPresenting = usePresenterStore((s) => s.isPresenting)
  const setLiveSlide = usePresenterStore((s) => s.setLiveSlide)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const [media, setMedia] = useState([])
  const slideClipboard = useAppStore((s) => s.slideClipboard)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const draftTextBoxRef = useRef(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [menu, setMenu] = useState(null)
  const [draftTextBox, setDraftTextBox] = useState(null)
  const [snapGuides, setSnapGuides] = useState({ horizontal: null, vertical: null })
  const [textBoxSelected, setTextBoxSelected] = useState(false)

  const slide = getSelectedSlide(presentation, selectedSectionId, selectedSlideId)
  const section = presentation?.sections?.find((item) => item.id === selectedSectionId) || null
  const isEditing = editingSlideId === selectedSlideId && !!selectedSlideId
  const mediaOnlySlide = isMediaSlide(slide)
  const effectiveBackgroundId = getEffectiveBackgroundId(presentation, selectedSectionId, slide)
  const backgroundMedia = useMemo(
    () => media.find((item) => item.id === effectiveBackgroundId) || null,
    [media, effectiveBackgroundId]
  )
  const slideMedia = useMemo(
    () => media.find((item) => item.id === slide?.mediaId) || null,
    [media, slide?.mediaId]
  )

  useEffect(() => {
    if (!canvasRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setCanvasWidth(entry.contentRect.width)
    })
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    loadMedia()
  }, [mediaLibraryOpen])

  useEffect(() => {
    dragRef.current = null
    draftTextBoxRef.current = null
    setDraftTextBox(null)
    setSnapGuides({ horizontal: null, vertical: null })
    setTextBoxSelected(false)
  }, [selectedSectionId, selectedSlideId])

  useEffect(() => {
    function handlePointerMove(e) {
      if (!dragRef.current || !slide || mediaOnlySlide) return

      const { mode, startX, startY, box, nativeWidth, nativeHeight, currentScale } = dragRef.current
      const safeScale = currentScale || 1
      const dx = (e.clientX - startX) / safeScale
      const dy = (e.clientY - startY) / safeScale
      const threshold = SNAP_THRESHOLD / safeScale

      if (mode === 'move') {
        let nextX = clamp(box.x + dx, 0, nativeWidth - box.width)
        let nextY = clamp(box.y + dy, 0, nativeHeight - box.height)

        const centeredX = (nativeWidth - box.width) / 2
        const centeredY = (nativeHeight - box.height) / 2

        let verticalGuide = null
        let horizontalGuide = null

        if (Math.abs(nextX - centeredX) <= threshold) {
          nextX = centeredX
          verticalGuide = nativeWidth / 2
        }

        if (Math.abs(nextY - centeredY) <= threshold) {
          nextY = centeredY
          horizontalGuide = nativeHeight / 2
        }

        const nextDraft = { ...box, x: nextX, y: nextY }
        draftTextBoxRef.current = nextDraft
        setDraftTextBox(nextDraft)
        setSnapGuides({ horizontal: horizontalGuide, vertical: verticalGuide })
        return
      }

      // Resize: compute new box based on which handle is being dragged
      let { x, y, width, height } = box
      if (mode === 'resize_se') {
        width = clamp(width + dx, MIN_TEXT_BOX_WIDTH, nativeWidth - x)
        height = clamp(height + dy, MIN_TEXT_BOX_HEIGHT, nativeHeight - y)
      } else if (mode === 'resize_nw') {
        const newW = clamp(width - dx, MIN_TEXT_BOX_WIDTH, x + width)
        const newH = clamp(height - dy, MIN_TEXT_BOX_HEIGHT, y + height)
        x = x + width - newW; y = y + height - newH; width = newW; height = newH
      } else if (mode === 'resize_ne') {
        const newH = clamp(height - dy, MIN_TEXT_BOX_HEIGHT, y + height)
        y = y + height - newH; height = newH
        width = clamp(width + dx, MIN_TEXT_BOX_WIDTH, nativeWidth - x)
      } else if (mode === 'resize_sw') {
        const newW = clamp(width - dx, MIN_TEXT_BOX_WIDTH, x + width)
        x = x + width - newW; width = newW
        height = clamp(height + dy, MIN_TEXT_BOX_HEIGHT, nativeHeight - y)
      } else if (mode === 'resize_n') {
        const newH = clamp(height - dy, MIN_TEXT_BOX_HEIGHT, y + height)
        y = y + height - newH; height = newH
      } else if (mode === 'resize_s') {
        height = clamp(height + dy, MIN_TEXT_BOX_HEIGHT, nativeHeight - y)
      } else if (mode === 'resize_e') {
        width = clamp(width + dx, MIN_TEXT_BOX_WIDTH, nativeWidth - x)
      } else if (mode === 'resize_w') {
        const newW = clamp(width - dx, MIN_TEXT_BOX_WIDTH, x + width)
        x = x + width - newW; width = newW
      }
      const nextDraft = { ...box, x, y, width, height }
      draftTextBoxRef.current = nextDraft
      setDraftTextBox(nextDraft)
      setSnapGuides({ horizontal: null, vertical: null })
    }

    function handlePointerUp() {
      if (!dragRef.current) return
      dragRef.current = null

      if (draftTextBoxRef.current && selectedSectionId && selectedSlideId) {
        updateSlideTextBox(selectedSectionId, selectedSlideId, draftTextBoxRef.current)
      }

      draftTextBoxRef.current = null
      setDraftTextBox(null)
      setSnapGuides({ horizontal: null, vertical: null })
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [mediaOnlySlide, selectedSectionId, selectedSlideId, slide, updateSlideTextBox])

  async function loadMedia() {
    const result = await getMedia()
    if (result?.success) setMedia(result.data)
  }

  async function handleClick() {
    if (!slide || isEditing) return
    if (isPresenting) {
      // Send to output on click while presenting
      await sendSlide(
        {
          ...slide,
          sectionId: selectedSectionId,
          effectiveBackgroundId,
          aspectRatio: presentation?.aspectRatio || '16:9',
          customAspectWidth: presentation?.customAspectWidth ?? null,
          customAspectHeight: presentation?.customAspectHeight ?? null,
        },
        backgroundMedia
      )
      setLiveSlide(selectedSectionId, selectedSlideId)
    }
  }

  function handleDoubleClick() {
    if (slide && !mediaOnlySlide) {
      setTextBoxSelected(true)
      setEditingSlide(slide.id)
    }
  }

  function handleOuterClick() {
    if (isEditing) {
      // Force the contentEditable to blur, which triggers onBlur → save in SlideTextEditor
      const el = document.activeElement
      if (el && el.isContentEditable) el.blur()
      setTextBoxSelected(false)
      return
    }
    if (textBoxSelected) setTextBoxSelected(false)
  }

  function handleSave(body) {
    if (slide) updateSlideBody(selectedSectionId, slide.id, body)
    setEditingSlide(null)
  }

  function beginTextBoxInteraction(e, mode) {
    if (!slide || mediaOnlySlide || isEditing) return

    e.preventDefault()
    e.stopPropagation()

    const { width: nativeWidth, height: nativeHeight } = getPresentationDimensions(presentation)
    const box = draftTextBox || slide.textBox || DEFAULT_TEXT_BOX

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box,
      nativeWidth,
      nativeHeight,
      currentScale: scale || 1,
    }

    const cursorMap = {
      move: 'move',
      resize_se: 'nwse-resize', resize_nw: 'nwse-resize',
      resize_ne: 'nesw-resize', resize_sw: 'nesw-resize',
      resize_n: 'ns-resize', resize_s: 'ns-resize',
      resize_e: 'ew-resize', resize_w: 'ew-resize',
    }
    document.body.style.cursor = cursorMap[mode] || 'move'
    document.body.style.userSelect = 'none'
  }

  function handleContextMenu(e) {
    e.preventDefault()
    if (!slide) return
    setMenu({ x: e.clientX, y: e.clientY })
  }

  if (!presentation) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--bg-app)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Open a presentation to get started
        </p>
      </div>
    )
  }

  if (!slide) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--bg-app)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Select a slide from the filmstrip
        </p>
      </div>
    )
  }

  const { width: nativeW, height: nativeH } = getPresentationDimensions(presentation)
  const scale = canvasWidth > 0 ? canvasWidth / nativeW : 1
  const textStyle = slide.textStyle || {}
  const activeTextBox = draftTextBox || slide.textBox || DEFAULT_TEXT_BOX

  return (
    <div
      data-tour="canvas"
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-app)' }}
    >
      {(isEditing || textBoxSelected) && !mediaOnlySlide && (
        <FormattingToolbar
          sectionId={selectedSectionId}
          slideId={slide.id}
          textStyle={slide.textStyle}
          textBox={slide.textBox}
        />
      )}
      <div
        className="flex-1 flex items-center justify-center p-6"
        onClick={handleOuterClick}
        onContextMenu={handleContextMenu}
      >
        {/* Outer: maintains aspect ratio, clips scaled inner */}
        <div
          ref={canvasRef}
          className="relative rounded shadow-2xl overflow-hidden"
          style={{
            width: '100%',
            aspectRatio: getPresentationAspectRatio(presentation),
            background: '#1a1a1a',
            cursor: isEditing ? 'text' : 'default',
          }}
          onDoubleClick={handleDoubleClick}
        >
          {/* Inner: native resolution, scaled down via CSS transform */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: nativeW,
              height: nativeH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {!mediaOnlySlide && backgroundMedia && (
              <CanvasBackground media={backgroundMedia} />
            )}

            {!mediaOnlySlide && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: backgroundMedia ? 'rgba(0,0,0,0.18)' : 'transparent',
                }}
              />
            )}

            {mediaOnlySlide ? (
              slideMedia ? (
                <CanvasBackground media={slideMedia} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>
                  Media slide
                </div>
              )
            ) : (
              <>
                {snapGuides.vertical !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: snapGuides.vertical,
                      width: 2,
                      background: 'rgba(74,124,255,0.85)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.24)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {snapGuides.horizontal !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: snapGuides.horizontal,
                      height: 2,
                      background: 'rgba(74,124,255,0.85)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.24)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <div
                  onClick={(e) => { e.stopPropagation(); if (!isEditing) setTextBoxSelected(true) }}
                  onMouseDown={(e) => { if (textBoxSelected || isEditing) beginTextBoxInteraction(e, 'move') }}
                  style={{
                    position: 'absolute',
                    left: activeTextBox.x,
                    top: activeTextBox.y,
                    width: activeTextBox.width,
                    height: activeTextBox.height,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent:
                      textStyle.valign === 'top'
                        ? 'flex-start'
                        : textStyle.valign === 'bottom'
                        ? 'flex-end'
                        : 'center',
                    padding: '22px 28px',
                    textAlign: textStyle.align || 'center',
                    background: activeTextBox.backgroundColor || 'transparent',
                    border: isEditing
                      ? '2px solid rgba(74,124,255,0.95)'
                      : textBoxSelected
                      ? '2px solid rgba(74,124,255,0.7)'
                      : '2px dashed rgba(255,255,255,0.18)',
                    borderRadius: 14,
                    boxShadow: isEditing
                      ? '0 0 0 4px rgba(74,124,255,0.16)'
                      : textBoxSelected
                      ? '0 0 0 3px rgba(74,124,255,0.12)'
                      : 'none',
                    cursor: isEditing ? 'text' : textBoxSelected ? 'move' : 'pointer',
                    overflow: 'visible',
                  }}
                >
                  {isEditing ? (
                    <SlideTextEditor
                      slide={slide}
                      onSave={handleSave}
                      onCancel={() => setEditingSlide(null)}
                    />
                  ) : (
                    <div
                      className="w-full select-none"
                      style={{
                        color: textStyle.color || '#ffffff',
                        fontSize: textStyle.size || 100,
                        fontWeight: textStyle.bold ? 700 : 400,
                        fontStyle: textStyle.italic ? 'italic' : 'normal',
                        textDecoration: textStyle.underline ? 'underline' : 'none',
                        lineHeight: textStyle.lineHeight || 1.3,
                        fontFamily: textStyle.fontFamily || 'Arial, sans-serif',
                        wordBreak: 'break-word',
                        textShadow: '0 2px 16px rgba(0,0,0,0.5)',
                        cursor: 'inherit',
                      }}
                    >
                      {slide.body ? (
                        <span dangerouslySetInnerHTML={{ __html: slideBodyToHtml(slide.body) }} />
                      ) : (
                        <span
                          style={{
                            color: '#6b7280',
                            fontSize: textStyle.size || 100,
                            fontWeight: textStyle.bold ? 700 : 400,
                            fontStyle: textStyle.italic ? 'italic' : 'normal',
                            textDecoration: textStyle.underline ? 'underline' : 'none',
                            lineHeight: textStyle.lineHeight || 1.3,
                            fontFamily: textStyle.fontFamily || 'Arial, sans-serif',
                          }}
                          className="opacity-100"
                        >
                          {resolvePlaceholderText(slide.placeholderText)}
                        </span>
                      )}
                    </div>
                  )}

                  {!isEditing && textBoxSelected && (
                    <ResizeHandles onBegin={beginTextBoxInteraction} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
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

      {/* Background bar */}
      <div
        className="shrink-0 flex items-center px-4 h-9 gap-3"
        style={{
          background: 'var(--bg-toolbar)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {section ? `${getSectionTypeLabel(section.type)} Background:` : 'Section Background:'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {mediaOnlySlide
            ? slideMedia?.name || 'Media slide'
            : backgroundMedia
            ? backgroundMedia.name
            : 'No background'}
        </span>
        <button
          className="ml-auto text-xs px-2.5 py-1 rounded"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          onClick={() => setMediaLibraryOpen(true)}
        >
          {mediaOnlySlide ? 'Change Media' : 'Set Background'}
        </button>

      </div>
    </div>
  )
}

const RESIZE_HANDLES = [
  { mode: 'resize_nw', style: { top: -6, left: -6, cursor: 'nwse-resize' } },
  { mode: 'resize_n',  style: { top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
  { mode: 'resize_ne', style: { top: -6, right: -6, cursor: 'nesw-resize' } },
  { mode: 'resize_e',  style: { top: '50%', right: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
  { mode: 'resize_se', style: { bottom: -6, right: -6, cursor: 'nwse-resize' } },
  { mode: 'resize_s',  style: { bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
  { mode: 'resize_sw', style: { bottom: -6, left: -6, cursor: 'nesw-resize' } },
  { mode: 'resize_w',  style: { top: '50%', left: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
]

function ResizeHandles({ onBegin }) {
  return (
    <>
      {RESIZE_HANDLES.map(({ mode, style }) => (
        <div
          key={mode}
          onMouseDown={(e) => onBegin(e, mode)}
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            background: '#fff',
            border: '2px solid rgba(74,124,255,0.9)',
            borderRadius: 2,
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            zIndex: 10,
            ...style,
          }}
        />
      ))}
    </>
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

  return (
    <img
      src={fileUrlForPath(media.file_path)}
      alt={media.name}
      className="absolute inset-0 w-full h-full object-cover"
    />
  )
}
