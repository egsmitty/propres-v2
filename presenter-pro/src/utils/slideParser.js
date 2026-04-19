import { createTextSlide } from './sectionTypes'

// Matches section labels like [Verse 1], [Chorus], Verse 1, BRIDGE, etc.
const LABEL_RE = /^\[?(verse|chorus|bridge|intro|outro|pre-chorus|tag|turnaround|turn|t\.a\.|blank|custom)\s*\d*\]?$/i

function resolveType(raw) {
  const lower = raw.toLowerCase().replace(/[\[\]-]/g, '').replace(/\s+/g, '')
  if (lower === 'prechorus') return 'chorus'
  if (lower === 'turn' || lower === 'ta' || lower === 'turnaround') return 'turnaround'
  return lower.replace(/\d+$/, '') // strip trailing numbers for type resolution
}

/**
 * Parse raw lyrics text.
 *
 * Rules:
 *  - A line matching LABEL_RE (with or without [brackets]) starts a new section group.
 *  - Every subsequent non-blank line becomes its own slide in that group.
 *  - Blank lines are ignored (they don't start new sections).
 *  - Lines before any label are treated as Verse 1.
 *
 * Example:
 *   [Verse 1]        → section label, type = verse
 *   Amazing grace    → slide 1 body
 *   How sweet the    → slide 2 body
 *   [Chorus]         → new section label
 *   Praise him       → slide 3 body
 */
export function parseSlides(text) {
  const lines = text.split('\n').map((l) => l.trim())

  let currentType = 'verse'
  let currentLabel = 'Verse 1'
  let hasSeenLabel = false
  let verseCount = 0
  const slides = []

  for (const line of lines) {
    if (!line) continue // skip blank lines

    const match = line.match(LABEL_RE)
    if (match) {
      currentType = resolveType(match[1])
      // Preserve original label text (strip brackets if present)
      currentLabel = line.replace(/^\[|\]$/g, '')
      hasSeenLabel = true
      continue
    }

    // First content line before any label → auto-assign Verse 1
    if (!hasSeenLabel) {
      verseCount++
      currentLabel = `Verse ${verseCount}`
      currentType = 'verse'
      hasSeenLabel = true
    }

    slides.push(createTextSlide('song', { type: currentType, label: currentLabel, body: line }))
  }

  return slides
}
