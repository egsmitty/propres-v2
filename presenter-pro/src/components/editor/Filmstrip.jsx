import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Film } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import SectionHeader from './SectionHeader'
import FilmstripSlide from './FilmstripSlide'
import ScaledSlideText from '@/components/shared/ScaledSlideText'
import { createTextSlide, isMediaSlide } from '@/utils/sectionTypes'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import { uuid } from '@/utils/uuid'

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

function GhostSlide({ slide, width, presentation, floating = false, compact = false, showLabel = true }) {
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
      {showLabel && (
        <div
          className="text-center mt-1 truncate"
          style={{
            fontSize: compact ? 9 : 10,
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            opacity: compact ? 0.82 : 1,
          }}
        >
          {slide.label || slide.type}
        </div>
      )}
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
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const [collapsed, setCollapsed] = useState({})
  const [dragCandidate, setDragCandidate] = useState(null)
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
  const slideNodeRefs = useRef(new Map())
  const endNodeRefs = useRef(new Map())

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
    activeSlideDragRef.current = activeSlideDrag
  }, [activeSlideDrag])

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

  function mutate(fn) {
    useEditorStore.getState().mutateSections(fn)
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
    setSelectedSlide(section.id, newSlide.id)
  }

  function deleteSlide(section, slide) {
    mutate((sections) =>
      sections.map((sec) =>
        sec.id !== section.id ? sec : { ...sec, slides: sec.slides.filter((sl) => sl.id !== slide.id) }
      )
    )
    if (selectedSlideId === slide.id) selectFirstAvailableSlide()
  }

  function removeSection(sectionId) {
    mutate((sections) => sections.filter((sec) => sec.id !== sectionId))
    const selectedSectionId = useEditorStore.getState().selectedSectionId
    if (selectedSectionId === sectionId) selectFirstAvailableSlide()
  }

  function onSlideMouseDown(e, sectionId, slide) {
    if (e.button !== 0) return
    e.stopPropagation()
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
    if (dragCandidate || activeSlideDrag) return
    e.preventDefault()
    setDragOverSection(sectionId)
  }

  function onSectionDrop(targetSectionId) {
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

  let slideIndex = 0

  function handleSelectSlide(sectionId, slide) {
    setSelectedSlide(sectionId, slide.id)
  }

  return (
    <div
      ref={containerRef}
      data-tour="filmstrip"
      className="h-full overflow-y-auto shrink-0 flex flex-col"
      style={{ width, background: 'var(--bg-filmstrip)', borderRight: '1px solid var(--border-default)' }}
    >
      <div className="py-1">
        {sectionsForPreview.map((section) => {
          const isCollapsed = collapsed[section.id]
          const originalSection = sectionsById.get(section.id) || section
          const showPreviewAtEnd =
            activeSlideDrag &&
            slideDropTarget?.sectionId === section.id &&
            slideDropTarget?.targetSlideId === null

          return (
            <div
              key={section.id}
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
              />

              {!isCollapsed && section.slides.map((slide) => {
                slideIndex++
                const idx = slideIndex
                const showPreviewBefore =
                  activeSlideDrag &&
                  slideDropTarget?.sectionId === section.id &&
                  slideDropTarget?.targetSlideId === slide.id

                return (
                  <React.Fragment key={slide.id}>
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
                        index={idx}
                        selected={selectedSlideId === slide.id}
                        onSelect={() => handleSelectSlide(originalSection.id, slide)}
                        onNewSlide={() => insertSlideAfter(originalSection, slide)}
                        onDoubleClick={() => {
                          handleSelectSlide(originalSection.id, slide)
                          setEditingSlide(slide.id)
                        }}
                        onDuplicate={() => duplicateSlide(originalSection, slide)}
                        onDelete={() => deleteSlide(originalSection, slide)}
                      />
                    </div>
                  </React.Fragment>
                )
              })}

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
          )
        })}
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
    </div>
  )
}
