import React from 'react'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'

export default function FormattingToolbar({ sectionId, slideId, textStyle }) {
  const updateSlideStyle = useEditorStore((s) => s.updateSlideStyle)

  function set(props) {
    updateSlideStyle(sectionId, slideId, props)
  }

  function handleSizeChange(value) {
    const nextSize = Number(value)
    if (!Number.isFinite(nextSize)) return
    set({ size: Math.min(200, Math.max(12, nextSize)) })
  }

  const size = textStyle?.size || 52
  const bold = textStyle?.bold || false
  const align = textStyle?.align || 'center'
  const color = textStyle?.color || '#ffffff'
  const keepEditorFocus = (e) => e.preventDefault()

  function execCmd(cmd, value) {
    document.execCommand(cmd, false, value ?? null)
  }

  return (
    <div
      data-editor-toolbar="true"
      className="flex items-center gap-2 px-3 shrink-0 h-9"
      style={{
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
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
        onClick={() => execCmd('italic')}
        title="Italic"
        className="w-6 h-6 flex items-center justify-center rounded"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Italic size={13} />
      </button>

      {/* Underline */}
      <button
        data-editor-toolbar="true"
        onMouseDown={keepEditorFocus}
        onClick={() => execCmd('underline')}
        title="Underline"
        className="w-6 h-6 flex items-center justify-center rounded"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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

      {/* Highlight */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Highlight</span>
        <input
          data-editor-toolbar="true"
          type="color"
          defaultValue="#ffff00"
          onMouseDown={keepEditorFocus}
          onChange={(e) => execCmd('hiliteColor', e.target.value)}
          className="rounded cursor-pointer"
          style={{ width: 24, height: 20, border: '1px solid var(--border-default)', padding: 1, background: 'none' }}
          title="Highlight color"
        />
      </div>

      <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Press Esc to finish editing
      </span>
    </div>
  )
}
