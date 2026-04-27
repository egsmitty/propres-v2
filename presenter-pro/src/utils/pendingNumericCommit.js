let pendingNumericFieldCommit = null

export function registerPendingNumericFieldCommit(commit) {
  pendingNumericFieldCommit = typeof commit === 'function' ? commit : null
}

export function clearPendingNumericFieldCommit(commit = null) {
  if (!commit || pendingNumericFieldCommit === commit) {
    pendingNumericFieldCommit = null
  }
}

export function flushPendingNumericFieldCommit() {
  const commit = pendingNumericFieldCommit
  pendingNumericFieldCommit = null
  commit?.()
}

