import React, { useEffect, useState } from 'react'
import { getSettings } from '@/utils/ipc'
import { slideBodyToHtml } from '@/utils/slideMarkup'
import ScaledSlideText from '@/components/shared/ScaledSlideText'

const DEFAULT_THEME = {
  fontSize: 84,
  textColor: '#ffffff',
  backgroundColor: '#000000',
}

function parseTheme(value) {
  try {
    return { ...DEFAULT_THEME, ...(value ? JSON.parse(value) : {}) }
  } catch {
    return DEFAULT_THEME
  }
}

export default function StageDisplayRenderer() {
  const [currentSlide, setCurrentSlide] = useState(null)
  const [nextSlide, setNextSlide] = useState(null)
  const [theme, setTheme] = useState(DEFAULT_THEME)

  useEffect(() => {
    let cancelled = false

    async function loadTheme() {
      const result = await getSettings()
      if (cancelled) return
      setTheme(parseTheme(result?.success ? result.data?.['stageDisplay.theme'] : null))
    }

    loadTheme()

    const api = window.electronAPI
    if (!api) return () => {
      cancelled = true
    }

    api.notifyStageDisplayReady?.()

    const offUpdate = api.onStageUpdate?.(({ currentSlide: current, nextSlide: next }) => {
      setCurrentSlide(current || null)
      setNextSlide(next || null)
    })
    const offSettings = api.onSettingsUpdated?.(({ key, value }) => {
      if (key === 'stageDisplay.theme') setTheme(parseTheme(value))
    })

    return () => {
      cancelled = true
      offUpdate?.()
      offSettings?.()
    }
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: theme.backgroundColor,
        color: theme.textColor,
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
          padding: '6vh 8vw',
          textAlign: 'center',
        }}
      >
        {currentSlide?.body ? (
          <div
            dangerouslySetInnerHTML={{ __html: slideBodyToHtml(currentSlide.body) }}
            style={{
              maxWidth: '84vw',
              fontSize: theme.fontSize,
              lineHeight: 1.18,
              fontWeight: 700,
              color: theme.textColor,
              textShadow: '0 8px 28px rgba(0,0,0,0.35)',
            }}
          />
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.36)', fontSize: 32 }}>
            Stage Display waiting for a live slide
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          right: 28,
          bottom: 28,
          width: '23vw',
          minWidth: 260,
          maxWidth: 420,
          padding: 12,
          borderRadius: 18,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Next Slide
        </div>
        <div
          style={{
            aspectRatio: nextSlide?.aspectRatio === '4:3' ? '4 / 3' : nextSlide?.aspectRatio === '16:10' ? '16 / 10' : '16 / 9',
            background: '#050505',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <ScaledSlideText
            presentation={nextSlide}
            slide={nextSlide}
            empty="No upcoming slide"
            shadow="none"
            minPaddingX={14}
            minPaddingY={14}
            showPlaceholder={false}
          />
        </div>
      </div>
    </div>
  )
}
