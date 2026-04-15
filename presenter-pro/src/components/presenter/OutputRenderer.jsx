import React, { useState, useEffect } from 'react'
import { getMedia } from '@/utils/ipc'
import { fileUrlForPath, isVideoMedia } from '@/utils/backgrounds'

export default function OutputRenderer() {
  const [slide, setSlide] = useState(null)
  const [background, setBackground] = useState(null)
  const [media, setMedia] = useState([])
  const [isBlack, setIsBlack] = useState(false)
  const [isLogo, setIsLogo] = useState(false)

  useEffect(() => {
    loadMedia()

    const api = window.electronAPI
    if (!api) return

    api.onOutputUpdate(async ({ slide: s, background: bg }) => {
      setSlide(s)
      setBackground(bg || null)
      setIsBlack(false)
      setIsLogo(false)

      if (!bg && s?.effectiveBackgroundId) {
        const library = media.length ? media : await fetchMedia()
        setBackground(library.find((item) => item.id === s.effectiveBackgroundId) || null)
      }
    })

    api.onOutputBlack(() => {
      setIsBlack((v) => !v)
      setIsLogo(false)
    })

    api.onOutputLogo(() => {
      setIsLogo((v) => !v)
      setIsBlack(false)
    })
  }, [])

  async function loadMedia() {
    const library = await fetchMedia()
    setMedia(library)
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
      {background?.file_path && (
        <OutputBackground media={background} />
      )}
      {background?.file_path && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.22)',
          }}
        />
      )}
      {slide?.body && (
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
