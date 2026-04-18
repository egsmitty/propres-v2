import React, { useEffect, useRef, useState } from 'react'
import { getPresentationScale } from '@/utils/presentationSizing'
import { resolvePlaceholderText } from '@/utils/sectionTypes'
import { slideBodyToHtml } from '@/utils/slideMarkup'

export default function ScaledSlideText({
  presentation,
  slide,
  empty = '—',
  shadow = 'none',
  minPaddingX = 4,
  minPaddingY = 4,
  showPlaceholder = true,
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
  const fontSize = (slide?.textStyle?.size || 100) * scale
  const emptyText = showPlaceholder ? resolvePlaceholderText(slide?.placeholderText, empty) : empty
  const textBox = slide?.textBox || { x: 240, y: 270, width: 1440, height: 540, backgroundColor: 'transparent' }
  const paddingX = Math.max(minPaddingX, 28 * scale)
  const paddingY = Math.max(minPaddingY, 22 * scale)

  const verticalStyle =
    valign === 'top'
      ? { justifyContent: 'flex-start' }
      : valign === 'bottom'
      ? { justifyContent: 'flex-end' }
      : { justifyContent: 'center' }

  return (
    <div ref={frameRef} className="relative w-full h-full overflow-hidden">
      <div
        style={{
          position: 'absolute',
          left: textBox.x * scale,
          top: textBox.y * scale,
          width: textBox.width * scale,
          height: textBox.height * scale,
          display: 'flex',
          flexDirection: 'column',
          padding: `${paddingY}px ${paddingX}px`,
          textAlign: slide?.textStyle?.align || 'center',
          color: slide?.textStyle?.color || '#ffffff',
          fontSize,
          fontWeight: slide?.textStyle?.bold ? 700 : 400,
          fontStyle: slide?.textStyle?.italic ? 'italic' : 'normal',
          textDecoration: slide?.textStyle?.underline ? 'underline' : 'none',
          lineHeight: slide?.textStyle?.lineHeight || 1.3,
          fontFamily: slide?.textStyle?.fontFamily || 'Arial, sans-serif',
          wordBreak: 'break-word',
          textShadow: shadow,
          background: textBox.backgroundColor || 'transparent',
          borderRadius: Math.max(4, 10 * scale),
          overflow: 'hidden',
          ...verticalStyle,
        }}
      >
        {slide?.body ? (
          <div dangerouslySetInnerHTML={{ __html: slideBodyToHtml(slide.body) }} />
        ) : emptyText ? (
          <span
            style={{
              color: '#6b7280',
              fontSize,
              fontWeight: slide?.textStyle?.bold ? 700 : 400,
              fontStyle: slide?.textStyle?.italic ? 'italic' : 'normal',
              textDecoration: slide?.textStyle?.underline ? 'underline' : 'none',
              lineHeight: slide?.textStyle?.lineHeight || 1.3,
              fontFamily: slide?.textStyle?.fontFamily || 'Arial, sans-serif',
            }}
          >
            {emptyText}
          </span>
        ) : null}
      </div>
    </div>
  )
}
