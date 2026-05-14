import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  FileText,
  Highlighter,
  Image,
  Italic,
  LayoutPanelTop,
  Music,
  Palette,
  Play,
  Plus,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import { usePresenterStore } from '@/store/presenterStore'
import {
  getActiveSlideTextEditor,
  applyEditorBoxStyle,
  applyEditorWholeTextStyle,
  applyEditorInlineStyle,
  clearEditorFormatting,
  getCurrentOrSavedTextBoxId,
  clearSavedEditorSelection,
  getCurrentOrSavedSlideTextEditor,
  getSavedSlideTextEditor,
  getEditorSelectionSnapshot,
  hasSelectionInEditor,
  getSelectedTextInEditor,
  markEditorToolbarInteraction,
  isRecentEditorToolbarInteraction,
  getEditorCommandState,
  restoreEditorSelection,
  runEditorCommand,
  saveEditorSelection,
} from '@/utils/richTextEditor'
import { getSectionTypeLabel, isMediaSlide } from '@/utils/sectionTypes'
import {
  DEFAULT_TEXT_STYLE,
  FONT_SIZE_DISPLAY_PRESETS,
  displayToInternalFontSize,
  getSlideTextBoxes,
  internalToDisplayFontSize,
} from '@/utils/textBoxes'
import {
  clearPendingNumericFieldCommit,
  registerPendingNumericFieldCommit,
} from '@/utils/pendingNumericCommit'
import { formatShortcutLabel, getPlatform } from '@/utils/platformShortcuts'
import { uuid } from '@/utils/uuid'
import { slideBodyToHtml, slideBodyToPlainText } from '@/utils/slideMarkup'
import {
  deleteSelectedSlideFromCurrentPresentation,
  insertNewSectionIntoCurrentPresentation,
  insertNewSlideIntoCurrentPresentation,
} from '@/utils/presentationCommands'

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Trebuchet MS',
  'Avenir Next',
  'Gill Sans',
  'Courier New',
  'Verdana',
]

const LINE_SPACING_PRESETS = [1, 1.15, 1.3, 1.5, 2]
const PRESENT_CLUSTER_FALLBACK_WIDTH = 312
const RIBBON_COLLISION_BUFFER = 28
const MIN_FONT_SIZE_DISPLAY = internalToDisplayFontSize(8)
const MAX_FONT_SIZE_DISPLAY = internalToDisplayFontSize(320)

function getSelectedSlide(presentation, selectedSectionId, selectedSlideId) {
  const section = presentation?.sections?.find((item) => item.id === selectedSectionId)
  if (!section) return null
  return section.slides?.find((item) => item.id === selectedSlideId) || null
}

function normalizeFontFamilyValue(value, fallback = FONT_OPTIONS[0]) {
  const family = String(value || fallback).replace(/["']/g, '')
  return FONT_OPTIONS.find((option) => family.toLowerCase().includes(option.toLowerCase())) || FONT_OPTIONS[0]
}

function rgbToHex(value) {
  const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return value
  const [, r, g, b] = match
  return `#${[r, g, b].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function normalizeColorValue(value, fallback) {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return fallback
  return rgbToHex(value)
}

function normalizeAlignValue(value, fallback = 'center') {
  const next = String(value || '').toLowerCase()
  if (next.includes('justify')) return 'justify'
  if (next.includes('right')) return 'right'
  if (next.includes('left')) return 'left'
  if (next.includes('center')) return 'center'
  return fallback
}

function getRenderedBodyFontSize(body, fallback) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined' || !body) return fallback

  try {
    const doc = new DOMParser().parseFromString(`<div>${body}</div>`, 'text/html')
    const sizes = new Set()

    doc.body.querySelectorAll('*').forEach((node) => {
      const fontSize = node.style?.fontSize
      if (!fontSize || !fontSize.endsWith('px')) return
      const numeric = Number.parseFloat(fontSize)
      if (Number.isFinite(numeric) && numeric > 0) sizes.add(Math.round(numeric))
    })

    return sizes.size === 1 ? [...sizes][0] : fallback
  } catch {
    return fallback
  }
}

function Group({ title, children, grow = false, noDivider = false }) {
  return (
    <div
      className={`flex items-center gap-3 min-w-0 ${grow ? 'flex-1' : 'shrink-0'} ${noDivider ? '' : 'pr-4 mr-3'}`}
      style={{ borderRight: noDivider ? 'none' : '1px solid var(--border-subtle)' }}
    >
      {title ? (
        <span
          className="shrink-0 text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: 'rgba(18, 24, 38, 0.72)', paddingLeft: 2 }}
        >
          {title}
        </span>
      ) : null}
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  )
}

function CommandButton({
  icon: Icon,
  label,
  title,
  onClick,
  disabled,
  active = false,
  primary = false,
  danger = false,
  compact = false,
  collapseLabel = false,
}) {
  const showLabel = Boolean(label) && !collapseLabel

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      data-editor-toolbar="true"
      className="flex items-center gap-1.5 rounded-xl shrink-0 transition-colors"
      style={{
        height: compact ? 30 : 36,
        minWidth: showLabel ? 0 : compact ? 30 : 36,
        padding: showLabel ? (compact ? '0 9px' : '0 12px') : (compact ? '0 8px' : '0 10px'),
        border: primary ? '1px solid rgba(74,124,255,0.24)' : '1px solid transparent',
        background: disabled
          ? 'transparent'
          : active
            ? 'var(--accent-dim)'
            : primary
              ? 'rgba(74,124,255,0.08)'
              : 'transparent',
        color: disabled
          ? 'var(--text-tertiary)'
          : danger
            ? '#dc2626'
            : active
              ? 'var(--accent)'
              : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.58 : 1,
        fontSize: compact ? 12 : 13,
        fontWeight: showLabel ? 650 : 600,
      }}
      onMouseEnter={(event) => {
        if (disabled) return
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)'
      }}
      onMouseLeave={(event) => {
        if (disabled) {
          event.currentTarget.style.background = 'transparent'
          return
        }
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : primary ? 'rgba(74,124,255,0.08)' : 'transparent'
      }}
    >
      <Icon size={compact ? 14 : 15} />
      {showLabel && <span className="leading-none whitespace-nowrap">{label}</span>}
    </button>
  )
}

function PresentButton({ onPresent, isPresenting, disabled, collapseLabel = false }) {
  return (
    <button
      type="button"
      data-tour="present-button"
      data-editor-toolbar="true"
      onClick={onPresent}
      title="Present (F5)"
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl shrink-0"
      style={{
        height: 38,
        padding: collapseLabel ? '0 11px' : '0 14px',
        background: disabled ? 'var(--border-default)' : isPresenting ? 'var(--live)' : 'var(--accent)',
        color: '#ffffff',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        boxShadow: disabled ? 'none' : '0 4px 12px rgba(0,0,0,0.14)',
        fontSize: 13,
        fontWeight: 700,
      }}
      onMouseEnter={(event) => {
        if (disabled) return
        event.currentTarget.style.background = isPresenting ? '#15803d' : 'var(--accent-hover)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = disabled ? 'var(--border-default)' : isPresenting ? 'var(--live)' : 'var(--accent)'
      }}
    >
      <Play size={14} />
      {!collapseLabel && (isPresenting ? 'Stop' : 'Present')}
    </button>
  )
}

function InlineMeta({ label, value, hideValue = false }) {
  return (
    <div className="min-w-0 flex items-baseline gap-1 px-0.5">
      <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {!hideValue && (
        <span className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          {value}
        </span>
      )}
    </div>
  )
}

function InlineStyleButton({ icon: Icon, title, active, onClick }) {
  return (
    <button
      type="button"
      data-editor-toolbar="true"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded-lg shrink-0"
      style={{
        width: 30,
        height: 30,
        border: '1px solid transparent',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-primary)',
        cursor: 'pointer',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent'
      }}
    >
      <Icon size={14} />
    </button>
  )
}

function InlineTinyLabel({ children }) {
  return (
    <span className="shrink-0 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </span>
  )
}

function InlineTinyIconLabel({ icon: Icon, title }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      title={title}
      style={{ width: 14, height: 14, color: 'var(--text-secondary)' }}
    >
      <Icon size={12} />
    </span>
  )
}

function InlineStepperButton({ icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      data-editor-toolbar="true"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded-md shrink-0"
      style={{
        width: 22,
        height: 15,
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={11} />
    </button>
  )
}

function InlineChoiceButton({ label, active, onClick, width = 56 }) {
  return (
    <button
      type="button"
      data-editor-toolbar="true"
      onClick={onClick}
      className="flex items-center justify-center rounded-lg shrink-0"
      style={{
        minWidth: width,
        height: 30,
        padding: '0 10px',
        border: '1px solid transparent',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 650,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent'
      }}
    >
      {label}
    </button>
  )
}

function LiveNumberField({ value, min, max, onChange, width = 72, integrated = false }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const lastCommittedRef = useRef(null)

  useEffect(() => {
    if (focused) return
    const nextValue = String(value ?? '')
    if (lastCommittedRef.current && nextValue !== lastCommittedRef.current) return
    setDraft(nextValue)
    lastCommittedRef.current = null
  }, [value, focused])

  function commitDraft(nextDraft) {
    const trimmed = String(nextDraft ?? '').trim()
    if (!trimmed) {
      setDraft(String(value ?? ''))
      lastCommittedRef.current = null
      return false
    }
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) {
      setDraft(String(value ?? ''))
      lastCommittedRef.current = null
      return false
    }
    const clamped = Math.max(min, Math.min(max, Math.round(numeric)))
    const nextValue = String(clamped)
    setDraft(nextValue)
    lastCommittedRef.current = nextValue
    if (String(value ?? '') !== nextValue) {
      onChange(clamped)
    }
    return true
  }

  function commitCurrentValue() {
    const liveValue = inputRef.current?.value ?? draft
    return commitDraft(liveValue)
  }

  useEffect(() => {
    if (!focused) return undefined

    function flushPendingCommit() {
      commitCurrentValue()
      setFocused(false)
    }

    registerPendingNumericFieldCommit(flushPendingCommit)
    return () => {
      clearPendingNumericFieldCommit(flushPendingCommit)
    }
  }, [draft, focused, min, max, onChange, value])

  useEffect(() => {
    if (!focused) return undefined

    function commitOnOutsidePointerDown(event) {
      if (inputRef.current?.contains(event.target)) return
      commitCurrentValue()
      setFocused(false)
    }

    document.addEventListener('mousedown', commitOnOutsidePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', commitOnOutsidePointerDown, true)
    }
  }, [draft, focused])

  return (
    <input
      data-editor-toolbar="true"
      type="text"
      inputMode="numeric"
      ref={inputRef}
      value={draft}
      onMouseDown={(event) => {
        markEditorToolbarInteraction()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
      }}
      onFocus={(event) => {
        setFocused(true)
        event.currentTarget.select()
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d]/g, '')
        setDraft(next)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          commitCurrentValue()
          if (event.key === 'Enter') {
            event.currentTarget.select()
          }
        } else if (event.key === 'Escape') {
          lastCommittedRef.current = null
          setDraft(String(value ?? ''))
          event.currentTarget.blur()
        }
      }}
      onBlur={() => {
        if (!lastCommittedRef.current || lastCommittedRef.current !== String(draft ?? '')) {
          commitCurrentValue()
        }
        setFocused(false)
      }}
      style={{
        width,
        height: 32,
        padding: integrated ? '0 8px 0 10px' : '0 10px',
        borderRadius: integrated ? 0 : 10,
        border: integrated ? 'none' : '1px solid var(--border-default)',
        background: integrated ? 'transparent' : 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontSize: 12.5,
        fontWeight: 650,
        outline: 'none',
      }}
    />
  )
}

function InlineSelect({ value, onChange, children, width = 138 }) {
  return (
    <select
      data-editor-toolbar="true"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width,
        height: 30,
        padding: '0 8px',
        borderRadius: 8,
        border: '1px solid var(--border-default)',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontSize: 12.5,
        fontWeight: 500,
        outline: 'none',
      }}
    >
      {children}
    </select>
  )
}

function usePopoverOpen() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (!popoverRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return { open, setOpen, triggerRef, popoverRef }
}

function normalizeEditorHtml(html) {
  return String(html || '').replace(/&nbsp;/gi, ' ')
}

function defaultEditorBoxStyles(style = DEFAULT_TEXT_STYLE) {
  return {
    fontFamily: style.fontFamily || 'Arial, sans-serif',
    fontSize: `${style.size || DEFAULT_TEXT_STYLE.size}px`,
    color: style.color || '#ffffff',
    backgroundColor: style.highlightColor === 'transparent' ? 'transparent' : (style.highlightColor || 'transparent'),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: [
      style.underline ? 'underline' : null,
      style.strikethrough ? 'line-through' : null,
    ].filter(Boolean).join(' ') || 'none',
  }
}

function eventTargetsEditor(event, editor) {
  const target = event?.target
  if (!target || !editor) return false
  return target === editor || editor.contains(target)
}

function PopoverShell({ popoverRef, triggerRef, width = 180, children }) {
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    if (!triggerRef?.current || typeof window === 'undefined') return undefined

    function updatePosition() {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const popoverHeight = popoverRef.current?.offsetHeight || 220
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gap = 8

      let left = Math.min(triggerRect.left, viewportWidth - width - 12)
      left = Math.max(12, left)

      let top = triggerRect.bottom + gap
      if (top + popoverHeight > viewportHeight - 12) {
        top = Math.max(12, triggerRect.top - popoverHeight - gap)
      }

      setPosition({ left, top })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [triggerRef, popoverRef, width, children])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      data-editor-toolbar="true"
      ref={popoverRef}
      onMouseDown={(e) => {
        markEditorToolbarInteraction()
        if (!e.target.closest('input, select, textarea, [data-allow-focus="true"]')) {
          e.preventDefault()
        }
      }}
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        padding: 8,
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.28)',
        zIndex: 1000,
        width,
      }}
    >
      {children}
    </div>,
    document.body
  )
}

function PopoverMenuButton({
  title,
  label,
  width = 138,
  minButtonWidth = null,
  children,
  popoverWidth = null,
  icon: Icon = null,
  active = false,
  height = 30,
  collapseLabel = false,
  buttonVariant = 'field',
}) {
  const { open, setOpen, triggerRef, popoverRef } = usePopoverOpen()
  const showLabel = Boolean(label) && !collapseLabel
  const isCommandVariant = buttonVariant === 'command'

  return (
    <div data-editor-toolbar="true" className="shrink-0">
      <button
        type="button"
        data-editor-toolbar="true"
        ref={triggerRef}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center shrink-0 transition-colors ${isCommandVariant ? 'rounded-xl gap-1.5' : 'justify-between gap-2 rounded-lg'}`}
        style={{
          width: isCommandVariant ? undefined : showLabel ? width : undefined,
          height,
          minWidth: showLabel
            ? isCommandVariant
              ? (minButtonWidth ?? width)
              : 0
            : isCommandVariant
              ? 36
              : height,
          padding: showLabel
            ? isCommandVariant
              ? '0 12px'
              : '0 10px'
            : isCommandVariant
              ? '0 10px'
              : '0 8px',
          border: isCommandVariant ? '1px solid transparent' : '1px solid var(--border-default)',
          background: open || active ? 'var(--accent-dim)' : isCommandVariant ? 'transparent' : 'var(--bg-app)',
          color: open || active ? 'var(--accent)' : 'var(--text-primary)',
          fontSize: 12.5,
          fontWeight: showLabel ? (isCommandVariant ? 650 : 600) : 600,
          cursor: 'pointer',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = open || active ? 'var(--accent-dim)' : 'var(--bg-hover)'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = open || active
            ? 'var(--accent-dim)'
            : isCommandVariant
              ? 'transparent'
              : 'var(--bg-app)'
        }}
      >
        <span className="flex items-center min-w-0 gap-1.5">
          {Icon ? <Icon size={isCommandVariant ? 15 : 14} style={{ flexShrink: 0 }} /> : null}
          {showLabel ? (
            <span
              className={isCommandVariant ? 'whitespace-nowrap' : 'truncate whitespace-nowrap'}
              style={{ lineHeight: 1.15 }}
            >
              {label}
            </span>
          ) : null}
        </span>
        {!isCommandVariant ? (
          <ChevronDown size={14} style={{ flexShrink: 0, color: open || active ? 'var(--accent)' : 'var(--text-secondary)' }} />
        ) : null}
      </button>
      {open ? (
        <PopoverShell popoverRef={popoverRef} triggerRef={triggerRef} width={popoverWidth ?? (width + 54)}>
          {children({ close: () => setOpen(false) })}
        </PopoverShell>
      ) : null}
    </div>
  )
}

function MenuOption({ active = false, onClick, children }) {
  return (
    <button
      type="button"
      data-editor-toolbar="true"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 rounded-md"
      style={{
        height: 30,
        padding: '0 10px',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-primary)',
        fontSize: 12.5,
        fontWeight: active ? 650 : 500,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent' }}
    >
      <span className="truncate">{children}</span>
      {active ? <Check size={14} /> : null}
    </button>
  )
}

function FontFamilyButton({ value, onChange, width }) {
  return (
    <PopoverMenuButton title="Font family" label={value || FONT_OPTIONS[0]} width={width} popoverWidth={Math.max(172, width + 42)}>
      {({ close }) => (
        <div className="flex flex-col gap-1 max-h-64 overflow-auto">
          {FONT_OPTIONS.map((font) => (
            <MenuOption key={font} active={font === value} onClick={() => { onChange(font); close() }}>
              {font}
            </MenuOption>
          ))}
        </div>
      )}
    </PopoverMenuButton>
  )
}

function FontSizePresetButton({ value, onChange, width = 72, integrated = false }) {
  const { open, setOpen, triggerRef, popoverRef } = usePopoverOpen()

  return (
    <div data-editor-toolbar="true" className="shrink-0">
      <button
        type="button"
        data-editor-toolbar="true"
        ref={triggerRef}
        title="Font size presets"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center justify-center gap-1 rounded-md shrink-0"
        style={{
          width,
          height: 30,
          padding: integrated ? '0 6px' : '0 8px',
          border: integrated ? 'none' : '1px solid var(--border-default)',
          background: integrated ? 'transparent' : open ? 'var(--bg-hover)' : 'var(--bg-app)',
          color: 'var(--text-secondary)',
        }}
      >
        {!integrated ? <span className="truncate text-[12.5px] font-medium">{value} pt</span> : null}
        <ChevronDown size={13} />
      </button>
      {open ? (
        <PopoverShell popoverRef={popoverRef} triggerRef={triggerRef} width={integrated ? 84 : width + 28}>
          <div className="flex flex-col gap-1 max-h-64 overflow-auto">
            {FONT_SIZE_DISPLAY_PRESETS.map((preset) => (
              <MenuOption key={preset} active={Number(preset) === Number(value)} onClick={() => { onChange(preset); setOpen(false) }}>
                {preset}
              </MenuOption>
            ))}
          </div>
        </PopoverShell>
      ) : null}
    </div>
  )
}

function LineSpacingButton({ value, onChange }) {
  return (
    <PopoverMenuButton title="Line height" label={`LH ${value}x`} width={92}>
      {({ close }) => (
        <div className="flex flex-col gap-1">
          {LINE_SPACING_PRESETS.map((preset) => (
            <MenuOption key={preset} active={Number(preset) === Number(value)} onClick={() => { onChange(preset); close() }}>
              {preset}x
            </MenuOption>
          ))}
        </div>
      )}
    </PopoverMenuButton>
  )
}

function ColorDot({ title, value, onChange }) {
  return (
    <label
      data-editor-toolbar="true"
      title={title}
      className="relative shrink-0 rounded-full overflow-hidden"
      style={{
        width: 24,
        height: 24,
        border: '1px solid var(--border-default)',
        background: value === 'transparent' ? '#ffffff' : value,
        cursor: 'pointer',
      }}
    >
      <input
        data-editor-toolbar="true"
        type="color"
        value={value === 'transparent' ? '#ffffff' : value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          position: 'absolute',
          inset: -6,
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </label>
  )
}

function ColorPickerButton({ title, value, onChange }) {
  const { open, setOpen, triggerRef, popoverRef } = usePopoverOpen()
  const current = value === 'transparent' ? 'transparent' : (value || '#ffffff')
  const colors = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#fde047', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', 'transparent']
  return (
    <div data-editor-toolbar="true" className="shrink-0">
      <button
        type="button"
        data-editor-toolbar="true"
        ref={triggerRef}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full overflow-hidden"
        style={{
          width: 24,
          height: 24,
          border: '1px solid var(--border-default)',
          background: current === 'transparent' ? '#ffffff' : current,
        boxShadow: current === 'transparent' ? 'inset 0 0 0 1px rgba(0,0,0,0.12)' : 'none',
      }}
    />
      {open ? (
        <PopoverShell popoverRef={popoverRef} triggerRef={triggerRef} width={148}>
          <div className="grid grid-cols-5 gap-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                data-editor-toolbar="true"
                title={color === 'transparent' ? 'Transparent' : color}
                onClick={() => { onChange(color); setOpen(false) }}
                className="rounded-md"
                style={{
                  width: 24,
                  height: 24,
                  background: color === 'transparent'
                    ? 'repeating-linear-gradient(45deg, #bbb 0, #bbb 2px, #fff 0, #fff 4px)'
                    : color,
                  border: current === color ? '2px solid var(--accent)' : '1px solid rgba(128,128,128,0.25)',
                }}
              />
            ))}
          </div>
        </PopoverShell>
      ) : null}
    </div>
  )
}

function CombinedColorButton({
  textColor,
  highlightColor,
  fillColor,
  onTextChange,
  onHighlightChange,
  onFillChange,
}) {
  const { open, setOpen, triggerRef, popoverRef } = usePopoverOpen()

  return (
    <div data-editor-toolbar="true" className="shrink-0">
      <button
        type="button"
        data-editor-toolbar="true"
        ref={triggerRef}
        title="Color controls"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{
          width: 34,
          height: 30,
          border: '1px solid var(--border-default)',
          background: open ? 'var(--bg-hover)' : 'var(--bg-app)',
          color: 'var(--text-secondary)',
        }}
      >
        <Palette size={14} />
      </button>
      {open ? (
        <PopoverShell popoverRef={popoverRef} triggerRef={triggerRef} width={172}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Type size={13} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>Text</span>
              </div>
              <ColorPickerButton title="Text color" value={textColor} onChange={onTextChange} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Highlighter size={13} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>Highlight</span>
              </div>
              <ColorPickerButton title="Highlight color" value={highlightColor} onChange={onHighlightChange} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Square size={12} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>Fill</span>
              </div>
              <ColorPickerButton title="Textbox fill color" value={fillColor} onChange={onFillChange} />
            </div>
          </div>
        </PopoverShell>
      ) : null}
    </div>
  )
}

export default function Toolbar({ onPresent, onTogglePanel, presenterPanelOpen }) {
  const toolbarRef = useRef(null)
  const presentClusterRef = useRef(null)
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen)
  const setNewSongEditorOpen = useAppStore((s) => s.setNewSongEditorOpen)
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const songLibraryOpen = useAppStore((s) => s.songLibraryOpen)
  const newSongEditorOpen = useAppStore((s) => s.newSongEditorOpen)
  const mediaLibraryOpen = useAppStore((s) => s.mediaLibraryOpen)
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedTextBoxIds = useEditorStore((s) => s.selectedTextBoxIds)
  const editingSlideId = useEditorStore((s) => s.editingSlideId)
  const setEditingSlide = useEditorStore((s) => s.setEditingSlide)
  const addSlideTextBox = useEditorStore((s) => s.addSlideTextBox)
  const duplicateSlideTextBoxes = useEditorStore((s) => s.duplicateSlideTextBoxes)
  const removeSlideTextBoxes = useEditorStore((s) => s.removeSlideTextBoxes)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)
  const updateSlideTextBoxes = useEditorStore((s) => s.updateSlideTextBoxes)
  const isPresenting = usePresenterStore((s) => s.isPresenting)

  const [editorTick, setEditorTick] = useState(0)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const [presentClusterWidth, setPresentClusterWidth] = useState(0)

  const hasPresentation = !!presentation
  const hasSlide = !!selectedSlideId
  const panelOpen = songLibraryOpen || mediaLibraryOpen || newSongEditorOpen
  const section = useMemo(
    () => presentation?.sections?.find((item) => item.id === selectedSectionId) || null,
    [presentation, selectedSectionId]
  )
  const slide = useMemo(
    () => getSelectedSlide(presentation, selectedSectionId, selectedSlideId),
    [presentation, selectedSectionId, selectedSlideId]
  )
  const slideTextBoxes = useMemo(() => getSlideTextBoxes(slide), [slide])
  const primaryTextBox = slideTextBoxes?.[0] || null
  const isTextEditing = editingSlideId === selectedSlideId && Boolean(selectedSlideId)
  const canAddTextBox = hasSlide && !panelOpen && !isMediaSlide(slide)
  const activeTextBoxId = getCurrentOrSavedTextBoxId() || selectedTextBoxIds[selectedTextBoxIds.length - 1] || primaryTextBox?.id || null
  const activeTextBox = slideTextBoxes.find((box) => box.id === activeTextBoxId) || primaryTextBox
  const activeTextBoxIds = activeTextBoxId ? [activeTextBoxId] : null
  const style = activeTextBox?.textStyle || DEFAULT_TEXT_STYLE

  useLayoutEffect(() => {
    if (!toolbarRef.current) return undefined
    const node = toolbarRef.current
    const update = () => setToolbarWidth(node.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useLayoutEffect(() => {
    if (!presentClusterRef.current) return undefined
    const node = presentClusterRef.current
    const update = () => setPresentClusterWidth(node.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (!isTextEditing) {
      clearSavedEditorSelection()
      return undefined
    }
    const bump = (event) => {
      const editor = getCurrentOrSavedSlideTextEditor()
      if (!editor) return
      if (event?.type !== 'selectionchange' && !eventTargetsEditor(event, editor)) return
      if (event?.type === 'selectionchange') {
        const active = document.activeElement
        const editorFocused = active === editor || editor.contains(active)
        if (!editorFocused && !hasSelectionInEditor(editor)) return
      }
      if (hasSelectionInEditor(editor)) saveEditorSelection(editor)
      setEditorTick((value) => value + 1)
    }
    document.addEventListener('selectionchange', bump)
    document.addEventListener('input', bump, true)
    document.addEventListener('keyup', bump, true)
    document.addEventListener('mouseup', bump, true)
    return () => {
      document.removeEventListener('selectionchange', bump)
      document.removeEventListener('input', bump, true)
      document.removeEventListener('keyup', bump, true)
      document.removeEventListener('mouseup', bump, true)
    }
  }, [isTextEditing])

  const liveEditor = isTextEditing ? getActiveSlideTextEditor() : null
  const savedEditor = isTextEditing ? getSavedSlideTextEditor() : null
  const canUseSavedEditor = Boolean(savedEditor)
    && savedEditor?.dataset?.textBoxId === activeTextBoxId
    && isRecentEditorToolbarInteraction()
  const activeEditor = liveEditor || (canUseSavedEditor ? savedEditor : null)
  const editorSnapshot = activeEditor ? getEditorSelectionSnapshot(activeEditor) : null
  const editorFontFamily = activeEditor
    ? normalizeFontFamilyValue(editorSnapshot?.fontFamily, style.fontFamily || FONT_OPTIONS[0])
    : (style.fontFamily || FONT_OPTIONS[0])
  const bodyFontSizeInternal = getRenderedBodyFontSize(activeTextBox?.body, style.size || DEFAULT_TEXT_STYLE.size)
  const hasSelectedEditorText = Boolean(editorSnapshot?.selectedText?.trim?.().length)
  const editorFontSizeInternal = activeEditor
    ? (hasSelectedEditorText && Number.isFinite(editorSnapshot?.fontSize) && editorSnapshot.fontSize > 0
        ? Math.round(editorSnapshot.fontSize)
        : bodyFontSizeInternal)
    : bodyFontSizeInternal
  const editorFontSize = internalToDisplayFontSize(editorFontSizeInternal)
  const editorTextColor = activeEditor
    ? normalizeColorValue(editorSnapshot?.color, style.color || '#ffffff')
    : (style.color || '#ffffff')
  const editorHighlightColor = activeEditor
    ? normalizeColorValue(editorSnapshot?.backgroundColor, style.highlightColor || 'transparent')
    : (style.highlightColor || 'transparent')
  const boxFillColor = activeTextBox?.backgroundColor || 'transparent'
  const editorState = {
    bold: getEditorCommandState('bold', activeEditor),
    italic: getEditorCommandState('italic', activeEditor),
    underline: getEditorCommandState('underline', activeEditor),
    strike: getEditorCommandState('strikeThrough', activeEditor),
    alignLeft: getEditorCommandState('justifyLeft', activeEditor),
    alignCenter: getEditorCommandState('justifyCenter', activeEditor),
    alignRight: getEditorCommandState('justifyRight', activeEditor),
    justify: getEditorCommandState('justifyFull', activeEditor),
  }
  void editorTick

  const reservedPresentWidth = Math.max(
    presentClusterWidth,
    onTogglePanel ? PRESENT_CLUSTER_FALLBACK_WIDTH : PRESENT_CLUSTER_FALLBACK_WIDTH - 120
  )
  const effectiveWidth = Math.max(0, toolbarWidth - reservedPresentWidth - RIBBON_COLLISION_BUFFER)
  const compactLevel = isTextEditing
    ? effectiveWidth < 980 ? 4 : effectiveWidth < 1120 ? 3 : effectiveWidth < 1280 ? 2 : effectiveWidth < 1720 ? 1 : 0
    : effectiveWidth < 740 ? 3 : effectiveWidth < 880 ? 2 : effectiveWidth < 1020 ? 1 : 0

  const hideSecondaryLabels = compactLevel >= 2
  const hideMostLabels = compactLevel >= 3
  const hidePrimaryLabels = compactLevel >= 3
  const hideEditSecondaryLabels = isTextEditing && compactLevel >= 1
  const hideEditColorLabels = isTextEditing && compactLevel >= 4
  const collapseEditColorsToPalette = isTextEditing && effectiveWidth < 900
  const platform = getPlatform()
  const isWindowsPlatform = platform === 'win32'
  const newSlideShortcut = formatShortcutLabel(['mod', 'm'], platform)

  const activeAlign = isTextEditing
    ? normalizeAlignValue(editorSnapshot?.textAlign, style.align || 'center')
    : (style.align || 'center')
  const activeVerticalAlign = style.valign || 'middle'
  const verticalAlignLabel = activeVerticalAlign === 'top' ? 'Top' : activeVerticalAlign === 'bottom' ? 'Bottom' : 'Middle'
  function preserveEditorSelection() {
    if (!isTextEditing) return
    const editor = getCurrentOrSavedSlideTextEditor()
    if (editor) saveEditorSelection(editor)
  }

  function handleToolbarMouseDownCapture(event) {
    if (!isTextEditing) return
    const target = event.target
    if (!target.closest?.('[data-editor-toolbar="true"]')) return
    markEditorToolbarInteraction()
    preserveEditorSelection()
    if (target.closest?.('button')) {
      event.preventDefault()
    }
  }

  function restoreInlineSelection(options = {}) {
    const editor = getCurrentOrSavedSlideTextEditor()
    if (!editor) return null
    restoreEditorSelection(editor, options)
    return editor
  }

  function canInlineFormat(editor) {
    return Boolean(editor) && editor.dataset?.placeholderActive !== 'true'
  }

  function hasInlineTextSelection(editor) {
    if (!canInlineFormat(editor)) return false
    const snapshot = getEditorSelectionSnapshot(editor)
    const selectedText = snapshot?.selectedText ?? getSelectedTextInEditor(editor)
    return selectedText.trim().length > 0
  }

  function persistInlineEditor(editor) {
    if (!editor || editor.dataset?.placeholderActive === 'true') return
    const textBoxId = editor.dataset?.textBoxId || activeTextBoxId
    if (!textBoxId || !selectedSectionId || !selectedSlideId) return
    updateSlideBody(selectedSectionId, selectedSlideId, normalizeEditorHtml(editor.innerHTML), textBoxId)
  }

  function getWholeTextTargetIds() {
    return selectedTextBoxIds.length ? selectedTextBoxIds : activeTextBoxIds
  }

  function normalizeSelectedTextBoxesToPlainText(targetIds = getWholeTextTargetIds()) {
    if (!selectedSectionId || !selectedSlideId || !targetIds?.length) return
    updateSlideTextBoxes(selectedSectionId, selectedSlideId, (boxes) =>
      boxes.map((box) =>
        targetIds.includes(box.id)
          ? { ...box, body: slideBodyToHtml(slideBodyToPlainText(box.body || '')) }
          : box
      )
    )
  }

  function applyWholeTextOverride(styleProps, editorStyleProps = {}, stripProps = []) {
    const editor = restoreInlineSelection({ focus: false })
    if (editor && canInlineFormat(editor)) {
      editor.innerHTML = slideBodyToHtml(slideBodyToPlainText(editor.innerHTML))
      applyEditorBoxStyle(editorStyleProps, editor, { stripProps })
      persistInlineEditor(editor)
    } else {
      normalizeSelectedTextBoxesToPlainText()
    }
    applyTextBoxStyle(styleProps)
    setEditorTick((tick) => tick + 1)
  }

  function applyRangeOrTypingCommand(inlineCommand, value = null) {
    const editor = restoreInlineSelection()
    if (canInlineFormat(editor) && inlineCommand) {
      const success = runEditorCommand(inlineCommand, value, editor)
      if (success) {
        persistInlineEditor(editor)
        setEditorTick((tick) => tick + 1)
        return true
      }
    }
    return false
  }

  function applyTextStyle(styleProps, inlineCommand = null, value = null) {
    if (applyRangeOrTypingCommand(inlineCommand, value)) return
    const nextStyle = { ...DEFAULT_TEXT_STYLE, ...style, ...styleProps }
    const editorStyleProps = {}
    const stripProps = []

    if (Object.prototype.hasOwnProperty.call(styleProps, 'bold')) {
      editorStyleProps.fontWeight = nextStyle.bold ? 700 : 400
      stripProps.push('fontWeight')
    }
    if (Object.prototype.hasOwnProperty.call(styleProps, 'italic')) {
      editorStyleProps.fontStyle = nextStyle.italic ? 'italic' : 'normal'
      stripProps.push('fontStyle')
    }
    if (
      Object.prototype.hasOwnProperty.call(styleProps, 'underline') ||
      Object.prototype.hasOwnProperty.call(styleProps, 'strikethrough')
    ) {
      editorStyleProps.textDecoration = [
        nextStyle.underline ? 'underline' : null,
        nextStyle.strikethrough ? 'line-through' : null,
      ].filter(Boolean).join(' ') || 'none'
      stripProps.push('textDecoration')
    }
    if (Object.prototype.hasOwnProperty.call(styleProps, 'align')) {
      editorStyleProps.textAlign = nextStyle.align || 'center'
      stripProps.push('textAlign')
    }

    applyWholeTextOverride(styleProps, editorStyleProps, stripProps)
  }

  function applyTextBoxStyle(styleProps) {
    if (selectedSectionId && selectedSlideId) {
      updateSlideStyle(selectedSectionId, selectedSlideId, styleProps, activeTextBoxIds)
    }
  }

  function applyTextBoxFrameStyle(frameProps) {
    const targetIds = getWholeTextTargetIds()
    if (!selectedSectionId || !selectedSlideId || !targetIds?.length) return
    updateSlideTextBoxes(selectedSectionId, selectedSlideId, (boxes) =>
      boxes.map((box) =>
        targetIds.includes(box.id)
          ? { ...box, ...frameProps }
          : box
      )
    )
    setEditorTick((tick) => tick + 1)
  }

  function applyFontSizeValue(value) {
    const internalValue = displayToInternalFontSize(value, editorFontSizeInternal)
    const editor = restoreInlineSelection({ focus: false })
    if (hasInlineTextSelection(editor) && applyEditorInlineStyle({ fontSize: `${internalValue}px` }, editor)) {
      persistInlineEditor(editor)
      setEditorTick((tick) => tick + 1)
      return
    }
    applyWholeTextOverride({ size: internalValue }, { fontSize: `${internalValue}px` }, ['fontSize'])
  }

  function nudgeFontSize(direction) {
    const baseSize = editorFontSize || internalToDisplayFontSize(style.size || DEFAULT_TEXT_STYLE.size)
    const next = Math.max(MIN_FONT_SIZE_DISPLAY, Math.min(MAX_FONT_SIZE_DISPLAY, Math.round(baseSize + direction)))
    applyFontSizeValue(next)
  }

  function handleLineHeight(next) {
    const clamped = Math.max(0.1, Math.min(3, Math.round(next * 100) / 100))
    applyWholeTextOverride({ lineHeight: clamped }, { lineHeight: clamped }, ['lineHeight'])
  }

  function nudgeLineHeight(direction) {
    const base = Number(style.lineHeight || DEFAULT_TEXT_STYLE.lineHeight)
    const next = Math.max(0.1, Math.min(3, Math.round((base + direction) * 100) / 100))
    handleLineHeight(next)
  }

  function handleVerticalAlign(next) {
    if (selectedSectionId && selectedSlideId) updateSlideStyle(selectedSectionId, selectedSlideId, { valign: next }, activeTextBoxIds)
    setEditorTick((tick) => tick + 1)
  }

  function handleTextColorChange(value) {
    const editor = restoreInlineSelection({ focus: false })
    if (hasInlineTextSelection(editor) && applyEditorInlineStyle({ color: value }, editor)) {
      persistInlineEditor(editor)
      setEditorTick((tick) => tick + 1)
      return
    }
    applyWholeTextOverride({ color: value }, { color: value }, ['color'])
  }

  function handleHighlightColorChange(value) {
    const next = value === 'transparent' ? 'transparent' : value
    const editor = restoreInlineSelection({ focus: false })
    if (hasInlineTextSelection(editor) && applyEditorInlineStyle(
      next === 'transparent' ? {} : { backgroundColor: next },
      editor,
      { stripProps: ['backgroundColor'], skipWrapperWhenEmpty: next === 'transparent' }
    )) {
      persistInlineEditor(editor)
      setEditorTick((tick) => tick + 1)
      return
    }
    if (editor && canInlineFormat(editor)) {
      editor.innerHTML = slideBodyToHtml(slideBodyToPlainText(editor.innerHTML))
      applyEditorWholeTextStyle(
        next === 'transparent' ? {} : { backgroundColor: next },
        editor,
        { stripProps: ['backgroundColor'], skipWrapperWhenEmpty: next === 'transparent' }
      )
      persistInlineEditor(editor)
      applyTextBoxStyle({ highlightColor: next })
      setEditorTick((tick) => tick + 1)
      return
    }
    applyWholeTextOverride(
      { highlightColor: next },
      {},
      ['backgroundColor']
    )
  }

  function handleFillColorChange(value) {
    const next = value === 'transparent' ? 'transparent' : value
    applyTextBoxFrameStyle({
      fillType: 'solid',
      backgroundColor: next,
    })
  }

  function handleClearFormatting() {
    const editor = restoreInlineSelection()
    if (canInlineFormat(editor)) {
      if (hasInlineTextSelection(editor) && clearEditorFormatting(editor)) {
        persistInlineEditor(editor)
        setEditorTick((tick) => tick + 1)
        return
      }

      const plain = slideBodyToPlainText(editor.innerHTML)
      editor.innerHTML = plain.replace(/\n/g, '<br />')
      applyEditorBoxStyle(defaultEditorBoxStyles(DEFAULT_TEXT_STYLE), editor, {
        stripProps: ['fontFamily', 'fontSize', 'color', 'backgroundColor', 'fontWeight', 'fontStyle', 'textDecoration'],
      })
      persistInlineEditor(editor)
      applyTextBoxStyle(DEFAULT_TEXT_STYLE)
      setEditorTick((tick) => tick + 1)
      return
    }
    if (selectedSectionId && selectedSlideId) updateSlideStyle(selectedSectionId, selectedSlideId, DEFAULT_TEXT_STYLE, activeTextBoxIds)
  }

  function handleNewSlide() {
    insertNewSlideIntoCurrentPresentation()
  }

  function handleDuplicate() {
    if (!presentation || !selectedSlideId) return
    useEditorStore.getState().mutateSections((sections) =>
      sections.map((sec) => {
        const idx = sec.slides.findIndex((sl) => sl.id === selectedSlideId)
        if (idx === -1) return sec
        const copy = { ...sec.slides[idx], id: uuid() }
        const slides = [...sec.slides]
        slides.splice(idx + 1, 0, copy)
        return { ...sec, slides }
      })
    )
  }

  function handleDelete() {
    if (!presentation || !selectedSlideId) return
    deleteSelectedSlideFromCurrentPresentation()
  }

  function openNewSongEditor() {
    setMediaLibraryOpen(false)
    setSongLibraryOpen(false)
    setNewSongEditorOpen(true)
  }

  function openSongLibrary() {
    setNewSongEditorOpen(false)
    setMediaLibraryOpen(false)
    setSongLibraryOpen(true)
  }

  function openMediaLibrary() {
    setNewSongEditorOpen(false)
    setSongLibraryOpen(false)
    setMediaLibraryOpen(true)
  }

  return (
    <div
      ref={toolbarRef}
      data-tour="editor-toolbar"
      data-editor-toolbar={isTextEditing ? 'true' : undefined}
      onMouseDownCapture={handleToolbarMouseDownCapture}
      className={`shrink-0 py-2.5 ${isTextEditing ? 'px-4' : 'px-1.5'}`}
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'hidden',
        overflowY: 'visible',
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.48)',
      }}
    >
      <div
        className="flex gap-1 min-w-0 overflow-hidden"
        style={{
          minHeight: 44,
          alignItems: 'center',
        }}
      >
        {isTextEditing ? (
          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden items-center">
            <Group title="Text">
              <FontFamilyButton
                value={editorFontFamily}
                width={compactLevel >= 3 ? 110 : compactLevel >= 1 ? 138 : 170}
                onChange={(value) => {
                  const editor = restoreInlineSelection({ focus: false })
                  if (hasInlineTextSelection(editor) && applyEditorInlineStyle({ fontFamily: value }, editor)) {
                    persistInlineEditor(editor)
                    setEditorTick((tick) => tick + 1)
                    return
                  }
                  applyWholeTextOverride({ fontFamily: value }, { fontFamily: value }, ['fontFamily'])
                }}
              />
              <div
                className="flex items-center shrink-0"
                style={{
                  height: 32,
                  borderRadius: 10,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
                }}
              >
                <LiveNumberField
                  value={editorFontSize}
                  min={MIN_FONT_SIZE_DISPLAY}
                  max={MAX_FONT_SIZE_DISPLAY}
                  width={compactLevel >= 2 ? 58 : 68}
                  onChange={applyFontSizeValue}
                  integrated
                />
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
                <FontSizePresetButton value={editorFontSize} onChange={applyFontSizeValue} width={24} integrated />
                <div className="flex flex-col gap-0.5">
                  <InlineStepperButton icon={ChevronUp} title="Increase font size" onClick={() => nudgeFontSize(2)} />
                  <InlineStepperButton icon={ChevronDown} title="Decrease font size" onClick={() => nudgeFontSize(-2)} />
                </div>
              </div>
              <InlineStyleButton icon={Bold} title="Bold (Cmd/Ctrl+B)" active={editorState.bold || style.bold} onClick={() => applyTextStyle({ bold: !style.bold }, 'bold')} />
              <InlineStyleButton icon={Italic} title="Italic (Cmd/Ctrl+I)" active={editorState.italic || style.italic} onClick={() => applyTextStyle({ italic: !style.italic }, 'italic')} />
              <InlineStyleButton icon={Underline} title="Underline (Cmd/Ctrl+U)" active={editorState.underline || style.underline} onClick={() => applyTextStyle({ underline: !style.underline }, 'underline')} />
              {!hideEditSecondaryLabels && <InlineStyleButton icon={Strikethrough} title="Strikethrough" active={editorState.strike || style.strikethrough} onClick={() => applyTextStyle({ strikethrough: !style.strikethrough }, 'strikeThrough')} />}
              {!hidePrimaryLabels && <CommandButton icon={Eraser} label="Clear" title="Clear Formatting" onClick={handleClearFormatting} compact collapseLabel={hideEditSecondaryLabels} />}
            </Group>

            <Group title="Paragraph" grow noDivider>
              <InlineStyleButton icon={AlignLeft} title="Align Left" active={activeAlign === 'left'} onClick={() => applyTextStyle({ align: 'left' }, 'justifyLeft')} />
              <InlineStyleButton icon={AlignCenter} title="Align Center" active={activeAlign === 'center'} onClick={() => applyTextStyle({ align: 'center' }, 'justifyCenter')} />
              <InlineStyleButton icon={AlignRight} title="Align Right" active={activeAlign === 'right'} onClick={() => applyTextStyle({ align: 'right' }, 'justifyRight')} />
              {!hideEditSecondaryLabels && <InlineStyleButton icon={AlignJustify} title="Justify" active={activeAlign === 'justify'} onClick={() => applyTextStyle({ align: 'justify' }, 'justifyFull')} />}
              {!hideEditSecondaryLabels && <InlineTinyLabel>Line Height</InlineTinyLabel>}
              <div
                className="flex items-center shrink-0"
                style={{
                  height: 32,
                  borderRadius: 10,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
                }}
              >
                <LineSpacingButton value={style.lineHeight || DEFAULT_TEXT_STYLE.lineHeight} onChange={(value) => handleLineHeight(Number(value))} />
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
                <div className="flex flex-col gap-0.5">
                  <InlineStepperButton icon={ChevronUp} title="Increase line height" onClick={() => nudgeLineHeight(0.05)} />
                  <InlineStepperButton icon={ChevronDown} title="Decrease line height" onClick={() => nudgeLineHeight(-0.05)} />
                </div>
              </div>
              {!hideEditSecondaryLabels && <InlineTinyLabel>Vertical Align</InlineTinyLabel>}
              <PopoverMenuButton
                title="Vertical alignment"
                label={hideEditSecondaryLabels ? verticalAlignLabel : `Align ${verticalAlignLabel}`}
                width={compactLevel >= 2 ? 92 : 128}
                popoverWidth={160}
              >
                {({ close }) => (
                  <div className="flex flex-col gap-1">
                    <MenuOption active={activeVerticalAlign === 'top'} onClick={() => { handleVerticalAlign('top'); close() }}>Align Top</MenuOption>
                    <MenuOption active={activeVerticalAlign === 'middle'} onClick={() => { handleVerticalAlign('middle'); close() }}>Align Middle</MenuOption>
                    <MenuOption active={activeVerticalAlign === 'bottom'} onClick={() => { handleVerticalAlign('bottom'); close() }}>Align Bottom</MenuOption>
                  </div>
                )}
              </PopoverMenuButton>
              {collapseEditColorsToPalette ? (
                <CombinedColorButton
                  textColor={editorTextColor}
                  highlightColor={editorHighlightColor === 'transparent' ? 'transparent' : editorHighlightColor}
                  fillColor={boxFillColor === 'transparent' ? 'transparent' : boxFillColor}
                  onTextChange={handleTextColorChange}
                  onHighlightChange={handleHighlightColorChange}
                  onFillChange={handleFillColorChange}
                />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    {hideEditColorLabels ? <InlineTinyIconLabel icon={Type} title="Text color" /> : <InlineTinyLabel>Text</InlineTinyLabel>}
                    <ColorPickerButton title="Text color" value={editorTextColor} onChange={handleTextColorChange} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    {hideEditColorLabels ? <InlineTinyIconLabel icon={Highlighter} title="Highlight color" /> : <InlineTinyLabel>Highlight</InlineTinyLabel>}
                    <ColorPickerButton title="Highlight color" value={editorHighlightColor === 'transparent' ? 'transparent' : editorHighlightColor} onChange={handleHighlightColorChange} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    {hideEditColorLabels ? <InlineTinyIconLabel icon={Square} title="Textbox fill color" /> : <InlineTinyLabel>Fill</InlineTinyLabel>}
                    <ColorPickerButton
                      title="Textbox fill color"
                      value={boxFillColor === 'transparent' ? 'transparent' : boxFillColor}
                      onChange={handleFillColorChange}
                    />
                  </div>
                </>
              )}
            </Group>

          </div>
        ) : (
          <>
            <Group title="Slides">
              <CommandButton icon={Plus} label="New" title={`New Slide (${newSlideShortcut})`} onClick={handleNewSlide} disabled={!hasPresentation || panelOpen} primary collapseLabel={hidePrimaryLabels} />
              <CommandButton icon={Type} label="Text Box" title="Add Text Box" onClick={() => addSlideTextBox(selectedSectionId, selectedSlideId)} disabled={!canAddTextBox} collapseLabel={hidePrimaryLabels} />
              <CommandButton icon={Copy} title="Duplicate Slide" onClick={handleDuplicate} disabled={!hasSlide || panelOpen} compact />
              <CommandButton icon={Trash2} title="Delete Slide" onClick={handleDelete} disabled={!hasSlide || panelOpen} danger compact />
            </Group>

            <Group title="Insert">
              <PopoverMenuButton
                title="Song"
                label="Song"
                icon={Music}
                width={88}
                minButtonWidth={isWindowsPlatform ? 114 : 88}
                height={36}
                active={songLibraryOpen || newSongEditorOpen}
                collapseLabel={hideMostLabels}
                popoverWidth={208}
                buttonVariant="command"
              >
                {({ close }) => (
                  <div className="flex flex-col gap-1">
                    <MenuOption onClick={() => { openNewSongEditor(); close() }}>
                      <span>New Song</span>
                    </MenuOption>
                    <MenuOption active={songLibraryOpen} onClick={() => { openSongLibrary(); close() }}>
                      <span>Open Song Library</span>
                    </MenuOption>
                  </div>
                )}
              </PopoverMenuButton>
              <PopoverMenuButton
                title="Media"
                label="Media"
                icon={Image}
                width={94}
                minButtonWidth={isWindowsPlatform ? 122 : 94}
                height={36}
                active={mediaLibraryOpen}
                collapseLabel={hideMostLabels}
                popoverWidth={214}
                buttonVariant="command"
              >
                {({ close }) => (
                  <div className="flex flex-col gap-1">
                    <MenuOption onClick={() => { importMediaToSelectedSlide('image'); close() }}>
                      <span>Insert Image</span>
                    </MenuOption>
                    <MenuOption onClick={() => { importMediaToSelectedSlide('video'); close() }}>
                      <span>Insert Video</span>
                    </MenuOption>
                    <MenuOption active={mediaLibraryOpen} onClick={() => { openMediaLibrary(); close() }}>
                      <span>Open Media Library</span>
                    </MenuOption>
                  </div>
                )}
              </PopoverMenuButton>
              <CommandButton icon={FileText} label="Announcement" title="Add Announcement Section" onClick={() => insertNewSectionIntoCurrentPresentation('announcement')} disabled={!hasPresentation || panelOpen} collapseLabel={hideMostLabels} />
              <CommandButton icon={BookOpen} label="Sermon" title="Add Sermon Section" onClick={() => insertNewSectionIntoCurrentPresentation('sermon')} disabled={!hasPresentation || panelOpen} collapseLabel={hideMostLabels} />
            </Group>
          </>
        )}

        <div
          ref={presentClusterRef}
          className="ml-auto shrink-0 flex items-center gap-2 pl-3 self-center"
          style={{ borderLeft: '1px solid var(--border-subtle)' }}
        >
          <PresentButton onPresent={onPresent} isPresenting={isPresenting} disabled={panelOpen} collapseLabel={false} />
          {onTogglePanel && (
            <CommandButton
              icon={LayoutPanelTop}
              label="Presenter"
              title="Presenter"
              onClick={onTogglePanel}
              disabled={false}
              active={presenterPanelOpen}
              primary
              collapseLabel={false}
            />
          )}
        </div>
      </div>
    </div>
  )
}
