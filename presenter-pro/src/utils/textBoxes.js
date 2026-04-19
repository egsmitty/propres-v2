import { uuid } from '@/utils/uuid'

export const DEFAULT_PLACEHOLDER_TEXT = 'Double-click to edit'

export const DEFAULT_TEXT_STYLE = {
  fontFamily: 'Arial, sans-serif',
  size: 100,
  color: '#ffffff',
  highlightColor: 'transparent',
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'center',
  valign: 'middle',
  justify: false,
  lineHeight: 1.3,
  paragraphBefore: 0,
  paragraphAfter: 0,
  bullets: false,
  numbering: false,
  indent: 0,
}

const LEGACY_DEFAULT_TEXT_BOX = {
  x: 240,
  y: 270,
  width: 1440,
  height: 540,
}

export const DEFAULT_TEXT_BOX = {
  x: 320,
  y: 330,
  width: 1280,
  height: 420,
  rotation: 0,
  zIndex: 0,
  fillType: 'solid',
  backgroundColor: 'transparent',
  fillOpacity: 1,
  outlineColor: '#ffffff',
  outlineWidth: 0,
  outlineStyle: 'solid',
  outlineOpacity: 1,
  shadowEnabled: false,
  shadowColor: 'rgba(0,0,0,0.35)',
  shadowBlur: 18,
  shadowOffsetX: 0,
  shadowOffsetY: 10,
  cornerRadius: 14,
  paddingTop: 22,
  paddingRight: 28,
  paddingBottom: 22,
  paddingLeft: 28,
  wrapText: true,
  autoFit: 'none',
  textDirection: 'horizontal',
  opacity: 1,
}

export function mergeTextStyle(style = {}) {
  const next = { ...DEFAULT_TEXT_STYLE, ...(style || {}) }
  if (next.valign === 'center') next.valign = 'middle'
  return next
}

export function mergeTextBox(frame = {}) {
  return { ...DEFAULT_TEXT_BOX, ...(frame || {}) }
}

export function resolvePlaceholderText(text, fallback = DEFAULT_PLACEHOLDER_TEXT) {
  if (!text) return fallback
  return text === 'Click to edit' ? DEFAULT_PLACEHOLDER_TEXT : text
}

export function getDefaultAutoFitMode(slideOrType) {
  const type = typeof slideOrType === 'string' ? slideOrType : slideOrType?.type
  return type === 'song' ? 'shrink' : 'none'
}

function isLegacyDefaultFrame(frame = {}) {
  return frame
    && frame.x === LEGACY_DEFAULT_TEXT_BOX.x
    && frame.y === LEGACY_DEFAULT_TEXT_BOX.y
    && frame.width === LEGACY_DEFAULT_TEXT_BOX.width
    && frame.height == LEGACY_DEFAULT_TEXT_BOX.height
}

function upgradeLegacyFrame(frame = {}) {
  return isLegacyDefaultFrame(frame) ? { ...DEFAULT_TEXT_BOX, ...frame, x: DEFAULT_TEXT_BOX.x, y: DEFAULT_TEXT_BOX.y, width: DEFAULT_TEXT_BOX.width, height: DEFAULT_TEXT_BOX.height } : frame
}

function legacyTextBoxId(slide) {
  return slide?.id ? `${slide.id}::textbox-1` : uuid()
}

export function createTextBox(overrides = {}, options = {}) {
  const {
    id,
    body,
    placeholderText,
    textStyle: rawTextStyle,
    ...frameOverrides
  } = overrides || {}

  const textStyle = mergeTextStyle(rawTextStyle)
  const frame = mergeTextBox({
    autoFit: options.autoFit ?? frameOverrides.autoFit ?? 'none',
    ...frameOverrides,
  })

  return {
    id: id || uuid(),
    body: body || '',
    placeholderText: resolvePlaceholderText(placeholderText),
    textStyle,
    ...frame,
  }
}

export function normalizeTextBox(textBox, slide, index = 0) {
  const upgradedFrame = upgradeLegacyFrame(textBox || {})
  const {
    id,
    body,
    placeholderText,
    textStyle: rawTextStyle,
    ...frameProps
  } = upgradedFrame || {}

  return {
    id: id || (index === 0 ? legacyTextBoxId(slide) : uuid()),
    body: body || '',
    placeholderText: resolvePlaceholderText(placeholderText),
    textStyle: mergeTextStyle(rawTextStyle),
    ...mergeTextBox({
      autoFit: frameProps?.autoFit ?? getDefaultAutoFitMode(slide),
      zIndex: textBox?.zIndex ?? index,
      ...frameProps,
    }),
  }
}

export function getSlideTextBoxes(slide) {
  if (!slide || slide.type === 'media') return []

  if (Array.isArray(slide.textBoxes) && slide.textBoxes.length > 0) {
    return slide.textBoxes
      .map((textBox, index) => normalizeTextBox(textBox, slide, index))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }

  const upgradedFrame = upgradeLegacyFrame(slide.textBox || {})

  return [
    normalizeTextBox(
      {
        id: legacyTextBoxId(slide),
        body: slide.body || '',
        placeholderText: slide.placeholderText,
        textStyle: slide.textStyle,
        ...upgradedFrame,
        autoFit: upgradedFrame?.autoFit ?? getDefaultAutoFitMode(slide),
      },
      slide,
      0
    ),
  ]
}

export function syncLegacyTextFields(slide, textBoxes = getSlideTextBoxes(slide)) {
  if (!slide || slide.type === 'media') {
    return {
      ...slide,
      textBoxes: [],
      body: '',
      placeholderText: null,
    }
  }

  const sortedBoxes = [...textBoxes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const primary = sortedBoxes[0] || createTextBox({}, { autoFit: getDefaultAutoFitMode(slide) })

  return {
    ...slide,
    body: primary.body,
    placeholderText: primary.placeholderText,
    textStyle: mergeTextStyle(primary.textStyle),
    textBox: mergeTextBox(primary),
    textBoxes: sortedBoxes,
  }
}

export function withUpdatedSlideTextBoxes(slide, updater) {
  const current = getSlideTextBoxes(slide)
  const next = updater(current).map((textBox, index) => normalizeTextBox({ ...textBox, zIndex: textBox.zIndex ?? index }, slide, index))
  return syncLegacyTextFields(slide, next)
}

export function findTextBox(slide, textBoxId) {
  return getSlideTextBoxes(slide).find((textBox) => textBox.id === textBoxId) || null
}

export function createDefaultTextBoxForSlide(slide, overrides = {}) {
  return createTextBox(
    {
      placeholderText: slide?.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT,
      ...overrides,
    },
    { autoFit: getDefaultAutoFitMode(slide) }
  )
}

export function reorderTextBoxes(textBoxes) {
  return [...textBoxes]
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .map((textBox, index) => ({ ...textBox, zIndex: index }))
}
