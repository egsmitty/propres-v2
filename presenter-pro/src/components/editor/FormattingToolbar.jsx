import React from 'react'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'

const FONT_OPTIONS = [
  'Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Trebuchet MS, sans-serif',
  'Courier New, monospace',
]

export default function FormattingToolbar({ sectionId, slideId, textStyle, textBox }) {
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)
  const updateSlideTextBox = useEditorStore((s) => s.updateSlideTextBox)

  function set(props) {
    updateSlideStyle(sectionId, slideId, props)
  }

  function setBox(props) {
    updateSlideTextBox(sectionId, slideId, props)
  }

  function handleSizeChange(value) {
    const nextSize = Number(value)
    if (!Number.isFinite(nextSize)) return
    set({ size: Math.min(200, Math.max(12, nextSize)) })
  }

  const size = textStyle?.size || 52
  const bold = textStyle?.bold || false
  const italic = textStyle?.italic || false
  const underline = textStyle?.underline || false
  const align = textStyle?.align || 'center'
  const color = textStyle?.color || '#ffffff'
  const fontFamily = textStyle?.fontFamily || 'Arial, sans-serif'
  const lineHeight = textStyle?.lineHeight || 1.3
  const fillColor = textBox?.backgroundColor || 'transparent'
  const keepEditorFocus = (e) => e.preventDefault()

  return (
    <div
      data-editor-toolbar="true"
      className="flex items-center gap-2 px-3 shrink-0 h-9"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <select
        data-editor-toolbar="true"
        value={fontFamily}
        onChange={(e) => set({ fontFamily: e.target.value })}
        className="text-xs rounded outline-none"
        style={{
          background: 'var(--bg-app)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          padding: '2px 6px',
          maxWidth: 150,
        }}
      >
        {FONT_OPTIONS.map((option) => (
          <option key={option} value={option}>{option.split(',')[0]}</option>
        ))}
      </select>

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {/* Font size */}
      <div className="flex items-center gap-1">
        <button
          data-editor-toolbar="true"
          onMouseDown={keepEditorFocus}
          onClick={() => set({ size: Math.max(12, size - 4) })}
          className="w-5 h-5 flex items-center justify-center rounded text-xs"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >−</button>
        <input
          data-editor-toolbar="true"
          type="number"
          value={size}
          min={12}
          max={200}
          onChange={(e) => handleSizeChange(e.target.value)}
          className="w-10 text-center text-xs rounded outline-none"
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '1px 2px',
          }}
        />
        <button
          data-editor-toolbar="true"
          onMouseDown={keepEditorFocus}
          onClick={() => set({ size: Math.min(200, size + 4) })}
          className="w-5 h-5 flex items-center justify-center rounded text-xs"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >+</button>
      </div>

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {/* Bold */}
      <button
        data-editor-toolbar="true"
        onMouseDown={keepEditorFocus}
        onClick={() => set({ bold: !bold })}
        title="Bold"
        className="w-6 h-6 flex items-center justify-center rounded"
        style={{
          background: bold ? 'var(--accent-dim)' : 'transparent',
          color: bold ? 'var(--accent)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = bold ? 'var(--accent-dim)' : 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = bold ? 'var(--accent-dim)' : 'transparent')}
      >
        <Bold size={13} />
      </button>

      {/* Italic */}
      <button
        data-editor-toolbar="true"
        onMouseDown={keepEditorFocus}
        onClick={() => set({ italic: !italic })}
        title="Italic"
        className="w-6 h-6 flex items-center justify-center rounded"
        style={{
          background: italic ? 'var(--accent-dim)' : 'transparent',
          color: italic ? 'var(--accent)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = italic ? 'var(--accent-dim)' : 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = italic ? 'var(--accent-dim)' : 'transparent')}
      >
        <Italic size={13} />
      </button>

      {/* Underline */}
      <button
        data-editor-toolbar="true"
        onMouseDown={keepEditorFocus}
        onClick={() => set({ underline: !underline })}
        title="Underline"
        className="w-6 h-6 flex items-center justify-center rounded"
        style={{
          background: underline ? 'var(--accent-dim)' : 'transparent',
          color: underline ? 'var(--accent)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = underline ? 'var(--accent-dim)' : 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = underline ? 'var(--accent-dim)' : 'transparent')}
      >
        <Underline size={13} />
      </button>

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {/* Alignment */}
      {[
        { val: 'left', Icon: AlignLeft },
        { val: 'center', Icon: AlignCenter },
        { val: 'right', Icon: AlignRight },
      ].map(({ val, Icon }) => (
        <button
          key={val}
          data-editor-toolbar="true"
          onMouseDown={keepEditorFocus}
          onClick={() => set({ align: val })}
          title={`Align ${val}`}
          className="w-6 h-6 flex items-center justify-center rounded"
          style={{
            background: align === val ? 'var(--accent-dim)' : 'transparent',
            color: align === val ? 'var(--accent)' : 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = align === val ? 'var(--accent-dim)' : 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = align === val ? 'var(--accent-dim)' : 'transparent')}
        >
          <Icon size={13} />
        </button>
      ))}

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {/* Text color */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Color</span>
        <input
          data-editor-toolbar="true"
          type="color"
          value={color}
          onChange={(e) => set({ color: e.target.value })}
          className="rounded cursor-pointer"
          style={{ width: 24, height: 20, border: '1px solid var(--border-default)', padding: 1, background: 'none' }}
          title="Text color"
        />
      </div>

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      {/* Fill */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fill</span>
        <input
          data-editor-toolbar="true"
          type="color"
          value={fillColor === 'transparent' ? '#ffffff' : fillColor}
          onChange={(e) => setBox({ backgroundColor: e.target.value })}
          className="rounded cursor-pointer"
          style={{ width: 24, height: 20, border: '1px solid var(--border-default)', padding: 1, background: 'none' }}
          title="Text box fill color"
        />
        <button
          data-editor-toolbar="true"
          onMouseDown={keepEditorFocus}
          onClick={() => setBox({ backgroundColor: 'transparent' })}
          className="text-[11px] px-1.5 py-0.5 rounded"
          style={{ color: 'var(--text-secondary)' }}
        >
          Clear
        </button>
      </div>

      <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Line</span>
        <input
          data-editor-toolbar="true"
          type="number"
          step="0.1"
          min="0.8"
          max="3"
          value={lineHeight}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (!Number.isFinite(next)) return
            set({ lineHeight: Math.min(3, Math.max(0.8, next)) })
          }}
          className="w-12 text-center text-xs rounded outline-none"
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '1px 2px',
          }}
        />
      </div>

    </div>
  )
}
