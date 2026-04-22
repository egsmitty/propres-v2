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

function getRangeContainerElement(range, editor) {
  if (!range) return editor || null
  const node = range.commonAncestorContainer
  if (!nodeBelongsToEditor(node, editor)) return editor || null
  return node.nodeType === Node.TEXT_NODE ? node.parentElement : node
}

function getLiveEditorRange(editor) {
  if (!editor) return null
  const selection = getSelectionObject()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  return nodeBelongsToEditor(range.commonAncestorContainer, editor) ? range : null
}

function getSavedEditorRange(editor) {
  if (!editor || !savedEditorSelection?.range || !savedEditorSelection?.editor?.isConnected) return null
  if (savedEditorSelection.editor !== editor) return null
  return savedEditorSelection.range.cloneRange()
}

function readQueryCommandState(command) {
  if (typeof document === 'undefined' || typeof document.queryCommandState !== 'function') return false
  try {
    return Boolean(document.queryCommandState(command))
  } catch {
    return false
  }
}

function buildSelectionSnapshot(editor, range) {
  if (!editor || !range || typeof window === 'undefined' || !window.getComputedStyle) return null
  const element = getRangeContainerElement(range, editor)
  if (!element) return null

  const computed = window.getComputedStyle(element)
  const textDecoration = `${computed.textDecorationLine || ''} ${computed.textDecoration || ''}`.toLowerCase()
  const fontWeight = String(computed.fontWeight || '').toLowerCase()
  const numericWeight = Number.parseInt(fontWeight, 10)
  const textAlign = String(computed.textAlign || '').toLowerCase()

  return {
    selectedText: range.toString() || '',
    collapsed: range.collapsed,
    fontSize: Number.parseFloat(computed.fontSize || '0') || 0,
    fontFamily: computed.fontFamily || '',
    color: computed.color || '',
    backgroundColor: computed.backgroundColor || '',
    textAlign,
    bold: Number.isFinite(numericWeight) ? numericWeight >= 600 : fontWeight === 'bold',
    italic: computed.fontStyle === 'italic',
    underline: textDecoration.includes('underline'),
    strike: textDecoration.includes('line-through'),
    alignLeft: textAlign.includes('left'),
    alignCenter: textAlign.includes('center'),
    alignRight: textAlign.includes('right'),
    justify: textAlign.includes('justify'),
    commandBold: readQueryCommandState('bold'),
    commandItalic: readQueryCommandState('italic'),
    commandUnderline: readQueryCommandState('underline'),
    commandStrike: readQueryCommandState('strikeThrough'),
    commandAlignLeft: readQueryCommandState('justifyLeft'),
    commandAlignCenter: readQueryCommandState('justifyCenter'),
    commandAlignRight: readQueryCommandState('justifyRight'),
    commandJustify: readQueryCommandState('justifyFull'),
  }
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
  return Boolean(getLiveEditorRange(editor))
}

export function getSelectedTextInEditor(editor = getCurrentOrSavedSlideTextEditor()) {
  const range = getLiveEditorRange(editor) || getSavedEditorRange(editor)
  return range?.toString() || ''
}

export function saveEditorSelection(editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor) return false
  const range = getLiveEditorRange(editor) || getSavedEditorRange(editor)
  if (!range) return false
  savedEditorSelection = {
    editor,
    range: range.cloneRange(),
    snapshot: buildSelectionSnapshot(editor, range),
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

export function getEditorSelectionSnapshot(editor = getCurrentOrSavedSlideTextEditor()) {
  if (!editor) return null

  const liveRange = getLiveEditorRange(editor)
  if (liveRange) return buildSelectionSnapshot(editor, liveRange)

  if (!savedEditorSelection?.editor?.isConnected || savedEditorSelection.editor !== editor) return null
  return savedEditorSelection.snapshot || buildSelectionSnapshot(editor, getSavedEditorRange(editor))
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
  else if (prop === 'textAlign') style.textAlign = ''
  else if (prop === 'lineHeight') style.lineHeight = ''
}

function stripStylePropsFromTree(root, stripProps = []) {
  if (!root || !stripProps.length) return
  root.querySelectorAll?.('*').forEach((node) => {
    stripProps.forEach((prop) => clearStyleProperty(node.style, prop))
    if (!node.getAttribute('style')?.trim()) {
      node.removeAttribute('style')
    }
  })
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
  return getLiveEditorRange(editor) || getSavedEditorRange(editor)
}

export function applyEditorInlineStyle(styleProps, editor = getCurrentOrSavedSlideTextEditor(), options = {}) {
  const range = getEditorRange(editor)
  if (!range || range.collapsed) return false

  const selection = getSelectionObject()
  const fragment = range.extractContents()
  const nextRange = document.createRange()
  stripStylePropsFromTree(fragment, options.stripProps || [])

  const entries = Object.entries(styleProps || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (options.skipWrapperWhenEmpty && !entries.length) {
    range.insertNode(fragment)
    nextRange.setStart(range.startContainer, range.startOffset)
    nextRange.setEnd(range.endContainer, range.endOffset)
  } else {
    const span = document.createElement('span')
    entries.forEach(([key, value]) => {
      span.style[key] = value
    })
    span.appendChild(fragment)
    range.insertNode(span)
    nextRange.selectNodeContents(span)
  }

  selection.removeAllRanges()
  selection.addRange(nextRange)

  emitEditorInput(editor)
  saveEditorSelection(editor)
  return true
}

export function applyEditorWholeTextStyle(styleProps, editor = getCurrentOrSavedSlideTextEditor(), options = {}) {
  if (!editor) return false

  const stripProps = options.stripProps || []
  stripProps.forEach((prop) => clearStyleProperty(editor.style, prop))
  stripStylePropsFromTree(editor, stripProps)
  unwrapEmptyFormattingNodes(editor)

  const entries = Object.entries(styleProps || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (options.skipWrapperWhenEmpty && !entries.length) {
    emitEditorInput(editor)
    saveEditorSelection(editor)
    return true
  }

  const wrapper = document.createElement('span')
  entries.forEach(([key, value]) => {
    wrapper.style[key] = value
  })
  while (editor.firstChild) {
    wrapper.appendChild(editor.firstChild)
  }
  editor.appendChild(wrapper)

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
  if (editor && hasSelectionInEditor(editor)) {
    return readQueryCommandState(command)
  }

  const snapshot = getEditorSelectionSnapshot(editor)
  if (!snapshot) return false

  if (command === 'bold') return snapshot.commandBold || snapshot.bold
  if (command === 'italic') return snapshot.commandItalic || snapshot.italic
  if (command === 'underline') return snapshot.commandUnderline || snapshot.underline
  if (command === 'strikeThrough') return snapshot.commandStrike || snapshot.strike
  if (command === 'justifyLeft') return snapshot.commandAlignLeft || snapshot.alignLeft
  if (command === 'justifyCenter') return snapshot.commandAlignCenter || snapshot.alignCenter
  if (command === 'justifyRight') return snapshot.commandAlignRight || snapshot.alignRight
  if (command === 'justifyFull') return snapshot.commandJustify || snapshot.justify
  return false
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
