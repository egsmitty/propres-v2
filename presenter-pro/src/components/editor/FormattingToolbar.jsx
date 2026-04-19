import React, { useEffect, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  CaseSensitive,
  ChevronRight,
  Copy,
  Italic,
  Layers,
  List,
  ListOrdered,
  MoveVertical,
  Pilcrow,
  Plus,
  RotateCw,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE } from '@/utils/textBoxes'

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
const CASE_OPTIONS = [
  { value: 'sentence', label: 'Sentence' },
  { value: 'lower', label: 'lowercase' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'title', label: 'Title Case' },
  { value: 'toggle', label: 'tOGGLE cASE' },
]

function cycleCase(value, mode) {
  const text = String(value || '')
  if (!text) return text
  if (mode === 'lower') return text.toLowerCase()
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'title') return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  if (mode === 'toggle') return text.split('').map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join('')
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function ToolbarGroup({ label, children, wide = false }) {
  return (
    <div
      data-editor-toolbar="true"
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{
        background: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
        minHeight: 46,
        minWidth: wide ? 0 : undefined,
      }}
    >
      {label ? <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>{label}</span> : null}
      {children}
    </div>
  )
}

function ToolButton({ active = false, title, onClick, children, danger = false }) {
  return (
    <button
      data-editor-toolbar="true"
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
      style={{
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: danger ? '#ff8e8e' : active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

function NumberField({ value, onCommit, min, max, step = 1, width = 54 }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ''))
  }, [value, focused])

  function commit() {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onCommit(Math.min(max, Math.max(min, parsed)))
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
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          commit()
        }
      }}
      className="text-xs text-center rounded-lg outline-none"
      style={{
        width,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
        padding: '6px 6px',
      }}
    />
  )
}

function SelectField({ value, onChange, children, minWidth = 112 }) {
  return (
    <select
      data-editor-toolbar="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded-lg outline-none"
      style={{
        minWidth,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
      }}
    >
      {children}
    </select>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <label data-editor-toolbar="true" className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      <span
        style={{
          position: 'relative',
          width: 28,
          height: 28,
          borderRadius: 8,
          border: '1px solid var(--border-default)',
          background: value,
          overflow: 'hidden',
          boxShadow: value === 'transparent' ? 'inset 0 0 0 999px rgba(255,255,255,0.03)' : 'none',
        }}
      >
        <input
          data-editor-toolbar="true"
          type="color"
          value={value === 'transparent' ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
          title={label}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </span>
    </label>
  )
}

export default function FormattingToolbar({ sectionId, slideId, selectedTextBoxIds, primaryTextBox }) {
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)
  const updateSlideTextBox = useEditorStore((s) => s.updateSlideTextBox)
  const updateSlideBody = useEditorStore((s) => s.updateSlideBody)
  const addSlideTextBox = useEditorStore((s) => s.addSlideTextBox)
  const duplicateSlideTextBoxes = useEditorStore((s) => s.duplicateSlideTextBoxes)
  const removeSlideTextBoxes = useEditorStore((s) => s.removeSlideTextBoxes)
  const reorderSlideTextBoxes = useEditorStore((s) => s.reorderSlideTextBoxes)

  const ids = selectedTextBoxIds || []
  const style = primaryTextBox?.textStyle || DEFAULT_TEXT_STYLE
  const box = primaryTextBox || DEFAULT_TEXT_BOX

  function setStyle(props) {
    if (!ids.length) return
    updateSlideStyle(sectionId, slideId, props, ids)
  }

  function setBox(props) {
    if (!ids.length) return
    updateSlideTextBox(sectionId, slideId, props, ids)
  }

  function changeCase(mode) {
    if (!ids.length || !primaryTextBox) return
    updateSlideBody(sectionId, slideId, cycleCase(primaryTextBox.body || '', mode), primaryTextBox.id)
  }

  function clearFormatting() {
    setStyle({ ...DEFAULT_TEXT_STYLE })
    setBox({
      backgroundColor: 'transparent',
      fillType: 'solid',
      outlineWidth: 0,
      outlineColor: '#ffffff',
      outlineStyle: 'solid',
      shadowEnabled: false,
      wrapText: true,
      textDirection: 'horizontal',
      opacity: 1,
      cornerRadius: DEFAULT_TEXT_BOX.cornerRadius,
      paddingTop: DEFAULT_TEXT_BOX.paddingTop,
      paddingRight: DEFAULT_TEXT_BOX.paddingRight,
      paddingBottom: DEFAULT_TEXT_BOX.paddingBottom,
      paddingLeft: DEFAULT_TEXT_BOX.paddingLeft,
    })
  }

  return (
    <div
      data-editor-toolbar="true"
      className="shrink-0 px-3 py-3"
      style={{ background: 'var(--bg-toolbar)', borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarGroup wide>
          <button
            data-editor-toolbar="true"
            onClick={() => addSlideTextBox(sectionId, slideId)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={16} />
            <span>Add Text Box</span>
          </button>
          <SelectField value={style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily} onChange={(value) => setStyle({ fontFamily: value })} minWidth={170}>
            {FONT_OPTIONS.map((option) => <option key={option} value={option}>{option.split(',')[0]}</option>)}
          </SelectField>
          <NumberField value={style.size || 100} onCommit={(next) => setStyle({ size: next })} min={8} max={320} width={62} />
        </ToolbarGroup>

        <ToolbarGroup label="Text">
          <ToolButton title="Bold" active={style.bold} onClick={() => setStyle({ bold: !style.bold })}><Bold size={14} /></ToolButton>
          <ToolButton title="Italic" active={style.italic} onClick={() => setStyle({ italic: !style.italic })}><Italic size={14} /></ToolButton>
          <ToolButton title="Underline" active={style.underline} onClick={() => setStyle({ underline: !style.underline })}><Underline size={14} /></ToolButton>
          <ToolButton title="Strikethrough" active={style.strikethrough} onClick={() => setStyle({ strikethrough: !style.strikethrough })}><Strikethrough size={14} /></ToolButton>
          <ColorField label="Text" value={style.color || '#ffffff'} onChange={(value) => setStyle({ color: value })} />
          <ColorField label="Highlight" value={style.highlightColor === 'transparent' ? '#ffffff' : (style.highlightColor || '#ffffff')} onChange={(value) => setStyle({ highlightColor: value })} />
        </ToolbarGroup>

        <ToolbarGroup label="Align">
          <ToolButton title="Align Left" active={style.align === 'left'} onClick={() => setStyle({ align: 'left' })}><AlignLeft size={14} /></ToolButton>
          <ToolButton title="Align Center" active={style.align === 'center'} onClick={() => setStyle({ align: 'center' })}><AlignCenter size={14} /></ToolButton>
          <ToolButton title="Align Right" active={style.align === 'right'} onClick={() => setStyle({ align: 'right' })}><AlignRight size={14} /></ToolButton>
          <button
            data-editor-toolbar="true"
            onClick={() => setStyle({ align: 'justify' })}
            className="rounded-lg px-2.5 py-2 text-xs font-medium"
            style={{
              background: style.align === 'justify' ? 'var(--accent-dim)' : 'transparent',
              color: style.align === 'justify' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            Justify
          </button>
          <SelectField value={style.valign || 'middle'} onChange={(value) => setStyle({ valign: value })} minWidth={104}>
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </SelectField>
        </ToolbarGroup>

        <ToolbarGroup label="Shape">
          <ColorField label="Fill" value={box.backgroundColor === 'transparent' ? '#ffffff' : (box.backgroundColor || '#ffffff')} onChange={(value) => setBox({ backgroundColor: value })} />
          <ColorField label="Outline" value={box.outlineColor || '#ffffff'} onChange={(value) => setBox({ outlineColor: value, outlineWidth: Math.max(1, box.outlineWidth || 1) })} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Width</span>
          <NumberField value={box.outlineWidth || 0} onCommit={(next) => setBox({ outlineWidth: next })} min={0} max={24} width={50} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Opacity</span>
          <NumberField value={Math.round((box.opacity ?? 1) * 100)} onCommit={(next) => setBox({ opacity: next / 100 })} min={0} max={100} width={54} />
          <ToolButton title="Shadow" active={box.shadowEnabled} onClick={() => setBox({ shadowEnabled: !box.shadowEnabled })}><MoveVertical size={14} /></ToolButton>
        </ToolbarGroup>

        <ToolbarGroup label="Paragraph">
          <SelectField value={style.lineHeight || 1.3} onChange={(value) => setStyle({ lineHeight: Number(value) })} minWidth={90}>
            {LINE_SPACING_PRESETS.map((value) => <option key={value} value={value}>{value}x</option>)}
          </SelectField>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Before</span>
          <NumberField value={style.paragraphBefore || 0} onCommit={(next) => setStyle({ paragraphBefore: next })} min={0} max={96} width={48} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>After</span>
          <NumberField value={style.paragraphAfter || 0} onCommit={(next) => setStyle({ paragraphAfter: next })} min={0} max={96} width={48} />
          <ToolButton title="Bullets" active={style.bullets} onClick={() => setStyle({ bullets: !style.bullets, numbering: style.bullets ? style.numbering : false })}><List size={14} /></ToolButton>
          <ToolButton title="Numbering" active={style.numbering} onClick={() => setStyle({ numbering: !style.numbering, bullets: style.numbering ? style.bullets : false })}><ListOrdered size={14} /></ToolButton>
          <ToolButton title="Decrease Indent" onClick={() => setStyle({ indent: Math.max(0, (style.indent || 0) - 1) })}><ChevronRight size={14} style={{ transform: 'scaleX(-1)' }} /></ToolButton>
          <ToolButton title="Increase Indent" onClick={() => setStyle({ indent: Math.min(8, (style.indent || 0) + 1) })}><ChevronRight size={14} /></ToolButton>
        </ToolbarGroup>

        <ToolbarGroup label="Box">
          <SelectField value={box.autoFit || 'none'} onChange={(value) => setBox({ autoFit: value })} minWidth={118}>
            <option value="none">No Autofit</option>
            <option value="shrink">Shrink Text</option>
            <option value="grow">Grow Shape</option>
          </SelectField>
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <input data-editor-toolbar="true" type="checkbox" checked={box.wrapText !== false} onChange={(e) => setBox({ wrapText: e.target.checked })} /> Wrap
          </label>
          <SelectField value={box.textDirection || 'horizontal'} onChange={(value) => setBox({ textDirection: value })} minWidth={104}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </SelectField>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Rotate</span>
          <NumberField value={Math.round(box.rotation || 0)} onCommit={(next) => setBox({ rotation: next })} min={-360} max={360} width={56} />
        </ToolbarGroup>

        <ToolbarGroup label="Arrange">
          <ToolButton title="Bring Forward" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'forward')}><Layers size={14} /></ToolButton>
          <ToolButton title="Bring to Front" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'front')}><BringToFront size={14} /></ToolButton>
          <button data-editor-toolbar="true" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'backward')} className="rounded-lg px-2 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Back</button>
          <button data-editor-toolbar="true" onClick={() => reorderSlideTextBoxes(sectionId, slideId, ids, 'back')} className="rounded-lg px-2 py-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>To Back</button>
          <ToolButton title="Duplicate" onClick={() => duplicateSlideTextBoxes(sectionId, slideId, ids)}><Copy size={14} /></ToolButton>
          <SelectField value="sentence" onChange={(value) => changeCase(value)} minWidth={122}>
            {CASE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>
          <ToolButton title="Rotate 15°" onClick={() => setBox({ rotation: (box.rotation || 0) + 15 })}><RotateCw size={14} /></ToolButton>
          <ToolButton title="Clear Formatting" onClick={clearFormatting}><Pilcrow size={14} /></ToolButton>
          <ToolButton title="Title Case" onClick={() => changeCase('title')}><CaseSensitive size={14} /></ToolButton>
          <button data-editor-toolbar="true" onClick={() => removeSlideTextBoxes(sectionId, slideId, ids)} className="rounded-lg px-3 py-2 text-xs font-medium" style={{ color: '#ff8e8e' }}>Delete Box</button>
        </ToolbarGroup>
      </div>
    </div>
  )
}
