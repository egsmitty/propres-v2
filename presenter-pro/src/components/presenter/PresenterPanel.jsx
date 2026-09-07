import React, { useEffect, useRef, useState } from 'react';
import { useLatest } from '@/hooks/useLatest';
import { ChevronLeft, LayoutPanelTop } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';
import { startSidebarPresentationSession, stopPresentationSession } from '@/utils/presenterFlow';
import { getMedia, sendBlack, sendLogo, sendSlide } from '@/utils/ipc';
import { getSectionColor, withColorAlpha } from '@/utils/sectionTypes';
import { getPresentationAspectRatio } from '@/utils/presentationSizing';
import SlidePreviewSurface from '@/components/shared/SlidePreviewSurface';
import { withEffectiveBackground } from '@/utils/backgrounds';

const LIVE_SLIDE_OUTLINE_COLOR = 'var(--live-outline)';
const PRESENTER_PANEL_TOP_HEIGHT_KEY = 'presenterpro.presenterPanelTopHeight';
const PRESENTER_PANEL_MIN_TOP_HEIGHT = 220;
const PRESENTER_PANEL_MIN_BOTTOM_HEIGHT = 170;
const PRESENTER_PANEL_DIVIDER_HEIGHT = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInitialTopPanelHeight() {
  if (typeof window === 'undefined') return 320;
  const saved = Number(window.localStorage.getItem(PRESENTER_PANEL_TOP_HEIGHT_KEY));
  return Number.isFinite(saved) ? saved : 320;
}

export default function PresenterPanel({ onSetOpen }) {
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen);
  const presentation = useEditorStore((s) => s.presentation);
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId);
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId);
  const setSelectedSlide = useEditorStore((s) => s.setSelectedSlide);

  const isPresenting = usePresenterStore((s) => s.isPresenting);
  const liveSlideId = usePresenterStore((s) => s.liveSlideId);
  const liveSectionId = usePresenterStore((s) => s.liveSectionId);
  const isBlack = usePresenterStore((s) => s.isBlack);
  const isLogo = usePresenterStore((s) => s.isLogo);
  const allSlides = usePresenterStore((s) => s.allSlides);
  const presenterPanelOpen = usePresenterStore((s) => s.presenterPanelOpen);
  const presenterPanelWidth = usePresenterStore((s) => s.presenterPanelWidth);
  const setPresenterPanelOpen = usePresenterStore((s) => s.setPresenterPanelOpen);
  const setOpen = onSetOpen || setPresenterPanelOpen;

  const liveIdx = allSlides.findIndex((sl) => sl.id === liveSlideId);
  const liveSlide = liveIdx >= 0 ? allSlides[liveIdx] : null;

  // Selected slide preview when not presenting
  const selectedSlide =
    presentation?.sections
      ?.find((s) => s.id === selectedSectionId)
      ?.slides?.find((sl) => sl.id === selectedSlideId) || null;

  // Keep refs current so keyboard handler always has the latest values
  const liveIdxRef = useRef(liveIdx);
  const allSlidesRef = useRef(allSlides);
  const slideGridRef = useRef(null);
  const slideButtonRefs = useRef(new Map());
  const panelRef = useRef(null);
  const dividerDragRef = useRef(null);
  const [topPanelHeight, setTopPanelHeight] = useState(getInitialTopPanelHeight);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  useEffect(() => {
    liveIdxRef.current = liveIdx;
  }, [liveIdx]);
  useEffect(() => {
    allSlidesRef.current = allSlides;
  }, [allSlides]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PRESENTER_PANEL_TOP_HEIGHT_KEY, String(topPanelHeight));
  }, [topPanelHeight]);

  useEffect(() => {
    getMedia()
      .then((result) => {
        if (result?.success) setMediaLibrary(result.data || []);
      })
      .catch(() => {});
  }, [mediaLibraryOpen, presentation?.id]);

  useEffect(() => {
    function clampTopPanelHeight() {
      const panelHeight = panelRef.current?.clientHeight || 0;
      if (!panelHeight) return;
      const maxTopHeight = Math.max(
        PRESENTER_PANEL_MIN_TOP_HEIGHT,
        panelHeight - PRESENTER_PANEL_MIN_BOTTOM_HEIGHT - PRESENTER_PANEL_DIVIDER_HEIGHT
      );
      setTopPanelHeight((current) => clamp(current, PRESENTER_PANEL_MIN_TOP_HEIGHT, maxTopHeight));
    }

    clampTopPanelHeight();
    window.addEventListener('resize', clampTopPanelHeight);
    return () => window.removeEventListener('resize', clampTopPanelHeight);
  }, [presenterPanelOpen, presenterPanelWidth]);

  useEffect(() => {
    function onMove(event) {
      if (!dividerDragRef.current) return;
      const panelHeight = panelRef.current?.clientHeight || 0;
      if (!panelHeight) return;
      const delta = event.clientY - dividerDragRef.current.startY;
      const maxTopHeight = Math.max(
        PRESENTER_PANEL_MIN_TOP_HEIGHT,
        panelHeight - PRESENTER_PANEL_MIN_BOTTOM_HEIGHT - PRESENTER_PANEL_DIVIDER_HEIGHT
      );
      setTopPanelHeight(
        clamp(
          dividerDragRef.current.startHeight + delta,
          PRESENTER_PANEL_MIN_TOP_HEIGHT,
          maxTopHeight
        )
      );
      document.body.style.cursor = 'row-resize';
    }

    function onUp() {
      dividerDragRef.current = null;
      document.body.style.cursor = '';
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!isPresenting || !liveSlideId) return;

    const container = slideGridRef.current;
    const node = slideButtonRefs.current.get(liveSlideId);
    if (!container || !node) return;

    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const topPadding = 12;
    const bottomPadding = 20;
    const isAbove = nodeRect.top < containerRect.top + topPadding;
    const isBelow = nodeRect.bottom > containerRect.bottom - bottomPadding;

    if (!isAbove && !isBelow) return;

    node.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [isPresenting, liveSlideId]);

  // Arrow key navigation when presenting
  const latestGoPrev = useLatest(goPrev);
  const latestGoNext = useLatest(goNext);
  useEffect(() => {
    if (!isPresenting) return;
    function handler(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable)
        return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        latestGoPrev.current();
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        latestGoNext.current();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPresenting, latestGoNext, latestGoPrev]);

  async function goToSlide(slide) {
    if (!slide) return;
    if (!isPresenting) {
      setSelectedSlide(slide.sectionId, slide.id);
      return;
    }
    await sendSlide(slide, null);
    usePresenterStore.getState().setLiveSlide(slide.sectionId, slide.id);
  }

  function goPrev() {
    const idx = liveIdxRef.current;
    const slides = allSlidesRef.current;
    if (idx <= 0) return;
    goToSlide(slides[idx - 1]);
  }

  function goNext() {
    const idx = liveIdxRef.current;
    const slides = allSlidesRef.current;
    if (idx >= slides.length - 1) return;
    goToSlide(slides[idx + 1]);
  }

  async function handleStart() {
    if (!presentation) return;
    await startSidebarPresentationSession(presentation);
  }

  async function handleStop() {
    await stopPresentationSession();
  }

  const previewSlide = isPresenting ? liveSlide : selectedSlide;
  const previewSectionId = isPresenting ? liveSectionId : selectedSectionId;
  const previewSlideWithBackground = previewSlide
    ? withEffectiveBackground(presentation, previewSectionId, previewSlide)
    : null;
  const canGoPrev = isPresenting && liveIdx > 0;
  const canGoNext = isPresenting && liveIdx < allSlides.length - 1;
  const slideGridColumns = Math.min(5, Math.max(1, Math.floor((presenterPanelWidth - 32) / 118)));

  if (!presenterPanelOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group shrink-0 h-full flex items-center justify-center relative overflow-visible"
        style={{
          width: 48,
          borderLeft: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-surface)';
        }}
        title="Show presenter panel"
        aria-label="Show presenter panel"
      >
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-md"
          style={{
            width: 32,
            height: 42,
            color: 'var(--text-secondary)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-default)',
              borderRadius: 999,
            }}
          >
            <LayoutPanelTop size={16} />
          </div>
          <ChevronLeft
            size={11}
            style={{
              color: 'var(--text-tertiary)',
              marginTop: 5,
            }}
          />
        </div>
        <div
          className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full px-2.5 py-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 10px 24px rgba(8,14,30,0.12)',
            color: 'var(--text-primary)',
          }}
        >
          <ChevronLeft size={13} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-[11px] font-medium whitespace-nowrap">Show presenter</span>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="shrink-0 overflow-hidden border-l border-border-subtle bg-bg-surface"
      style={{
        width: presenterPanelWidth,
        transition: 'width 0.2s ease',
      }}
    >
      {/* Fixed-width inner — gets clipped by overflow-hidden during animation */}
      <div
        className="flex flex-col h-full"
        style={{ width: presenterPanelWidth, minWidth: presenterPanelWidth }}
      >
        <div
          className="shrink-0 flex flex-col"
          style={{
            flexBasis: topPanelHeight,
            minHeight: PRESENTER_PANEL_MIN_TOP_HEIGHT,
          }}
        >
          <div className="flex-1 min-h-0 p-3 pb-2 flex flex-col">
            <div className="flex items-center gap-1.5 mb-1.5">
              {isPresenting ? (
                <>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: 'var(--live)',
                      flexShrink: 0,
                      animation: 'pulse 2s infinite',
                    }}
                  />
                  <span className="text-[9px] text-live font-semibold tracking-[0.12em] uppercase">
                    Live Output
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary shrink-0" />
                  <span className="text-[9px] text-text-tertiary tracking-[0.12em] uppercase">
                    Preview
                  </span>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div
                className="rounded overflow-hidden flex items-center justify-center w-full max-w-full max-h-full text-text-on-accent"
                style={{
                  aspectRatio: getPresentationAspectRatio(presentation),
                  background: isBlack ? 'var(--projector-bg)' : 'var(--on-dark-1)',
                  border: isPresenting ? '1px solid var(--live)' : '1px solid var(--border-subtle)',
                }}
              >
                {isBlack ? (
                  <span style={{ color: 'var(--on-dark-4)', fontSize: 10 }}>BLACK</span>
                ) : isLogo ? (
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>LOGO</span>
                ) : (
                  <div className="relative w-full h-full">
                    <SlidePreviewSurface
                      presentation={presentation}
                      slide={previewSlideWithBackground}
                      sectionId={previewSectionId}
                      mediaLibrary={mediaLibrary}
                      empty="—"
                      shadow="none"
                      minPaddingX={8}
                      minPaddingY={8}
                      showPlaceholder={false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 px-3 pb-2 flex gap-1.5">
            <button
              onClick={isPresenting ? handleStop : handleStart}
              className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium h-11 text-text-on-accent border-none cursor-pointer"
              style={{
                background: isPresenting ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              {isPresenting ? '⏹ Stop' : '▶ Start'}
            </button>
            <button
              onClick={() => sendBlack()}
              className="flex-1 flex items-center justify-center rounded text-xs font-medium h-11 cursor-pointer"
              style={{
                background: isBlack ? 'var(--on-dark-2)' : 'var(--bg-app)',
                color: isBlack ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                border: `1px solid ${isBlack ? 'var(--on-dark-5)' : 'var(--border-default)'}`,
              }}
            >
              ⬛ Black
            </button>
            <button
              onClick={() => sendLogo()}
              className="flex-1 flex items-center justify-center rounded text-xs font-medium h-11 cursor-pointer"
              style={{
                background: isLogo ? 'rgba(74,124,255,0.15)' : 'var(--bg-app)',
                color: isLogo ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${isLogo ? 'var(--accent)' : 'var(--border-default)'}`,
              }}
            >
              🏠 Logo
            </button>
          </div>
        </div>

        <div
          data-resize-handle="presenter-divider"
          className="shrink-0 cursor-row-resize bg-transparent border-t border-b border-border-subtle"
          style={{
            height: PRESENTER_PANEL_DIVIDER_HEIGHT,
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            dividerDragRef.current = {
              startY: event.clientY,
              startHeight: topPanelHeight,
            };
            document.body.style.cursor = 'row-resize';
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--border-default)';
          }}
          onMouseLeave={(event) => {
            if (!dividerDragRef.current) {
              event.currentTarget.style.background = 'transparent';
            }
          }}
        />

        <div ref={slideGridRef} className="flex-1 overflow-y-auto px-3 pb-2">
          {!presentation ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-text-tertiary">No presentation open</span>
            </div>
          ) : (
            presentation.sections.map((section) => (
              <div key={section.id} className="mb-3">
                {/* Section divider label */}
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-text-tertiary">
                  <div className="flex-1 h-px bg-border-subtle" />
                  <span className="shrink-0 truncate max-w-[160px]">{section.title}</span>
                  <div className="flex-1 h-px bg-border-subtle" />
                </div>
                {/* Responsive thumbnail grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${slideGridColumns}, minmax(0, 1fr))`,
                    gap: 4,
                  }}
                >
                  {section.slides.map((slide) => {
                    const isLive = slide.id === liveSlideId;
                    const isSelected = !isPresenting && slide.id === selectedSlideId;
                    const songSectionColor = slide.groupId ? getSectionColor(slide.type) : null;
                    // Use the enriched slide (with sectionId + effectiveBackgroundId) from allSlides when available
                    const enriched = allSlides.find((s) => s.id === slide.id) || {
                      ...slide,
                      sectionId: section.id,
                    };
                    return (
                      <button
                        key={slide.id}
                        onClick={() => goToSlide(enriched)}
                        ref={(node) => {
                          if (node) slideButtonRefs.current.set(slide.id, node);
                          else slideButtonRefs.current.delete(slide.id);
                        }}
                        className="bg-on-dark-1 rounded overflow-hidden relative cursor-pointer"
                        style={{
                          aspectRatio: getPresentationAspectRatio(presentation),
                          border: isLive
                            ? `4px solid ${LIVE_SLIDE_OUTLINE_COLOR}`
                            : isSelected
                              ? '3px solid var(--accent)'
                              : '1px solid var(--border-subtle)',
                          boxShadow: isLive
                            ? `0 0 0 1px rgba(0,0,0,0.55), 0 0 0 4px rgba(0,245,122,0.22)`
                            : isSelected
                              ? '0 0 0 2px rgba(74,124,255,0.22)'
                              : 'none',
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
                                background: withColorAlpha(songSectionColor, 0.13),
                                border: `1px solid ${withColorAlpha(songSectionColor, 0.4)}`,
                                color: 'var(--white)',
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
                        <div className="absolute inset-0">
                          <SlidePreviewSurface
                            presentation={presentation}
                            slide={enriched}
                            sectionId={section.id}
                            mediaLibrary={mediaLibrary}
                            empty="—"
                            shadow="none"
                            minPaddingX={7}
                            minPaddingY={5}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Section 4: Navigation ───────────────────────────────── */}
        <div className="shrink-0 flex gap-1.5 px-3 py-2 border-t border-border-subtle">
          <button
            onClick={goPrev}
            disabled={!canGoPrev}
            className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium h-9 bg-bg-app border border-border-default"
            style={{
              color: canGoPrev ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: canGoPrev ? 'pointer' : 'default',
            }}
          >
            ◀ PREV
          </button>
          <button
            onClick={goNext}
            disabled={!canGoNext}
            className="flex-1 flex items-center justify-center gap-1 rounded text-xs font-medium h-9 bg-bg-app border border-border-default"
            style={{
              color: canGoNext ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: canGoNext ? 'pointer' : 'default',
            }}
          >
            NEXT ▶
          </button>
        </div>
      </div>
    </div>
  );
}
