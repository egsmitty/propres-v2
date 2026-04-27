import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { slideBodyToPlainText } from '@/utils/slideMarkup'

function getStageText(slide, emptyMessage) {
  const text = slideBodyToPlainText(slide?.body || '')
  return text || emptyMessage
}

function StageTextBlock({ text, empty = false, fontSize, lineHeight, textAlign = 'center' }) {
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        fontSize,
        lineHeight,
        fontWeight: empty ? 500 : 700,
        textAlign,
        color: empty ? 'rgba(255,255,255,0.34)' : '#ffffff',
      }}
    >
      {text}
    </div>
  )
}

export default function StageDisplayRenderer() {
  const [currentSlide, setCurrentSlide] = useState(null)
  const [nextSlide, setNextSlide] = useState(null)
  const [isPreviewWindow, setIsPreviewWindow] = useState(true)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return undefined

    api.notifyStageDisplayReady?.()
    api.getWindowViewState?.().then((result) => {
      if (result?.success) setIsPreviewWindow(!result.data?.isFullScreen)
    }).catch(() => {})

    const offUpdate = api.onStageUpdate?.(({ currentSlide: current, nextSlide: next }) => {
      setCurrentSlide(current || null)
      setNextSlide(next || null)
    })
    const offViewState = api.onWindowViewState?.(({ isFullScreen }) => {
      setIsPreviewWindow(!isFullScreen)
    })

    return () => {
      offUpdate?.()
      offViewState?.()
    }
  }, [])

  const currentText = useMemo(
    () => getStageText(currentSlide, 'Waiting for live slide'),
    [currentSlide]
  )
  const nextText = useMemo(
    () => getStageText(nextSlide, 'No upcoming slide'),
    [nextSlide]
  )

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000000',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isPreviewWindow ? (
        <button
          type="button"
          onClick={() => window.electronAPI?.closeStageDisplayWindow?.()}
          style={{
            position: 'absolute',
            top: 22,
            right: 22,
            zIndex: 10,
            height: 42,
            padding: '0 14px 0 12px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(18,18,18,0.82)',
            color: 'rgba(255,255,255,0.92)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
          }}
        >
          <X size={16} />
          <span>Close Preview</span>
        </button>
      ) : null}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '5vh 6vw 28vh',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: !currentSlide?.body ? 'min(72vw, 1120px)' : 'min(90vw, 1820px)',
            textShadow: '0 10px 28px rgba(0,0,0,0.38)',
          }}
        >
          <StageTextBlock
            text={currentText}
            empty={!currentSlide?.body}
            fontSize={!currentSlide?.body ? 'clamp(42px, 4.2vw, 72px)' : 'clamp(58px, 6.2vw, 122px)'}
            lineHeight={!currentSlide?.body ? 1.12 : 1.08}
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '3vh',
          transform: 'translateX(-50%)',
          width: 'min(92vw, 1760px)',
          minHeight: '18vh',
          padding: '22px 32px 24px',
          borderRadius: 20,
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.26)',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 12,
          }}
        >
          Next
        </div>
        <StageTextBlock
          text={nextText}
          empty={!nextSlide?.body}
          fontSize="clamp(30px, 2.9vw, 52px)"
          lineHeight={1.16}
          textAlign="left"
        />
      </div>
    </div>
  )
}
