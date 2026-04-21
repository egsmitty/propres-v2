const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i

function normalizeEntities(text) {
  return String(text || '')
    .replace(/&amp;nbsp;/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function slideBodyToHtml(body) {
  const value = normalizeEntities(body).replace(/\r\n?/g, '\n')
  if (!value) return ''

  if (!HTML_TAG_RE.test(value)) {
    return escapeHtml(value).replace(/\n/g, '<br />')
  }

  return value.replace(/\n/g, '<br />')
}

export function slideBodyToPlainText(body) {
  const value = normalizeEntities(body)
  if (!value) return ''

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
