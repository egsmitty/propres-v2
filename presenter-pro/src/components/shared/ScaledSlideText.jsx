import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getPresentationScale } from '@/utils/presentationSizing'
import { DEFAULT_TEXT_STYLE, getSlideTextBoxes, resolvePlaceholderText } from '@/utils/textBoxes'
import { slideBodyToHtml } from '@/utils/slideMarkup'

function resolveVerticalAlignment(box) {
  const valign = box?.textStyle?.valign || 'middle'
  if (valign === 'top') return { justifyContent: 'flex-start' }
  if (valign === 'bottom') return { justifyContent: 'flex-end' }
  if (valign === 'center') return { justifyContent: 'center' }
  return { justifyContent: 'center' }
}

function renderOutline(box, scale) {
  const width = (box.outlineWidth || 0) * scale
  if (!width || box.outlineColor === 'transparent') return 'none'
  const style = box.outlineStyle || 'solid'
  return `${Math.max(1, width)}px ${style} ${box.outlineColor}`
}

function renderShadow(box, scale, fallbackShadow) {
  if (box.shadowEnabled) {
    return `${(box.shadowOffsetX || 0) * scale}px ${(box.shadowOffsetY || 10) * scale}px ${Math.max(4, (box.shadowBlur || 18) * scale)}px ${box.shadowColor || 'rgba(0,0,0,0.35)'}`
  }
  return fallbackShadow
}

function renderTextDecoration(style) {
  return [
    style?.underline ? 'underline' : null,
    style?.strikethrough ? 'line-through' : null,
  ].filter(Boolean).join(' ') || 'none'
}

function renderBody(box, empty, showPlaceholder) {
  if (box.body) return { html: slideBodyToHtml(box.body), placeholder: false }
  if (!showPlaceholder) return { html: '', placeholder: false }
  return { html: resolvePlaceholderText(box.placeholderText, empty), placeholder: true }
}

function scaleInlineHtml(html, scale) {
  if (!html || scale === 1) return html

  const scalePx = (_, value) => {
    const next = Math.max(1, Number.parseFloat(value || '0') * scale)
    return `${next.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}px`
  }

  return String(html)
    .replace(/font-size\s*:\s*([\d.]+)px/gi, (match, value) => match.replace(value + 'px', scalePx('', value)))
    .replace(/line-height\s*:\s*([\d.]+)px/gi, (match, value) => match.replace(value + 'px', scalePx('', value)))
}

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
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })

    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [])

  const scale = getPresentationScale(presentation, size.width, size.height)
  const textBoxes = useMemo(() => getSlideTextBoxes(slide), [slide])

  return (
    <div ref={frameRef} className="relative w-full h-full overflow-hidden">
      {textBoxes.map((box) => {
        const fontSize = (box?.textStyle?.size || DEFAULT_TEXT_STYLE.size) * scale
        const body = renderBody(box, empty, showPlaceholder)
        const renderedHtml = body.placeholder ? body.html : scaleInlineHtml(body.html, scale)
        const paddingX = Math.max(minPaddingX, (box.paddingLeft || 28) * scale)
        const paddingRight = Math.max(minPaddingX, (box.paddingRight || 28) * scale)
        const paddingY = Math.max(minPaddingY, (box.paddingTop || 22) * scale)
        const paddingBottom = Math.max(minPaddingY, (box.paddingBottom || 22) * scale)
        const textDirection = box.textDirection === 'vertical' ? 'vertical-rl' : 'horizontal-tb'
        const writingMode = textDirection === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb'
        const transform = box.rotation ? `rotate(${box.rotation}deg)` : 'none'
        const verticalStyle = resolveVerticalAlignment(box)

        return (
          <div
            key={box.id}
            style={{
              position: 'absolute',
              left: box.x * scale,
              top: box.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              display: 'flex',
              flexDirection: 'column',
              padding: `${paddingY}px ${paddingRight}px ${paddingBottom}px ${paddingX}px`,
              textAlign: box?.textStyle?.align || 'center',
              color: body.placeholder ? '#888888' : box?.textStyle?.color || '#ffffff',
              fontSize,
              fontWeight: box?.textStyle?.bold ? 700 : 400,
              fontStyle: body.placeholder ? 'italic' : (box?.textStyle?.italic ? 'italic' : 'normal'),
              textDecoration: renderTextDecoration(box?.textStyle),
              lineHeight: box?.textStyle?.lineHeight || 1.3,
              fontFamily: box?.textStyle?.fontFamily || 'Arial, sans-serif',
              wordBreak: box.wrapText === false ? 'normal' : 'break-word',
              whiteSpace: box.wrapText === false ? 'nowrap' : 'normal',
              textShadow: renderShadow(box, scale, shadow),
              background:
                box.fillType === 'solid' || !box.fillType
                  ? box.backgroundColor || 'transparent'
                  : box.backgroundColor || 'transparent',
              borderRadius: Math.max(0, (box.cornerRadius || 0) * scale),
              border: renderOutline(box, scale),
              overflow: 'hidden',
              opacity: box.opacity ?? 1,
              transform,
              transformOrigin: 'center center',
              writingMode,
              ...verticalStyle,
            }}
          >
            {body.placeholder ? (
              <span>{body.html}</span>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
