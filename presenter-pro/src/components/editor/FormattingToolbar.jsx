import React, { useEffect, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, BringToFront, ChevronRight, Copy,
  Italic, Layers, List, ListOrdered,
  MoreHorizontal, RotateCw, Strikethrough,
  Trash2, Underline,
} from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE } from '@/utils/textBoxes'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Trebuchet MS, sans-serif',
  'Avenir Next, sans-serif',
  'Gill Sans, sans-serif',
  'Courier New, monospace',
  'Verdana, sans-serif',
]

const LINE_SPACING_PRESETS = [1, 1.15, 1.3, 1.5, 2]

const PRESET_COLORS = [
  '#ffffff', '#eeeeee', '#cccccc', '#888888', '#555555', '#222222', '#000000',
  '#ff6b6b', '#ff922b', '#ffd43b', '#69db7c', '#4dabf7', '#748ffc', '#da77f2',
  '#f06595', '#a9e34b', '#38d9a9', '#74c0fc', '#91a7ff', '#ffa8a8', '#ffc9c9',
  'transparent',
]

const CASE_OPTIONS = [
  { value: 'sentence', label: 'Sentence case' },
  { value: 'lower', label: 'lowercase' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'title', label: 'Title Case' },
  { value: 'toggle', label: 'tOGGLE' },
]

const TOOLBAR_H = 38
const TOOLBAR_GAP = 8
const TOOLBAR_MAX_W = 680

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cycleCase(value, mode) {
  const text = String(value || '')
  if (!text) return text
  if (mode === 'lower') return text.toLowerCase()
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'title') return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  if (mode === 'toggle') return text.split('').map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function getToolbarPos(canvasRef, box, scale) {
  if (!canvasRef?.current || !box) return null
  const rect = canvasRef.current.getBoundingClientRect()
  const bLeft  = rect.left + box.x * scale
  const bTop   = rect.top  + box.y * scale
  const bBottom = rect.top + (box.y + box.height) * scale

  let top = bTop - TOOLBAR_H - TOOLBAR_GAP
  if (top < rect.top + TOOLBAR_GAP) top = bBottom + TOOLBAR_GAP
  // If it still clips the bottom, prefer above
  if (top + TOOLBAR_H > window.innerHeight - TOOLBAR_GAP) top = bTop - TOOLBAR_H - TOOLBAR_GAP

  let left = Math.round(bLeft)
  if (left + TOOLBAR_MAX_W > window.innerWidth - 8) left = window.innerWidth - TOOLBAR_MAX_W - 8
  if (left < 8) left = 8

  return { top: Math.round(top), left }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Sep() {
  return <div style={{ width: 1, height: 18, background: 'var(--border-default)', flexShrink: 0, margin: '0 2px' }} />
}

function Btn({ active = false, title, onClick, children, danger = false }) {
  return (
    <button
      data-editor-toolbar="true"
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: danger ? '#ef4444' : active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent' }}
    >
      {children}
    </button>
  )
}

function NumberField({ value, onCommit, min, max, step = 1, width = 50 }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ''))
  }, [value, focused])

  function commit() {
    const n = Number(draft)
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
    else setDraft(String(value ?? ''))
    setFocused(false)
  }

  return (
    <input
      data-editor-toolbar="true"
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (Number.isFinite(n) && n >= min && n <= max) onCommit(n)
      }}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit() } }}
      style={{
        width, height: 26,
        textAlign: 'center',
        background: 'var(--bg-app)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        color: 'var(--text-primary)',
        fontSize: 11,
        outline: 'none',
        flexShrink: 0,
      }}
    />
  )
}

// ─── Color button + popover ───────────────────────────────────────────────────

function ColorPopover({ value, onChange, onClose, popoverRef }) {
  return (
    <div
      data-editor-toolbar="true"
      ref={popoverRef}
      onMouseDown={(e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault() }}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 8,
        boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
        zIndex: 200,
        width: 166,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 20px)', gap: 3, marginBottom: 6 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            data-editor-toolbar="true"
            title={c === 'transparent' ? 'Transparent' : c}
            onClick={() => { onChange(c); onClose?.() }}
            style={{
              width: 20, height: 20, borderRadius: 4, padding: 0, cursor: 'pointer',
              background: c === 'transparent'
                ? 'repeating-linear-gradient(45deg, #bbb 0, #bbb 2px, #fff 0, #fff 4px)'
                : c,
              border: value === c ? '2px solid var(--accent)' : '1px solid rgba(128,128,128,0.25)',
            }}
          />
        ))}
      </div>
      <input
        data-editor-toolbar="true"
        type="color"
        value={value === 'transparent' ? '#ffffff' : (value || '#ffffff')}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
        style={{ width: '100%', height: 24, borderRadius: 4, cursor: 'pointer', border: 'none' }}
      />
    </div>
  )
}

function ColorBtn({ title, value, onChange, children }) {
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

  const displayColor = (value && value !== 'transparent') ? value : null

  return (
    <div data-editor-toolbar="true" style={{ position: 'relative', flexShrink: 0 }}>
      <button
        data-editor-toolbar="true"
        ref={triggerRef}
        title={title}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 28, height: 28,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2,
          borderRadius: 5, border: 'none', cursor: 'pointer', background: 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: 11, lineHeight: 1, color: 'var(--text-primary)', fontWeight: 600 }}>
          {children}
        </span>
        <div
          style={{
            width: 14, height: 3, borderRadius: 2, flexShrink: 0,
            background: displayColor || 'transparent',
            backgroundImage: !displayColor
              ? 'repeating-linear-gradient(45deg, #aaa 0, #aaa 1px, transparent 0, transparent 3px)'
              : 'none',
          }}
        />
      </button>
      {open && <ColorPopover value={value} onChange={onChange} onClose={() => setOpen(false)} popoverRef={popoverRef} />}
    </div>
  )
}

// ─── Line spacing button + popover ────────────────────────────────────────────

function LineSpacingBtn({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(String(value))
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => { if (!open) setCustom(String(value)) }, [open, value])

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (!popoverRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div data-editor-toolbar="true" style={{ position: 'relative', flexShrink: 0 }}>
      <button
        data-editor-toolbar="true"
        ref={triggerRef}
        title="Line Spacing"
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 28, padding: '0 6px',
          display: 'flex', alignItems: 'center', gap: 2,
          borderRadius: 5, border: 'none', cursor: 'pointer', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        ↕ {value}×
      </button>
      {open && (
        <div
          data-editor-toolbar="true"
          ref={popoverRef}
          onMouseDown={(e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault() }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)', left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 8, padding: 6,
            boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
            zIndex: 200, width: 110,
          }}
        >
          {LINE_SPACING_PRESETS.map((v) => (
            <button
              key={v}
              data-editor-toolbar="true"
              onClick={() => { onChange(v); setOpen(false) }}
              style={{
                width: '100%', height: 28, textAlign: 'left', padding: '0 10px',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: value === v ? 'var(--accent-dim)' : 'transparent',
                color: value === v ? 'var(--accent)' : 'var(--text-primary)', fontSize: 12,
              }}
            >
              {v}×
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, paddingTop: 4 }}>
            <input
              data-editor-toolbar="true"
              type="number"
              min={0.8} max={4} step={0.05}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => {
                const v = parseFloat(custom)
                if (Number.isFinite(v) && v >= 0.8 && v <= 4) { onChange(v); setOpen(false) }
                else setCustom(String(value))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = parseFloat(custom)
                  if (Number.isFinite(v) && v >= 0.8 && v <= 4) { onChange(v); setOpen(false) }
                }
              }}
              placeholder="Custom"
              style={{
                width: '100%', height: 26, borderRadius: 4, padding: '0 6px',
                background: 'var(--bg-app)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', fontSize: 11, outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── More panel ───────────────────────────────────────────────────────────────

function MRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '1px 0', minHeight: 26 }}>
      {label && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function MDivider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px -10px' }} />
}

function MBtn({ title, active = false, danger = false, onClick, children }) {
  return (
    <button
      data-editor-toolbar="true"
      title={title}
      onClick={onClick}
      style={{
        height: 24, padding: '0 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: danger ? '#ef4444' : active ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 11,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent' }}
    >
      {children}
    </button>
  )
}

function MSelect({ value, onChange, children }) {
  return (
    <select
      data-editor-toolbar="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 11, borderRadius: 4, padding: '2px 4px', outline: 'none',
        background: 'var(--bg-app)', border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </select>
  )
}

function MorePanel({ sectionId, slideId, ids, primaryTextBox, onClose }) {
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)
  const updateSlideTextBox = useEditorStore((s) => s.updateSlideTextBox)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const duplicateSlideTextBoxes = useEditorStore((s) => s.duplicateSlideTextBoxes)
  const removeSlideTextBoxes = useEditorStore((s) => s.removeSlideTextBoxes)
  const reorderSlideTextBoxes = useEditorStore((s) => s.reorderSlideTextBoxes)

  const style = primaryTextBox?.textStyle || DEFAULT_TEXT_STYLE
  const box = primaryTextBox || DEFAULT_TEXT_BOX

  const ss = (props) => updateSlideStyle(sectionId, slideId, props, ids)
  const sb = (props) => updateSlideTextBox(sectionId, slideId, props, ids)

  function clearFormatting() {
    ss({ ...DEFAULT_TEXT_STYLE })
    sb({
      backgroundColor: 'transparent', fillType: 'solid',
      outlineWidth: 0, outlineColor: '#ffffff', outlineStyle: 'solid',
      shadowEnabled: false, wrapText: true, textDirection: 'horizontal',
      opacity: 1,
      cornerRadius: DEFAULT_TEXT_BOX.cornerRadius,
      paddingTop: DEFAULT_TEXT_BOX.paddingTop, paddingRight: DEFAULT_TEXT_BOX.paddingRight,
      paddingBottom: DEFAULT_TEXT_BOX.paddingBottom, paddingLeft: DEFAULT_TEXT_BOX.paddingLeft,
    })
    onClose()
  }

  function doCase(mode) {
    if (!primaryTextBox) return
    updateSlideBody(sectionId, slideId, cycleCase(primaryTextBox.body || '', mode), primaryTextBox.id)
  }

  return (
    <div
      data-editor-toolbar="true"
      onMouseDown={(e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault() }}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)', right: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
        zIndex: 200,
        width: 250,
        display: 'flex', flexDirection: 'column', gap: 0,
      }}
    >
      {/* Vertical align + justify */}
      <MRow label="Vertical">
        {['top', 'middle', 'bottom'].map((v) => (
          <MBtn key={v} title={`Align ${v}`} active={style.valign === v} onClick={() => ss({ valign: v })}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </MBtn>
        ))}
        <MBtn title="Justify" active={style.align === 'justify'} onClick={() => ss({ align: 'justify' })}>Justify</MBtn>
      </MRow>

      {/* Paragraph spacing */}
      <MRow label="Para spacing">
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Before</span>
        <NumberField value={style.paragraphBefore || 0} onCommit={(v) => ss({ paragraphBefore: v })} min={0} max={96} width={38} />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>After</span>
        <NumberField value={style.paragraphAfter || 0} onCommit={(v) => ss({ paragraphAfter: v })} min={0} max={96} width={38} />
      </MRow>

      {/* Indent + bullets */}
      <MRow label="Indent / List">
        <MBtn title="Decrease Indent" onClick={() => ss({ indent: Math.max(0, (style.indent || 0) - 1) })}>
          <ChevronRight size={12} style={{ transform: 'scaleX(-1)' }} />
        </MBtn>
        <MBtn title="Increase Indent" onClick={() => ss({ indent: Math.min(8, (style.indent || 0) + 1) })}>
          <ChevronRight size={12} />
        </MBtn>
        <MBtn title="Bullets" active={style.bullets} onClick={() => ss({ bullets: !style.bullets, numbering: style.bullets ? style.numbering : false })}>
          <List size={12} />
        </MBtn>
        <MBtn title="Numbering" active={style.numbering} onClick={() => ss({ numbering: !style.numbering, bullets: style.numbering ? style.bullets : false })}>
          <ListOrdered size={12} />
        </MBtn>
      </MRow>

      <MDivider />

      {/* Opacity */}
      <MRow label="Opacity %">
        <NumberField value={Math.round((box.opacity ?? 1) * 100)} onCommit={(v) => sb({ opacity: v / 100 })} min={0} max={100} width={44} />
      </MRow>

      {/* AutoFit */}
      <MRow label="AutoFit">
        <MSelect value={box.autoFit || 'none'} onChange={(v) => sb({ autoFit: v })}>
          <option value="none">None</option>
          <option value="shrink">Shrink Text</option>
          <option value="grow">Grow Shape</option>
        </MSelect>
      </MRow>

      {/* Wrap + direction */}
      <MRow label="Text">
        <label data-editor-toolbar="true" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input data-editor-toolbar="true" type="checkbox" checked={box.wrapText !== false} onChange={(e) => sb({ wrapText: e.target.checked })} />
          Wrap
        </label>
        <MSelect value={box.textDirection || 'horizontal'} onChange={(v) => sb({ textDirection: v })}>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </MSelect>
      </MRow>

      {/* Rotation + shadow */}
      <MRow label="Rotation">
        <NumberField value={Math.round(box.rotation || 0)} onCommit={(v) => sb({ rotation: v })} min={-360} max={360} width={50} />
        <MBtn title="Rotate +15°" onClick={() => sb({ rotation: (box.rotation || 0) + 15 })}>
          <RotateCw size={11} />
        </MBtn>
        <MBtn title="Shadow" active={box.shadowEnabled} onClick={() => sb({ shadowEnabled: !box.shadowEnabled })}>Shadow</MBtn>
      </MRow>

      <MDivider />

      {/* Z-order */}
      <MRow label="Order">
        <MBtn title="Bring to Front" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'front')}>
          <BringToFront size={11} />
        </MBtn>
        <MBtn title="Bring Forward" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'forward')}>
          <Layers size={11} />
        </MBtn>
        <MBtn title="Send Backward" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'backward')}>Back</MBtn>
        <MBtn title="Send to Back" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'back')}>To Back</MBtn>
      </MRow>

      {/* Duplicate */}
      <MRow>
        <MBtn title="Duplicate" onClick={() => { duplicateSlideTextBoxes(sectionId, slideId, ids); onClose() }}>
          <Copy size={11} /> Duplicate Box
        </MBtn>
      </MRow>

      {/* Case */}
      <MRow label="Case">
        <MSelect value="sentence" onChange={doCase}>
          {CASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </MSelect>
      </MRow>

      <MDivider />

      {/* Clear formatting + delete */}
      <MRow>
        <MBtn title="Clear Formatting" onClick={clearFormatting}>Clear Formatting</MBtn>
      </MRow>
      <MRow>
        <MBtn danger title="Delete Box" onClick={() => { removeSlideTextBoxes(sectionId, slideId, ids); onClose() }}>
          <Trash2 size={11} /> Delete Box
        </MBtn>
      </MRow>
    </div>
  )
}

// ─── Main floating toolbar ────────────────────────────────────────────────────

export default function FormattingToolbar({ sectionId, slideId, selectedTextBoxIds, primaryTextBox, canvasRef, scale }) {
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)
  const updateSlideTextBox = useEditorStore((s) => s.updateSlideTextBox)

  const [moreOpen, setMoreOpen] = useState(false)
  const moreTriggerRef = useRef(null)
  const moreRef = useRef(null)

  // Close More panel on outside click
  useEffect(() => {
    if (!moreOpen) return
    function onDown(e) {
      if (moreTriggerRef.current?.contains(e.target)) return
      if (!moreRef.current?.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  const ids = selectedTextBoxIds || []
  const style = primaryTextBox?.textStyle || DEFAULT_TEXT_STYLE
  const box = primaryTextBox || DEFAULT_TEXT_BOX

  if (!ids.length || !primaryTextBox) return null

  const pos = getToolbarPos(canvasRef, primaryTextBox, scale)
  if (!pos) return null

  function ss(props) { updateSlideStyle(sectionId, slideId, props, ids) }
  function sb(props) { updateSlideTextBox(sectionId, slideId, props, ids) }

  return (
    <div
      data-editor-toolbar="true"
      onMouseDown={(e) => {
        if (!e.target.closest('input, select, textarea')) e.preventDefault()
      }}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 1500,
        height: TOOLBAR_H,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '0 6px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 9,
        boxShadow: '0 4px 18px rgba(0,0,0,0.28)',
        pointerEvents: 'auto',
        userSelect: 'none',
        maxWidth: TOOLBAR_MAX_W,
      }}
    >
      {/* Font family */}
      <select
        data-editor-toolbar="true"
        value={style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily}
        onChange={(e) => ss({ fontFamily: e.target.value })}
        style={{
          height: 26, fontSize: 11, borderRadius: 4, padding: '0 4px', outline: 'none',
          background: 'var(--bg-app)', border: '1px solid var(--border-default)',
          color: 'var(--text-primary)', maxWidth: 130, flexShrink: 0,
        }}
      >
        {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
      </select>

      {/* Font size */}
      <NumberField value={style.size || 100} onCommit={(v) => ss({ size: v })} min={8} max={320} width={50} />

      <Sep />

      {/* B I U S */}
      <Btn title="Bold (⌘B)" active={style.bold} onClick={() => ss({ bold: !style.bold })}><Bold size={13} /></Btn>
      <Btn title="Italic (⌘I)" active={style.italic} onClick={() => ss({ italic: !style.italic })}><Italic size={13} /></Btn>
      <Btn title="Underline (⌘U)" active={style.underline} onClick={() => ss({ underline: !style.underline })}><Underline size={13} /></Btn>
      <Btn title="Strikethrough" active={style.strikethrough} onClick={() => ss({ strikethrough: !style.strikethrough })}><Strikethrough size={13} /></Btn>

      <Sep />

      {/* Text color + highlight */}
      <ColorBtn title="Text Color" value={style.color || '#ffffff'} onChange={(v) => ss({ color: v })}>A</ColorBtn>
      <ColorBtn
        title="Highlight"
        value={style.highlightColor === 'transparent' ? 'transparent' : (style.highlightColor || 'transparent')}
        onChange={(v) => ss({ highlightColor: v })}
      >H</ColorBtn>

      <Sep />

      {/* Alignment */}
      <Btn title="Align Left (⌘L)" active={style.align === 'left'} onClick={() => ss({ align: 'left' })}><AlignLeft size={13} /></Btn>
      <Btn title="Align Center (⌘E)" active={style.align === 'center'} onClick={() => ss({ align: 'center' })}><AlignCenter size={13} /></Btn>
      <Btn title="Align Right (⌘R)" active={style.align === 'right'} onClick={() => ss({ align: 'right' })}><AlignRight size={13} /></Btn>

      <Sep />

      {/* Line spacing */}
      <LineSpacingBtn value={style.lineHeight || 1.3} onChange={(v) => ss({ lineHeight: v })} />

      <Sep />

      {/* Fill + outline */}
      <ColorBtn
        title="Fill Color"
        value={box.backgroundColor || 'transparent'}
        onChange={(v) => sb({ backgroundColor: v })}
      >■</ColorBtn>
      <ColorBtn
        title="Outline Color"
        value={box.outlineColor || '#ffffff'}
        onChange={(v) => sb({ outlineColor: v, outlineWidth: Math.max(1, box.outlineWidth || 1) })}
      >□</ColorBtn>

      <Sep />

      {/* ⋮ More */}
      <div
        ref={moreTriggerRef}
        data-editor-toolbar="true"
        style={{ position: 'relative', flexShrink: 0 }}
      >
        <button
          data-editor-toolbar="true"
          title="More options"
          onClick={() => setMoreOpen((v) => !v)}
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 5, border: 'none', cursor: 'pointer',
            background: moreOpen ? 'var(--accent-dim)' : 'transparent',
            color: moreOpen ? 'var(--accent)' : 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = moreOpen ? 'var(--accent-dim)' : 'var(--bg-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = moreOpen ? 'var(--accent-dim)' : 'transparent' }}
        >
          <MoreHorizontal size={14} />
        </button>
        {moreOpen && (
          <div ref={moreRef} data-editor-toolbar="true">
            <MorePanel
              sectionId={sectionId}
              slideId={slideId}
              ids={ids}
              primaryTextBox={primaryTextBox}
              onClose={() => setMoreOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
