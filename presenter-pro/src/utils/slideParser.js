import { uuid } from './uuid'

const LABEL_RE = /^(verse|chorus|bridge|intro|outro|pre-chorus|tag)\s*\d*/i

/**
 * Parse raw lyrics text into an array of slide objects.
 * Blocks are separated by blank lines.
 */
export function parseSlides(text) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  let verseCount = 0
  const slides = []

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const firstLine = lines[0]
    const match = firstLine.match(LABEL_RE)

    let type, label, body

    if (match) {
      type = match[1].toLowerCase().replace('-', '')
      if (type === 'precchorus') type = 'chorus'
      label = firstLine
      body = lines.slice(1).join('\n')
    } else {
      type = 'verse'
      verseCount++
      label = `Verse ${verseCount}`
      body = lines.join('\n')
    }

    slides.push({
      id: uuid(),
      type,
      label,
      body,
      notes: '',
      backgroundId: null,
      textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
    })
  }

  return slides
}
