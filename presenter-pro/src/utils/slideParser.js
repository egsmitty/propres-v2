import { createTextSlide } from './sectionTypes'

const LABEL_RE = /^(verse|chorus|bridge|intro|outro|pre-chorus|tag|turnaround|turn|t\.a\.|blank)\s*\d*/i

function resolveType(raw) {
  const lower = raw.toLowerCase().replace(/-/g, '')
  if (lower === 'prechorus') return 'chorus'
  if (lower === 'turn' || lower === 'ta' || lower === 't.a.') return 'turnaround'
  return lower
}

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
      type = resolveType(match[1])
      label = firstLine
      body = lines.slice(1).join('\n')
    } else {
      type = 'verse'
      verseCount++
      label = `Verse ${verseCount}`
      body = lines.join('\n')
    }

    slides.push(createTextSlide('song', { type, label, body }))
  }

  return slides
}
