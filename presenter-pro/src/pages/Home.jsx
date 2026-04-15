import React, { useEffect, useState } from 'react'
import { FileText, Plus, FolderOpen, Clock, BookOpen } from 'lucide-react'
import { getPresentations } from '@/utils/ipc'
import ContextMenu from '@/components/shared/ContextMenu'
import { useAppStore } from '@/store/appStore'
import {
  createNewPresentation,
  deletePresentationById,
  openPresentationInEditor,
  renamePresentationById,
} from '@/utils/presentationCommands'

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function firstSlideOf(presentation) {
  return presentation?.sections?.find((section) => section.slides?.length)?.slides?.[0] || null
}

export default function Home() {
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen)
  const setTutorialStepIndex = useAppStore((s) => s.setTutorialStepIndex)
  const [presentations, setPresentations] = useState([])
  const [navItem, setNavItem] = useState('recent')
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    loadPresentations()
  }, [])

  async function loadPresentations() {
    const result = await getPresentations()
    if (result?.success) setPresentations(result.data)
  }

  async function handleNew() {
    await createNewPresentation()
  }

  async function handleOpen(pres) {
    await openPresentationInEditor(pres.id)
  }

  async function handleRename(pres) {
    const result = await renamePresentationById(pres.id, pres.title)
    if (result?.success) await loadPresentations()
  }

  async function handleDelete(pres) {
    const result = await deletePresentationById(pres.id, pres.title)
    if (result?.success) await loadPresentations()
  }

  function handleShowTutorial() {
    setTutorialStepIndex(0)
    setTutorialOpen(true)
  }

  const NAV = [
    { id: 'new', label: 'New', icon: Plus },
    { id: 'open', label: 'Open', icon: FolderOpen },
    { id: 'recent', label: 'Recent', icon: Clock },
  ]

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Left sidebar */}
      <div
        className="w-48 flex flex-col py-4 px-2 shrink-0"
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 mb-6">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--accent)' }}
          >
            P
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            PresenterPro
          </span>
        </div>

        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => (id === 'new' ? handleNew() : setNavItem(id))}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-0.5 text-left"
            style={{
              background: navItem === id ? 'var(--accent-dim)' : 'transparent',
              color: navItem === id ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: navItem === id ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (navItem !== id) e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = navItem === id ? 'var(--accent-dim)' : 'transparent'
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        {/* New presentation button */}
        <div className="flex items-center gap-2 mb-6 self-start">
          <button
            data-tour="home-entry"
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <Plus size={15} />
            New Presentation
          </button>

          <button
            onClick={handleShowTutorial}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
            style={{
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
          >
            <BookOpen size={15} />
            Show Tutorial
          </button>
        </div>

        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Recent Presentations
        </h2>

        {presentations.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--bg-hover)' }}
            >
              <FileText size={32} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No recent presentations
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Create your first presentation to get started
            </p>
            <button
              onClick={handleNew}
              className="mt-2 px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              New Presentation
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {presentations.map((pres) => (
              <button
                key={pres.id}
                onClick={() => handleOpen(pres)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    pres,
                  })
                }}
                className="text-left rounded-lg overflow-hidden"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <PresentationPreview presentation={pres} />
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {pres.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDate(pres.updated_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: 'Open', onClick: () => handleOpen(menu.pres) },
            { label: 'Rename', onClick: () => handleRename(menu.pres) },
            { divider: true },
            { label: 'Delete', danger: true, onClick: () => handleDelete(menu.pres) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function PresentationPreview({ presentation }) {
  const slide = firstSlideOf(presentation)

  if (!slide?.body) {
    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ background: '#1a1a1a', aspectRatio: '16/9' }}
      >
        <FileText size={24} style={{ color: '#555' }} />
      </div>
    )
  }

  const lines = slide.body.split('\n').filter(Boolean).slice(0, 4)

  return (
    <div
      className="w-full flex items-center justify-center px-3"
      style={{ background: '#1a1a1a', aspectRatio: '16/9' }}
    >
      <div
        className="w-full text-center"
        style={{
          color: slide.textStyle?.color || '#ffffff',
          fontSize: Math.max(10, Math.min(18, Math.round((slide.textStyle?.size || 52) / 5))),
          fontWeight: slide.textStyle?.bold ? 700 : 400,
          textAlign: slide.textStyle?.align || 'center',
          lineHeight: 1.25,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  )
}
