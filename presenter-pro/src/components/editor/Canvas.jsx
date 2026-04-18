import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { useAppStore } from '@/store/appStore'
import { getMedia, sendSlide } from '@/utils/ipc'
import { fileUrlForPath, getEffectiveBackgroundId, isVideoMedia } from '@/utils/backgrounds'
import { getSectionContentLabel, getSectionTypeLabel, isMediaSlide } from '@/utils/sectionTypes'
import SlideTextEditor from './SlideTextEditor'
import FormattingToolbar from './FormattingToolbar'

function getNativeDims(presentation) {
  const ratio = presentation?.aspectRatio || '16:9'
  if (ratio === '4:3') return { w: 1440, h: 1080 }
  if (ratio === '16:10') return { w: 1920, h: 1200 }
  if (ratio === '1:1') return { w: 1080, h: 1080 }
  if (ratio === 'custom') {
    const w = presentation?.customAspectWidth || 1920
    const h = presentation?.customAspectHeight || 1080
    return { w, h }
  }
  return { w: 1920, h: 1080 }
}

function getSelectedSlide(presentation, selectedSectionId, selectedSlideId) {
  if (!presentation) return null
  const section = presentation.sections.find((s) => s.id === selectedSectionId)
  if (!section) return null
  return section.slides.find((sl) => sl.id === selectedSlideId) || null
}

export default function Canvas() {
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const editingSlideId = useEditorStore((s) => s.editingSlideId)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const isPresenting = usePresenterStore((s) => s.isPresenting)
  const setLiveSlide = usePresenterStore((s) => s.setLiveSlide)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const [media, setMedia] = useState([])
  const canvasRef = useRef(null)
  const [canvasWidth, setCanvasWidth] = useState(0)

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

  async function loadMedia() {
    const result = await getMedia()
    if (result?.success) setMedia(result.data)
  }

  async function handleClick() {
    if (!slide || isEditing) return
    if (isPresenting) {
      // Send to output on click while presenting
      await sendSlide(
        { ...slide, sectionId: selectedSectionId, effectiveBackgroundId },
        backgroundMedia
      )
      setLiveSlide(selectedSectionId, selectedSlideId)
    }
  }

  function handleDoubleClick() {
    if (slide && !mediaOnlySlide) setEditingSlide(slide.id)
  }

  function handleSave(body) {
    if (slide) updateSlideBody(selectedSectionId, slide.id, body)
    setEditingSlide(null)
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

  const textAlign = slide.textStyle?.align || 'center'
  const valign = slide.textStyle?.valign || 'center'

  const valignStyle =
    valign === 'top'
      ? { justifyContent: 'flex-start', paddingTop: 80 }
      : valign === 'bottom'
      ? { justifyContent: 'flex-end', paddingBottom: 80 }
      : { justifyContent: 'center' }

  const { w: nativeW, h: nativeH } = getNativeDims(presentation)
  const scale = canvasWidth > 0 ? canvasWidth / nativeW : 1

  return (
    <div
      data-tour="canvas"
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-app)' }}
    >
      {isEditing && !mediaOnlySlide && (
        <FormattingToolbar
          sectionId={selectedSectionId}
          slideId={slide.id}
          textStyle={slide.textStyle}
        />
      )}
      <div
        className="flex-1 flex items-center justify-center p-6"
        onClick={handleClick}
      >
        {/* Outer: maintains aspect ratio, clips scaled inner */}
        <div
          ref={canvasRef}
          className="relative rounded shadow-2xl overflow-hidden"
          style={{
            width: '100%',
            aspectRatio: `${nativeW}/${nativeH}`,
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
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: 96,
                    paddingRight: 96,
                    textAlign,
                    ...valignStyle,
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
                      className="w-full select-none group"
                      style={{
                        color: slide.textStyle?.color || '#ffffff',
                        fontSize: slide.textStyle?.size || 52,
                        fontWeight: slide.textStyle?.bold ? 700 : 400,
                        lineHeight: 1.3,
                        wordBreak: 'break-word',
                        textShadow: '0 2px 16px rgba(0,0,0,0.5)',
                      }}
                    >
                      {slide.body ? (
                        <span dangerouslySetInnerHTML={{ __html: slide.body }} />
                      ) : (
                        <span
                          style={{ color: '#555', fontSize: 28 }}
                          className="opacity-0 group-hover:opacity-100"
                        >
                          Double-click to edit {section ? getSectionContentLabel(section.type).toLowerCase() : 'text'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!isEditing && slide.body && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: 26,
                      opacity: 0,
                      pointerEvents: 'none',
                    }}
                    className="hover:opacity-100 transition-opacity"
                  >
                    Double-click to edit {section ? getSectionContentLabel(section.type).toLowerCase() : 'text'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

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
