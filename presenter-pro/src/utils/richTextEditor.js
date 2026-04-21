const EDITOR_SELECTOR = '[data-slide-text-editor="true"]'
let savedEditorSelection = null
let lastToolbarInteractionAt = 0

function getSelectionObject() {
  if (typeof window === 'undefined' || !window.getSelection) return null
  return window.getSelection()
}

function nodeBelongsToEditor(node, editor) {
  if (!node || !editor) return false
  return node === editor || editor.contains(node)
}

export function getActiveSlideTextEditor() {
  if (typeof document === 'undefined') return null
  const active = document.activeElement
  if (!active) return null
  if (active.matches?.(EDITOR_SELECTOR)) return active
  return active.closest?.(EDITOR_SELECTOR) || null
}

export function getSavedSlideTextEditor() {
  return savedEditorSelection?.editor || null
}

export function getCurrentOrSavedSlideTextEditor() {
  return getActiveSlideTextEditor() || getSavedSlideTextEditor()
}

export function getCurrentOrSavedTextBoxId() {
  const editor = getCurrentOrSavedSlideTextEditor()
  return editor?.dataset?.textBoxId || null
}

export function hasSelectionInEditor(editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor) return false
  const selection = getSelectionObject()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  return nodeBelongsToEditor(range.commonAncestorContainer, editor)
}

export function getSelectedTextInEditor(editor = getCurrentOrSavedSlideTextEditor()) {
  if (!hasSelectionInEditor(editor)) return ''
  return getSelectionObject()?.toString() || ''
}

export function saveEditorSelection(editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor) return false
  const selection = getSelectionObject()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!nodeBelongsToEditor(range.commonAncestorContainer, editor)) return false
  savedEditorSelection = {
    editor,
    range: range.cloneRange(),
  }
  return true
}

export function restoreEditorSelection(editor = null, options = {}) {
  const selection = getSelectionObject()
  const targetEditor = editor || getCurrentOrSavedSlideTextEditor()
  if (!selection || !targetEditor || !savedEditorSelection?.range) return false
  if (!savedEditorSelection.editor || !savedEditorSelection.editor.isConnected) return false
  if (savedEditorSelection.editor !== targetEditor) return false

  try {
    selection.removeAllRanges()
    selection.addRange(savedEditorSelection.range.cloneRange())
    if (options.focus !== false && targetEditor.focus) targetEditor.focus()
    return true
  } catch {
    return false
  }
}

export function clearSavedEditorSelection() {
  savedEditorSelection = null
}

export function markEditorToolbarInteraction() {
  lastToolbarInteractionAt = Date.now()
}

export function isRecentEditorToolbarInteraction(windowMs = 1000) {
  return Date.now() - lastToolbarInteractionAt < windowMs
}

function emitEditorInput(editor) {
  if (!editor) return
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

function clearStyleProperty(style, prop) {
  if (!style) return
  if (prop === 'fontFamily') style.fontFamily = ''
  else if (prop === 'fontSize') style.fontSize = ''
  else if (prop === 'color') style.color = ''
  else if (prop === 'backgroundColor') style.backgroundColor = ''
  else if (prop === 'fontWeight') style.fontWeight = ''
  else if (prop === 'fontStyle') style.fontStyle = ''
  else if (prop === 'textDecoration') style.textDecoration = ''
}

function unwrapEmptyFormattingNodes(editor) {
  if (!editor) return
  const nodes = [...editor.querySelectorAll('span, font')]
  nodes.reverse().forEach((node) => {
    const hasAttributes = [...node.attributes].some((attribute) => attribute.name !== 'style' || attribute.value.trim() !== '')
    const hasStyle = Boolean(node.getAttribute('style')?.trim())
    if (hasAttributes || hasStyle) return
    while (node.firstChild) node.parentNode?.insertBefore(node.firstChild, node)
    node.remove()
  })
}

function getEditorRange(editor) {
  if (!editor || !hasSelectionInEditor(editor)) return null
  const selection = getSelectionObject()
  if (!selection || selection.rangeCount === 0) return null
  return selection.getRangeAt(0)
}

export function applyEditorInlineStyle(styleProps, editor = getCurrentOrSavedSlideTextEditor()) {
  const range = getEditorRange(editor)
  if (!range || range.collapsed) return false

  const selection = getSelectionObject()
  const span = document.createElement('span')
  Object.entries(styleProps || {}).forEach(([key, value]) => {
    span.style[key] = value
  })

  const fragment = range.extractContents()
  span.appendChild(fragment)
  range.insertNode(span)

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  selection.removeAllRanges()
  selection.addRange(nextRange)

  emitEditorInput(editor)
  saveEditorSelection(editor)
  return true
}

export function applyEditorBoxStyle(styleProps, editor = getCurrentOrSavedSlideTextEditor(), options = {}) {
  if (!editor) return false

  const stripProps = options.stripProps || []
  Object.entries(styleProps || {}).forEach(([key, value]) => {
    editor.style[key] = value
  })

  if (stripProps.length) {
    editor.querySelectorAll('*').forEach((node) => {
      stripProps.forEach((prop) => clearStyleProperty(node.style, prop))
      if (!node.getAttribute('style')?.trim()) {
        node.removeAttribute('style')
      }
    })
    unwrapEmptyFormattingNodes(editor)
  }

  emitEditorInput(editor)
  saveEditorSelection(editor)
  return true
}

export function runEditorCommand(command, value = null, editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor || !hasSelectionInEditor(editor)) return false
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  document.execCommand('styleWithCSS', false, true)
  const success = value === null
    ? document.execCommand(command, false)
    : document.execCommand(command, false, value)
  emitEditorInput(editor)
  saveEditorSelection(editor)
  return success
}

export function applyEditorFontSize(size, editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor || !hasSelectionInEditor(editor)) return false
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return applyEditorInlineStyle({ fontSize: `${size}px` }, editor)
  }
  document.execCommand('styleWithCSS', false, true)
  const success = document.execCommand('fontSize', false, '7')
  if (!success) {
    return applyEditorInlineStyle({ fontSize: `${size}px` }, editor)
  }

  editor.querySelectorAll('font[size="7"]').forEach((node) => {
    node.removeAttribute('size')
    node.style.fontSize = `${size}px`
  })
  emitEditorInput(editor)
  saveEditorSelection(editor)
  return true
}

export function clearEditorFormatting(editor = getCurrentOrSavedSlideTextEditor()) {
  const range = getEditorRange(editor)
  if (!editor || !range || range.collapsed) return false
  const selection = getSelectionObject()
  const text = selection?.toString() || range.cloneContents().textContent || ''
  const textNode = document.createTextNode(text)
  range.deleteContents()
  range.insertNode(textNode)

  const nextRange = document.createRange()
  nextRange.selectNodeContents(textNode)
  selection?.removeAllRanges()
  selection?.addRange(nextRange)

  emitEditorInput(editor)
  saveEditorSelection(editor)
  return true
}

export function getEditorCommandState(command, editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor || !hasSelectionInEditor(editor)) return false
  if (typeof document === 'undefined' || typeof document.queryCommandState !== 'function') return false
  try {
    return Boolean(document.queryCommandState(command))
  } catch {
    return false
  }
}

export function getEditorCommandValue(command, editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor || !hasSelectionInEditor(editor)) return ''
  if (typeof document === 'undefined' || typeof document.queryCommandValue !== 'function') return ''
  try {
    return document.queryCommandValue(command) || ''
  } catch {
    return ''
  }
}
