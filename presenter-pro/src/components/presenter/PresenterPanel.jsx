import React, { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import { startSidebarPresentationSession, stopPresentationSession } from '@/utils/presenterFlow'
import { sendSlide } from '@/utils/ipc'
import { getSectionColor } from '@/utils/sectionTypes'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import ScaledSlideText from '@/components/shared/ScaledSlideText'

export default function PresenterPanel() {
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide)

  const isPresenting = usePresenterStore((s) => s.isPresenting)
  const liveSlideId = usePresenterStore((s) => s.liveSlideId)
  const liveSectionId = usePresenterStore((s) => s.liveSectionId)
  const isBlack = usePresenterStore((s) => s.isBlack)
  const isLogo = usePresenterStore((s) => s.isLogo)
  const allSlides = usePresenterStore((s) => s.allSlides)
  const presenterPanelOpen = usePresenterStore((s) => s.presenterPanelOpen)
  const presenterPanelWidth = usePresenterStore((s) => s.presenterPanelWidth)
  const setPresenterPanelOpen = usePresenterStore((s) => s.setPresenterPanelOpen)

  const liveIdx = allSlides.findIndex((sl) => sl.id === liveSlideId)
  const liveSlide = liveIdx >= 0 ? allSlides[liveIdx] : null

  // Selected slide preview when not presenting
  const selectedSlide = presentation?.sections
    ?.find((s) => s.id === selectedSectionId)
    ?.slides?.find((sl) => sl.id === selectedSlideId) || null

  // Keep refs current so keyboard handler always has the latest values
  const liveIdxRef = useRef(liveIdx)
  const allSlidesRef = useRef(allSlides)
  const slideGridRef = useRef(null)
  const slideButtonRefs = useRef(new Map())
  useEffect(() => { liveIdxRef.current = liveIdx }, [liveIdx])
  useEffect(() => { allSlidesRef.current = allSlides }, [allSlides])

  useEffect(() => {
    if (!isPresenting || !liveSlideId) return

    const container = slideGridRef.current
    const node = slideButtonRefs.current.get(liveSlideId)
    if (!container || !node) return

    const containerRect = container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const topPadding = 12
    const bottomPadding = 20
    const isAbove = nodeRect.top < containerRect.top + topPadding
    const isBelow = nodeRect.bottom > containerRect.bottom - bottomPadding

    if (!isAbove && !isBelow) return

    node.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
  }, [isPresenting, liveSlideId])

  // Arrow key navigation when presenting
  useEffect(() => {
    if (!isPresenting) return
    function handler(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPresenting])

  async function goToSlide(slide) {
    if (!slide) return
    if (!isPresenting) {
      setSelectedSlide(slide.sectionId, slide.id)
      return
    }
    await sendSlide(slide, null)
    usePresenterStore.getState().setLiveSlide(slide.sectionId, slide.id)
  }

  function goPrev() {
    const idx = liveIdxRef.current
    const slides = allSlidesRef.current
    if (idx <= 0) return
    goToSlide(slides[idx - 1])
  }

  function goNext() {
    const idx = liveIdxRef.current
    const slides = allSlidesRef.current
    if (idx >= slides.length - 1) return
    goToSlide(slides[idx + 1])
  }

  async function handleStart() {
    if (!presentation) return
    await startSidebarPresentationSession(presentation)
  }

  async function handleStop() {
    await stopPresentationSession()
  }

  const previewSlide = isPresenting ? liveSlide : selectedSlide
  const previewSectionId = isPresenting ? liveSectionId : selectedSectionId
  const previewSection = presentation?.sections?.find((entry) => entry.id === previewSectionId) || null
  const canGoPrev = isPresenting && liveIdx > 0
  const canGoNext = isPresenting && liveIdx < allSlides.length - 1
  const slideGridColumns = Math.min(3, Math.max(1, Math.floor((presenterPanelWidth - 32) / 118)))

  if (!presenterPanelOpen) {
    return (
      <div
        className="shrink-0 flex flex-col items-center justify-center cursor-pointer"
        onClick={() => setPresenterPanelOpen(true)}
        style={{
          width: 56,
          background: 'linear-gradient(180deg, #f1f3f6 0%, #e6e9ee 100%)',
          borderLeft: '1px solid rgba(15, 23, 42, 0.12)',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.72), inset 8px 0 14px rgba(15, 23, 42, 0.1)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          userSelect: 'none',
          zIndex: 5,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(180deg, #f6f7f9 0%, #e9edf2 100%)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(180deg, #f1f3f6 0%, #e6e9ee 100%)'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }}
        title="Show presenter panel"
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 26,
            height: 26,
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.12)',
            boxShadow: '-4px 0 10px rgba(15, 23, 42, 0.12)',
            color: 'var(--text-primary)',
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ‹
        </div>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: presenterPanelWidth,
        transition: 'width 0.2s ease',
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Fixed-width inner — gets clipped by overflow-hidden during animation */}
      <div className="flex flex-col h-full" style={{ width: presenterPanelWidth, minWidth: presenterPanelWidth }}>

        {/* ── Section 1: Live Preview ─────────────────────────────── */}
        <div className="shrink-0 p-3 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            {isPresenting ? (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#16a34a', flexShrink: 0, animation: 'pulse 2s infinite' }}
                />
                <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Live Output
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Preview
                </span>
              </>
            )}
          </div>
          <div
            className="rounded overflow-hidden flex items-center justify-center"
            style={{
              aspectRatio: getPresentationAspectRatio(presentation),
              background: isBlack ? '#000' : '#111',
              border: isPresenting ? '1px solid #16a34a' : '1px solid var(--border-subtle)',
              color: '#fff',
            }}
          >
            {isBlack
              ? <span style={{ color: '#444', fontSize: 10 }}>BLACK</span>
              : isLogo
              ? <span style={{ color: '#4a7cff', fontSize: 10 }}>LOGO</span>
              : <ScaledSlideText
                  presentation={presentation}
                  slide={previewSlide}
                  empty="—"
                  shadow="none"
                  minPaddingX={8}
                  minPaddingY={8}
                  showPlaceholder={false}
                />
            }
          </div>
        </div>

        {/* ── Section 2: Output Controls ──────────────────────────── */}
        <div className="shrink-0 px-3 pb-2 flex gap-1.5">
          <button
            onClick={isPresenting ? handleStop : handleStart}
            className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium"
            style={{
              height: 44,
              background: isPresenting ? 'var(--danger, #dc2626)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {isPresenting ? '⏹ Stop' : '▶ Start'}
          </button>
          <button
            onClick={() => window.electronAPI?.sendBlack()}
            className="flex-1 flex items-center justify-center rounded text-xs font-medium"
            style={{
              height: 44,
              background: isBlack ? '#1f1f1f' : 'var(--bg-app)',
              color: isBlack ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${isBlack ? '#555' : 'var(--border-default)'}`,
              cursor: 'pointer',
            }}
          >
            ⬛ Black
          </button>
          <button
            onClick={() => window.electronAPI?.sendLogo()}
            className="flex-1 flex items-center justify-center rounded text-xs font-medium"
            style={{
              height: 44,
              background: isLogo ? 'rgba(74,124,255,0.15)' : 'var(--bg-app)',
              color: isLogo ? '#4a7cff' : 'var(--text-secondary)',
              border: `1px solid ${isLogo ? '#4a7cff' : 'var(--border-default)'}`,
              cursor: 'pointer',
            }}
          >
            🏠 Logo
          </button>
        </div>

        {/* ── Section 3: Slide Grid ───────────────────────────────── */}
        <div ref={slideGridRef} className="flex-1 overflow-y-auto px-3 pb-2">
          {!presentation ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No presentation open</span>
            </div>
          ) : (
            presentation.sections.map((section) => (
              <div key={section.id} className="mb-3">
                {/* Section divider label */}
                <div
                  className="flex items-center gap-2 mb-1.5"
                  style={{ fontSize: 10, color: 'var(--text-tertiary)' }}
                >
                  <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                  <span className="shrink-0 truncate" style={{ maxWidth: 160 }}>{section.title}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                </div>
                {/* Responsive thumbnail grid */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${slideGridColumns}, minmax(0, 1fr))`, gap: 4 }}>
                  {section.slides.map((slide) => {
                    const isLive = slide.id === liveSlideId
                    const isSelected = !isPresenting && slide.id === selectedSlideId
                    const isActive = isLive || isSelected
                    const songSectionColor = slide.groupId ? getSectionColor(slide.type) : null
                    // Use the enriched slide (with sectionId + effectiveBackgroundId) from allSlides when available
                    const enriched = allSlides.find((s) => s.id === slide.id) || { ...slide, sectionId: section.id }
                    return (
                      <button
                        key={slide.id}
                        onClick={() => goToSlide(enriched)}
                        ref={(node) => {
                          if (node) slideButtonRefs.current.set(slide.id, node)
                          else slideButtonRefs.current.delete(slide.id)
                        }}
                        style={{
                          aspectRatio: getPresentationAspectRatio(presentation),
                          background: '#111',
                          border: isActive ? '3px solid var(--accent)' : '1px solid var(--border-subtle)',
                          boxShadow: isActive ? '0 0 0 2px rgba(74,124,255,0.22)' : 'none',
                          borderRadius: 4,
                          overflow: 'hidden',
                          position: 'relative',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        {/* Section color strip */}
                        {songSectionColor ? (
                          <>
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 6,
                                background: songSectionColor,
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                left: 10,
                                top: 8,
                                padding: '2px 6px',
                                borderRadius: 999,
                                background: `${songSectionColor}22`,
                                border: `1px solid ${songSectionColor}66`,
                                color: '#ffffff',
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                lineHeight: 1.1,
                                pointerEvents: 'none',
                              }}
                            >
                              {slide.label || slide.type}
                            </div>
                          </>
                        ) : null}
                        <div style={{ position: 'absolute', inset: 0 }}>
                          <ScaledSlideText
                            presentation={presentation}
                            slide={slide}
                            empty="—"
                            shadow="none"
                            minPaddingX={7}
                            minPaddingY={5}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Section 4: Navigation ───────────────────────────────── */}
        <div
          className="shrink-0 flex gap-1.5 px-3 py-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={goPrev}
            disabled={!canGoPrev}
            className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium"
            style={{
              height: 36,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              color: canGoPrev ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: canGoPrev ? 'pointer' : 'default',
            }}
          >
            ◀ PREV
          </button>
          <button
            onClick={goNext}
            disabled={!canGoNext}
            className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium"
            style={{
              height: 36,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              color: canGoNext ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: canGoNext ? 'pointer' : 'default',
            }}
          >
            NEXT ▶
          </button>
        </div>

      </div>
    </div>
  )
}
