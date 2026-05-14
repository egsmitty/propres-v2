function detectPlatform() {
  if (typeof window === 'undefined') return 'unknown'

  const reportedPlatform = window.electronAPI?.platform
  if (reportedPlatform) return reportedPlatform

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (userAgent.includes('Mac')) return 'darwin'
  if (userAgent.includes('Windows')) return 'win32'
  if (userAgent.includes('Linux')) return 'linux'
  return 'unknown'
}

export function getPlatform() {
  return detectPlatform()
}

export function isMacPlatform(platform = detectPlatform()) {
  return platform === 'darwin'
}

function mapShortcutToken(token, mac) {
  const normalized = String(token || '').toLowerCase()

  if (normalized === 'mod') return mac ? '⌘' : 'Ctrl'
  if (normalized === 'shift') return mac ? '⇧' : 'Shift'
  if (normalized === 'alt') return mac ? '⌥' : 'Alt'
  if (normalized === 'esc' || normalized === 'escape') return 'Esc'
  if (normalized === 'left') return '←'
  if (normalized === 'right') return '→'
  if (normalized.length === 1) return normalized.toUpperCase()

  return token
}

export function getShortcutKeys(tokens = [], platform = detectPlatform()) {
  const mac = isMacPlatform(platform)
  return tokens.map((token) => mapShortcutToken(token, mac))
}

export function formatShortcutLabel(tokens = [], platform = detectPlatform()) {
  const keys = getShortcutKeys(tokens, platform)
  return isMacPlatform(platform) ? keys.join('') : keys.join('+')
}
