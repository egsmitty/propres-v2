import React, { useEffect, useMemo, useState } from 'react'
import { slideBodyToHtml } from '@/utils/slideMarkup'

function renderSlideBody(slide, emptyMessage) {
  if (!slide?.body) {
    return <div style={{ color: 'rgba(255,255,255,0.34)' }}>{emptyMessage}</div>
  }

  return <div dangerouslySetInnerHTML={{ __html: slideBodyToHtml(slide.body) }} />
}

export default function StageDisplayRenderer() {
  const [currentSlide, setCurrentSlide] = useState(null)
  const [nextSlide, setNextSlide] = useState(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return undefined

    api.notifyStageDisplayReady?.()

    const offUpdate = api.onStageUpdate?.(({ currentSlide: current, nextSlide: next }) => {
      setCurrentSlide(current || null)
      setNextSlide(next || null)
    })

    return () => {
      offUpdate?.()
    }
  }, [])

  const currentMarkup = useMemo(
    () => renderSlideBody(currentSlide, 'Stage Display waiting for a live slide'),
    [currentSlide]
  )
  const nextMarkup = useMemo(
    () => renderSlideBody(nextSlide, 'No upcoming slide'),
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6vh 7vw 24vh',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '84vw',
            fontSize: 'clamp(52px, 5.8vw, 110px)',
            lineHeight: 1.12,
            fontWeight: 700,
            color: '#ffffff',
            textShadow: '0 10px 28px rgba(0,0,0,0.38)',
          }}
        >
          {currentMarkup}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '3.5vh',
          transform: 'translateX(-50%)',
          width: 'min(88vw, 1680px)',
          minHeight: '14vh',
          padding: '18px 28px 20px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 10,
          }}
        >
          Next
        </div>
        <div
          style={{
            fontSize: 'clamp(24px, 2.35vw, 44px)',
            lineHeight: 1.18,
            fontWeight: 600,
            color: '#ffffff',
            textAlign: 'left',
          }}
        >
          {nextMarkup}
        </div>
      </div>
    </div>
  )
}
