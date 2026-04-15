import React, { useState, useEffect, useRef } from 'react'
import { getMedia } from '@/utils/ipc'
import { fileUrlForPath, isVideoMedia } from '@/utils/backgrounds'
import { isMediaSlide } from '@/utils/sectionTypes'

function formatRemaining(endAt) {
  if (!endAt) return '00:00'
  const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function OutputRenderer() {
  const [slide, setSlide] = useState(null)
  const [background, setBackground] = useState(null)
  const [mediaSlideItem, setMediaSlideItem] = useState(null)
  const [media, setMedia] = useState([])
  const [isBlack, setIsBlack] = useState(false)
  const [isLogo, setIsLogo] = useState(false)
  const [countdown, setCountdown] = useState({ active: false, endAt: null, durationSeconds: 0 })
  const [remaining, setRemaining] = useState('00:00')
  const mediaRef = useRef([])
  const backgroundRef = useRef(null)
  const backgroundIdRef = useRef(null)

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    backgroundRef.current = background
  }, [background])

  useEffect(() => {
    if (!countdown.active || !countdown.endAt) {
      setRemaining('00:00')
      return
    }

    const sync = () => setRemaining(formatRemaining(countdown.endAt))
    sync()
    const interval = window.setInterval(sync, 250)
    return () => window.clearInterval(interval)
  }, [countdown])

  useEffect(() => {
    loadMedia()

    const api = window.electronAPI
    if (!api) return

    api.notifyOutputReady?.()

    const offUpdate = api.onOutputUpdate(async ({ slide: s, background: bg }) => {
      setSlide(s)
      setIsBlack(false)
      setIsLogo(false)

      if (isMediaSlide(s)) {
        const library = mediaRef.current.length ? mediaRef.current : await fetchMedia()
        const mediaItem = library.find((item) => item.id === s.mediaId) || null
        setMediaSlideItem(mediaItem)
        setBackground(null)
        backgroundIdRef.current = null
        return
      }

      setMediaSlideItem(null)

      const nextBackgroundId = bg?.id || s?.effectiveBackgroundId || null
      if (!nextBackgroundId) {
        setBackground(null)
        backgroundIdRef.current = null
        return
      }

      if (backgroundIdRef.current === nextBackgroundId && backgroundRef.current) {
        return
      }

      const library = mediaRef.current.length ? mediaRef.current : await fetchMedia()
      const nextBackground = bg || library.find((item) => item.id === nextBackgroundId) || null
      setBackground(nextBackground)
      backgroundIdRef.current = nextBackgroundId
    })

    const offBlack = api.onOutputBlack(({ active }) => {
      setIsBlack(Boolean(active))
      if (active) setIsLogo(false)
    })

    const offLogo = api.onOutputLogo(({ active }) => {
      setIsLogo(Boolean(active))
      if (active) setIsBlack(false)
    })
    const offCountdown = api.onOutputCountdown((state) => {
      setCountdown(state || { active: false, endAt: null, durationSeconds: 0 })
    })

    return () => {
      offUpdate?.()
      offBlack?.()
      offLogo?.()
      offCountdown?.()
    }
  }, [])

  async function loadMedia() {
    const library = await fetchMedia()
    setMedia(library)
    mediaRef.current = library
  }

  async function fetchMedia() {
    const result = await getMedia()
    return result?.success ? result.data : []
  }

  if (isBlack) {
    return <div style={{ width: '100vw', height: '100vh', background: '#000' }} />
  }

  if (isLogo) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 120, height: 120, background: '#4a7cff', borderRadius: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 48, fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif',
          }}
        >
          P
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw', height: '100vh', background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        position: 'relative',
      }}
    >
      {mediaSlideItem?.file_path ? (
        <OutputBackground media={mediaSlideItem} />
      ) : background?.file_path ? (
        <OutputBackground media={background} />
      ) : null}
      {!mediaSlideItem?.file_path && background?.file_path && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.22)',
          }}
        />
      )}
      {!mediaSlideItem?.file_path && slide?.body && (
        <div
          style={{
            position: 'relative',
            color: slide.textStyle?.color || '#ffffff',
            fontSize: slide.textStyle?.size || 64,
            fontWeight: slide.textStyle?.bold ? 700 : 400,
            textAlign: slide.textStyle?.align || 'center',
            maxWidth: '80%',
            lineHeight: 1.3,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            fontFamily: 'Inter, system-ui, sans-serif',
            WebkitFontSmoothing: 'antialiased',
          }}
        >
          {slide.body}
        </div>
      )}
      {countdown.active && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            right: 36,
            padding: '14px 18px',
            borderRadius: 18,
            background: 'rgba(9, 14, 26, 0.66)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#ffffff',
            fontFamily: 'Inter, system-ui, sans-serif',
            textAlign: 'right',
            minWidth: 144,
            boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.72 }}>
            Countdown
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, marginTop: 6 }}>
            {remaining}
          </div>
        </div>
      )}
    </div>
  )
}

function OutputBackground({ media }) {
  const src = fileUrlForPath(media.file_path)
  if (!src) return null

  if (isVideoMedia(media)) {
    return (
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    )
  }

  return (
    <img
      src={src}
      alt={media.name}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  )
}
