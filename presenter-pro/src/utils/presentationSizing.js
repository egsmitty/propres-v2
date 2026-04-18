export function getPresentationDimensions(presentation) {
  const ratio = presentation?.aspectRatio || '16:9'

  if (ratio === '4:3') return { width: 1440, height: 1080 }
  if (ratio === '16:10') return { width: 1920, height: 1200 }
  if (ratio === 'custom') {
    const width = Math.max(1, Number(presentation?.customAspectWidth) || 1920)
    const height = Math.max(1, Number(presentation?.customAspectHeight) || 1080)
    return { width, height }
  }

  return { width: 1920, height: 1080 }
}

export function getPresentationAspectRatio(presentation) {
  const { width, height } = getPresentationDimensions(presentation)
  return `${width}/${height}`
}

export function getPresentationScale(presentation, containerWidth, containerHeight) {
  const { width, height } = getPresentationDimensions(presentation)
  if (!containerWidth || !containerHeight) return 1
  return Math.min(containerWidth / width, containerHeight / height)
}
