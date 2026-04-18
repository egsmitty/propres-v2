import React, { useEffect, useRef, useState } from 'react'
import { getPresentationScale } from '@/utils/presentationSizing'
import { slideBodyToHtml } from '@/utils/slideMarkup'

export default function ScaledSlideText({
  presentation,
  slide,
  empty = '—',
  shadow = 'none',
  basePaddingX = 96,
  basePaddingY = 80,
  minPaddingX = 4,
  minPaddingY = 4,
}) {
  const frameRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!frameRef.current) return undefined

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [])

  const scale = getPresentationScale(presentation, size.width, size.height)
  const valign = slide?.textStyle?.valign || 'center'
  const fontSize = (slide?.textStyle?.size || 52) * scale

  const verticalStyle =
    valign === 'top'
      ? { justifyContent: 'flex-start', paddingTop: Math.max(minPaddingY, basePaddingY * scale) }
      : valign === 'bottom'
      ? { justifyContent: 'flex-end', paddingBottom: Math.max(minPaddingY, basePaddingY * scale) }
      : { justifyContent: 'center' }

  return (
    <div ref={frameRef} className="relative w-full h-full overflow-hidden">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: Math.max(minPaddingX, basePaddingX * scale),
          paddingRight: Math.max(minPaddingX, basePaddingX * scale),
          textAlign: slide?.textStyle?.align || 'center',
          color: slide?.textStyle?.color || '#ffffff',
          fontSize,
          fontWeight: slide?.textStyle?.bold ? 700 : 400,
          lineHeight: 1.3,
          wordBreak: 'break-word',
          textShadow: shadow,
          ...verticalStyle,
        }}
      >
        {slide?.body ? (
          <div dangerouslySetInnerHTML={{ __html: slideBodyToHtml(slide.body) }} />
        ) : (
          <span style={{ color: '#555', fontSize: Math.max(8, 28 * scale) }}>{empty}</span>
        )}
      </div>
    </div>
  )
}
