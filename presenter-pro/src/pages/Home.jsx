import React, { useEffect, useMemo, useState } from 'react'
import { Home as HomeIcon, PlusCircle, FolderOpen, Clock3, BookOpen, Search, FileText, Plus, MoreHorizontal, Pin } from 'lucide-react'
import { getPresentations, getProfile } from '@/utils/ipc'
import ContextMenu from '@/components/shared/ContextMenu'
import ScaledSlideText from '@/components/shared/ScaledSlideText'
import { useAppStore } from '@/store/appStore'
import { getPresentationAspectRatio } from '@/utils/presentationSizing'
import { slideBodyToPlainText } from '@/utils/slideMarkup'
import {
  createNewPresentation,
  createPresentationFromTemplate,
  deletePresentationById,
  openPresentationInEditor,
  renamePresentationById,
} from '@/utils/presentationCommands'
import { PRESENTATION_TEMPLATES } from '@/utils/presentationTemplates'

const NAV = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'new', label: 'New', icon: PlusCircle },
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'open', label: 'Open', icon: FolderOpen },
]

const PINNED_PRESENTATIONS_KEY = 'presenterpro.home.pinnedPresentations'

function loadPinnedPresentationIds() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(PINNED_PRESENTATIONS_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePinnedPresentationIds(ids) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PINNED_PRESENTATIONS_KEY, JSON.stringify(ids))
}

function sortPresentations(presentations, pinnedIds) {
  const pinnedSet = new Set(pinnedIds)
  return [...presentations].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id)
    const bPinned = pinnedSet.has(b.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    return (b.updated_at || 0) - (a.updated_at || 0)
  })
}

const TEMPLATE_VISUALS = {
  blank: {
    gradient: 'linear-gradient(160deg, #fcfcfd 0%, #eef1f7 100%)',
    card: '#ffffff',
    accent: '#2f73ff',
    eyebrow: 'Start Fresh',
    title: 'Blank Presentation',
    lines: ['Build your own flow', 'Add songs, media, and slides'],
  },
  'sunday-service': {
    gradient: 'linear-gradient(160deg, #102542 0%, #1f5f8b 55%, #8eb8e5 100%)',
    card: 'rgba(255,255,255,0.94)',
    accent: '#174d77',
    eyebrow: 'Weekend Service',
    title: 'Sunday Flow',
    lines: ['Welcome', 'Worship Set', 'Scripture', 'Sermon'],
  },
  'worship-set': {
    gradient: 'linear-gradient(160deg, #2b193d 0%, #5f2a82 52%, #d088ff 100%)',
    card: 'rgba(255,255,255,0.94)',
    accent: '#602f86',
    eyebrow: 'Music Set',
    title: 'Worship Deck',
    lines: ['Opening', 'Song 1', 'Song 2', 'Song 3'],
  },
  'sermon-scripture': {
    gradient: 'linear-gradient(160deg, #4a2208 0%, #8b4513 58%, #f0c27b 100%)',
    card: 'rgba(255,255,255,0.95)',
    accent: '#7b3d11',
    eyebrow: 'Message Focus',
    title: 'Sermon Notes',
    lines: ['Title', 'Passage', 'Point 1', 'Response'],
  },
  'announcement-loop': {
    gradient: 'linear-gradient(160deg, #0f2b21 0%, #1d5c47 55%, #91d9bf 100%)',
    card: 'rgba(255,255,255,0.95)',
    accent: '#205945',
    eyebrow: 'Lobby Rotation',
    title: 'Announcement Loop',
    lines: ['Upcoming Event', 'Volunteer Need', 'Giving'],
  },
  'student-night': {
    gradient: 'linear-gradient(160deg, #1f1b42 0%, #304f9c 52%, #ffb84d 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#314f9a',
    eyebrow: 'Youth Service',
    title: 'Student Night',
    lines: ['Welcome', 'Game Moment', 'Worship', 'Message'],
  },
  'prayer-night': {
    gradient: 'linear-gradient(160deg, #0c2430 0%, #1f5a68 52%, #d9c89e 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#295c6d',
    eyebrow: 'Quiet Gathering',
    title: 'Prayer Night',
    lines: ['Scripture', 'Guided Prayer', 'Response', 'Closing'],
  },
  'featured-sunday-example': {
    gradient: 'linear-gradient(160deg, #1b2336 0%, #314a78 52%, #f0b45f 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#24416f',
    eyebrow: 'Featured Example',
    title: 'Sunday Morning',
    lines: ['Announcements', 'Worship', 'Message', 'Media'],
  },
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function firstSlideOf(presentation) {
  return presentation?.sections?.find((section) => section.slides?.length)?.slides?.[0] || null
}

function matchesPresentationQuery(presentation, query) {
  if (!query.trim()) return true

  const lowerQuery = query.trim().toLowerCase()
  const title = presentation.title?.toLowerCase() || ''
  const dateString = formatDate(presentation.updated_at).toLowerCase()
  const isoDate = presentation.updated_at
    ? new Date(presentation.updated_at * 1000).toISOString().slice(0, 10)
    : ''

  return title.includes(lowerQuery) || dateString.includes(lowerQuery) || isoDate.includes(lowerQuery)
}

function HighlightText({ text, query }) {
  if (!query.trim()) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.trim().toLowerCase()
  const start = lowerText.indexOf(lowerQuery)

  if (start === -1) return text

  const end = start + lowerQuery.length

  return (
    <>
      {text.slice(0, start)}
      <mark
        style={{
          background: 'rgba(74,124,255,0.2)',
          color: 'var(--text-primary)',
          borderRadius: 4,
          padding: '0 2px',
        }}
      >
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}

export default function Home() {
  const homeTab = useAppStore((s) => s.homeTab)
  const setHomeTab = useAppStore((s) => s.setHomeTab)
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen)
  const setTutorialStepIndex = useAppStore((s) => s.setTutorialStepIndex)
  const [presentations, setPresentations] = useState([])
  const [menu, setMenu] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedPresentationId, setSelectedPresentationId] = useState(null)
  const [pinnedIds, setPinnedIds] = useState(() => loadPinnedPresentationIds())
  const [profile, setProfile] = useState({
    displayName: 'PresenterPro User',
    initials: 'PP',
    subtitle: 'On this device',
  })

  useEffect(() => {
    loadPresentations()
  }, [])

  useEffect(() => {
    let active = true

    getProfile().then((result) => {
      if (active && result?.success && result.data) {
        setProfile(result.data)
      }
    })

    return () => {
      active = false
    }
  }, [])

  async function loadPresentations() {
    const result = await getPresentations()
    if (result?.success) setPresentations(result.data)
  }

  async function handleNew() {
    await createNewPresentation()
  }

  async function handleTemplate(templateId) {
    await createPresentationFromTemplate(templateId)
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
    if (result?.success) {
      setPinnedIds((current) => {
        const next = current.filter((id) => id !== pres.id)
        savePinnedPresentationIds(next)
        return next
      })
      await loadPresentations()
    }
  }

  function handleTogglePinned(pres) {
    setPinnedIds((current) => {
      const next = current.includes(pres.id)
        ? current.filter((id) => id !== pres.id)
        : [pres.id, ...current.filter((id) => id !== pres.id)]
      savePinnedPresentationIds(next)
      return next
    })
  }

  function openPresentationMenu(eventLike, pres, source = 'context') {
    const pinned = pinnedIds.includes(pres.id)
    setSelectedPresentationId(pres.id)
    setMenu((current) => {
      if (source === 'actions' && current?.source === 'actions' && current?.pres?.id === pres.id) {
        return null
      }
      return { x: eventLike.clientX, y: eventLike.clientY, pres, pinned, source }
    })
  }

  function handleShowTutorial() {
    setHomeTab('home')
    setTutorialStepIndex(0)
    setTutorialOpen(true)
  }

  const sortedPresentations = useMemo(
    () => sortPresentations(presentations, pinnedIds),
    [presentations, pinnedIds]
  )
  const homeRecentPresentations = sortedPresentations.slice(0, 10)
  const recentPresentations = sortedPresentations.slice(0, 25)
  const filteredPresentations = sortedPresentations.filter((pres) =>
    matchesPresentationQuery(pres, query)
  )

  const visiblePresentations =
    homeTab === 'home'
      ? homeRecentPresentations
      : homeTab === 'recent'
        ? recentPresentations
        : homeTab === 'open'
          ? filteredPresentations
          : []

  useEffect(() => {
    if (!selectedPresentationId) return
    if (!visiblePresentations.some((pres) => pres.id === selectedPresentationId)) {
      setSelectedPresentationId(null)
      setMenu((current) => (current?.pres?.id === selectedPresentationId ? null : current))
    }
  }, [visiblePresentations, selectedPresentationId])

  const selectedPresentation =
    visiblePresentations.find((pres) => pres.id === selectedPresentationId) || null

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-app)' }}>
      <div
        data-tour="home-sidebar"
        className="w-[184px] flex flex-col py-5 px-3 shrink-0"
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        <div className="px-1 mb-7">
          <div
            className="rounded-[28px] p-4 text-center"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-4">
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
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold mb-3 mx-auto"
              style={{
                background: 'linear-gradient(135deg, #0b62d6 0%, #4fa3ff 100%)',
                color: '#fff',
              }}
            >
              {profile.initials}
            </div>
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {profile.displayName}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {profile.subtitle}
            </p>
          </div>
        </div>

        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setHomeTab(id)}
            data-tour={id === 'new' ? 'home-entry' : undefined}
            className="flex flex-col items-center justify-center gap-3 rounded-[28px] py-5 mb-2"
            style={{
              background:
                homeTab === id
                  ? 'linear-gradient(180deg, rgba(74,124,255,0.24) 0%, rgba(74,124,255,0.14) 100%)'
                  : 'transparent',
              color: homeTab === id ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${
                homeTab === id ? 'rgba(74,124,255,0.22)' : 'transparent'
              }`,
            }}
            onMouseEnter={(e) => {
              if (homeTab !== id) e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                homeTab === id
                  ? 'linear-gradient(180deg, rgba(74,124,255,0.24) 0%, rgba(74,124,255,0.14) 100%)'
                  : 'transparent'
            }}
          >
            <Icon size={30} strokeWidth={2.2} />
            <span className="text-base font-medium">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto px-8 pt-7 pb-24 min-h-0">
          <div className="flex items-start justify-between gap-6 mb-8">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] mb-3"
                style={{ color: 'var(--accent)' }}
              >
                PresenterPro
              </p>
              <h1
                className="text-[2rem] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {homeTab === 'home'
                  ? 'Home'
                  : homeTab === 'new'
                    ? 'New Presentation'
                    : homeTab === 'recent'
                      ? 'Recent Presentations'
                      : 'Open Presentation'}
              </h1>
              <p
                className="text-sm mt-2 max-w-2xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                {homeTab === 'home'
                  ? 'Start from a polished template, then jump back into the presentations you worked on most recently.'
                  : homeTab === 'new'
                    ? 'Choose a blank presentation or start with a worship-ready structure that already has sections in place.'
                    : homeTab === 'recent'
                      ? 'Your expanded recent history for quickly reopening work from the last few services, events, and edits.'
                      : 'Search your presentation library by title or by date when you need to find something specific fast.'}
              </p>
            </div>

            {homeTab === 'home' && (
              <button
                onClick={handleShowTutorial}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shrink-0"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
              >
                <BookOpen size={16} />
                Show Tutorial
              </button>
            )}
          </div>

          {homeTab === 'home' && (
            <HomeLibrary
              templates={PRESENTATION_TEMPLATES}
              onTemplate={handleTemplate}
              onViewAllTemplates={() => setHomeTab('new')}
              presentations={homeRecentPresentations}
              onOpen={handleOpen}
              onContextMenu={(e, pres) => {
                e.preventDefault()
                openPresentationMenu(e, pres)
              }}
              pinnedIds={pinnedIds}
              onTogglePinned={handleTogglePinned}
              selectedPresentationId={selectedPresentationId}
              onSelectPresentation={setSelectedPresentationId}
              menu={menu}
              onActionMenuToggle={openPresentationMenu}
            />
          )}

          {homeTab === 'new' && (
            <NewLibrary
              templates={PRESENTATION_TEMPLATES}
              onNew={handleNew}
              onTemplate={handleTemplate}
            />
          )}

          {homeTab === 'recent' && (
            <RecentLibrary
              presentations={recentPresentations}
              onOpen={handleOpen}
              onContextMenu={(e, pres) => {
                e.preventDefault()
                openPresentationMenu(e, pres)
              }}
              pinnedIds={pinnedIds}
              onTogglePinned={handleTogglePinned}
              selectedPresentationId={selectedPresentationId}
              onSelectPresentation={setSelectedPresentationId}
              menu={menu}
              onActionMenuToggle={openPresentationMenu}
            />
          )}

          {homeTab === 'open' && (
            <OpenLibrary
              presentations={filteredPresentations}
              query={query}
              setQuery={setQuery}
              onOpen={handleOpen}
              onContextMenu={(e, pres) => {
                e.preventDefault()
                openPresentationMenu(e, pres)
              }}
              pinnedIds={pinnedIds}
              onTogglePinned={handleTogglePinned}
              selectedPresentationId={selectedPresentationId}
              onSelectPresentation={setSelectedPresentationId}
              menu={menu}
              onActionMenuToggle={openPresentationMenu}
            />
          )}
        </div>

        {(homeTab === 'home' || homeTab === 'recent' || homeTab === 'open') && (
          <div
            className="shrink-0 px-8 py-2 flex items-center justify-between gap-3"
            style={{
              borderTop: '1px solid var(--border-subtle)',
              background: 'rgba(18, 22, 29, 0.92)',
              backdropFilter: 'blur(14px)',
            }}
          >
            <p className="text-[13px] truncate" style={{ color: 'var(--text-secondary)' }}>
              {selectedPresentation
                ? `Selected: ${selectedPresentation.title}`
                : 'Select a presentation to open it.'}
            </p>
            <div className="flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedPresentationId(null)
                  setMenu(null)
                }}
                disabled={!selectedPresentation}
                className="px-4 py-1.5 rounded-full text-sm font-medium"
                style={{
                  background: selectedPresentation ? 'var(--bg-hover)' : 'transparent',
                  color: selectedPresentation ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-default)',
                  cursor: selectedPresentation ? 'pointer' : 'default',
                  opacity: selectedPresentation ? 1 : 0.55,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => selectedPresentation && handleOpen(selectedPresentation)}
                disabled={!selectedPresentation}
                className="px-5 py-1.5 rounded-full text-sm font-medium"
                style={{
                  background: selectedPresentation ? 'var(--accent)' : 'rgba(74,124,255,0.32)',
                  color: '#fff',
                  cursor: selectedPresentation ? 'pointer' : 'default',
                  opacity: selectedPresentation ? 1 : 0.72,
                }}
              >
                Open
              </button>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: 'Open', onClick: () => handleOpen(menu.pres) },
            { label: menu.pinned ? 'Unpin' : 'Pin', onClick: () => handleTogglePinned(menu.pres) },
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

function HomeLibrary({
  templates,
  onTemplate,
  onViewAllTemplates,
  presentations,
  onOpen,
  onContextMenu,
  pinnedIds,
  onTogglePinned,
  selectedPresentationId,
  onSelectPresentation,
  menu,
  onActionMenuToggle,
}) {
  const homeTemplates = templates.slice(0, 4)

  return (
    <>
      <section className="mb-10" data-tour="home-templates">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[1.6rem] font-semibold" style={{ color: 'var(--text-primary)' }}>
            Templates
          </h2>
          <button
            onClick={onViewAllTemplates}
            className="text-sm font-medium"
            style={{ color: 'var(--accent)' }}
          >
            More templates
          </button>
        </div>

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          {homeTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              variant="compact"
              onSelect={() => onTemplate(template.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Recent
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Latest 10 presentations
          </p>
        </div>

        <PresentationList
          presentations={presentations}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          pinnedIds={pinnedIds}
          onTogglePinned={onTogglePinned}
          selectedPresentationId={selectedPresentationId}
          onSelectPresentation={onSelectPresentation}
          menu={menu}
          onActionMenuToggle={onActionMenuToggle}
          emptyTitle="No recent presentations yet"
          emptyBody="Open or create a presentation and it will show up here for quick access."
        />
      </section>
    </>
  )
}

function NewLibrary({ templates, onNew, onTemplate }) {
  return (
    <section>
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        <TemplateCard blank variant="hero" onSelect={onNew} />
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            variant="hero"
            onSelect={() => onTemplate(template.id)}
          />
        ))}
      </div>
    </section>
  )
}

function RecentLibrary({ presentations, onOpen, onContextMenu, pinnedIds, onTogglePinned, selectedPresentationId, onSelectPresentation, menu, onActionMenuToggle }) {
  return (
    <PresentationList
      presentations={presentations}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      pinnedIds={pinnedIds}
      onTogglePinned={onTogglePinned}
      selectedPresentationId={selectedPresentationId}
      onSelectPresentation={onSelectPresentation}
      menu={menu}
      onActionMenuToggle={onActionMenuToggle}
      emptyTitle="No recent presentations yet"
      emptyBody="As you work, your most recently opened presentations will collect here."
    />
  )
}

function OpenLibrary({ presentations, query, setQuery, onOpen, onContextMenu, pinnedIds, onTogglePinned, selectedPresentationId, onSelectPresentation, menu, onActionMenuToggle }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Search Library
        </h2>
        <div
          className="flex items-center gap-2 px-4 h-11 rounded-full w-[24rem] max-w-full"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          }}
        >
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search presentations by name or date..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      <PresentationList
        presentations={presentations}
        query={query}
        onOpen={onOpen}
        onContextMenu={onContextMenu}
        pinnedIds={pinnedIds}
        onTogglePinned={onTogglePinned}
        selectedPresentationId={selectedPresentationId}
        onSelectPresentation={onSelectPresentation}
        menu={menu}
        onActionMenuToggle={onActionMenuToggle}
        emptyTitle="No presentations match that search"
        emptyBody="Try a different title, month, or full date."
      />
    </>
  )
}

function TemplateCard({ template, onSelect, variant = 'compact', blank = false }) {
  const visual = TEMPLATE_VISUALS[blank ? 'blank' : template.id]
  const title = blank ? 'Blank Presentation' : template.title

  return (
    <button
      onClick={onSelect}
      className={variant === 'hero' ? 'text-left rounded-[30px] p-4' : 'text-left rounded-[24px] p-3.5'}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 14px 34px rgba(8, 14, 30, 0.07)',
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 18px 38px rgba(8, 14, 30, 0.10)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 14px 34px rgba(8, 14, 30, 0.07)'
      }}
    >
      <TemplatePreview visual={visual} blank={blank} variant={variant} />
      <div
        className={
          variant === 'hero'
            ? 'pt-3.5 min-h-[3rem] flex items-start'
            : 'pt-2.5 min-h-[2.6rem] flex items-start'
        }
      >
        <p
          className={variant === 'hero' ? 'text-[1.08rem] font-semibold leading-tight' : 'text-[0.95rem] font-semibold leading-tight'}
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </p>
      </div>
    </button>
  )
}

function TemplatePreview({ visual, blank, variant }) {
  const isHero = variant === 'hero'

  return (
    <div
      className={isHero ? 'rounded-[26px] p-4 overflow-hidden' : 'rounded-[20px] p-3 overflow-hidden'}
      style={{
        background: visual.gradient,
        minHeight: isHero ? 212 : 132,
      }}
    >
      <div
        className={
          isHero
            ? 'rounded-[22px] h-full px-4.5 pt-4 pb-4.5 flex flex-col'
            : 'rounded-[18px] h-full px-3.5 pt-3.5 pb-3.5 flex flex-col'
        }
        style={{
          background: visual.card,
          boxShadow: '0 10px 24px rgba(17, 25, 40, 0.12)',
        }}
      >
        <div
          className={
            isHero
              ? 'min-h-[1.5rem] flex items-center justify-center text-center'
              : 'min-h-[1.15rem] flex items-center justify-center text-center'
          }
        >
          <p
            className={
              isHero
                ? 'text-[11px] font-bold uppercase tracking-[0.22em] leading-none'
                : 'text-[10px] font-bold uppercase tracking-[0.2em] leading-none'
            }
            style={{ color: visual.accent }}
          >
            {visual.eyebrow}
          </p>
        </div>

        {blank ? (
          <div
            className={
              isHero
                ? 'rounded-[20px] border-2 border-dashed flex-1 mt-2 flex items-center justify-center'
                : 'rounded-2xl border-2 border-dashed h-16 mt-1.5 flex items-center justify-center'
            }
            style={{ borderColor: 'rgba(47,115,255,0.22)', color: visual.accent }}
          >
            <Plus size={isHero ? 34 : 22} />
          </div>
        ) : (
          <div className={isHero ? 'space-y-2 mt-2' : 'space-y-1.5 mt-1.5'}>
            {visual.lines.map((line) => (
              <div
                key={line}
                className={
                  isHero
                    ? 'rounded-full px-4 py-2 text-sm font-medium'
                    : 'rounded-full px-3 py-1.5 text-[12px] font-medium'
                }
                style={{
                  background: 'rgba(18,22,29,0.06)',
                  color: '#1c2430',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PresentationList({
  presentations,
  onOpen,
  onContextMenu,
  pinnedIds = [],
  onTogglePinned,
  selectedPresentationId,
  onSelectPresentation,
  menu,
  onActionMenuToggle,
  query = '',
  emptyTitle,
  emptyBody,
}) {
  return (
    <div
      className="rounded-[28px] overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 16px 40px rgba(8, 14, 30, 0.06)',
      }}
    >
      <div
        className="grid grid-cols-[minmax(0,1.45fr)_180px_128px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
        style={{
          color: 'var(--text-tertiary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span>Presentation</span>
        <span>Updated</span>
        <span />
      </div>

      {presentations.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--bg-hover)' }}
          >
            <FileText size={26} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {emptyTitle}
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            {emptyBody}
          </p>
        </div>
      ) : (
        presentations.map((pres) => (
          <PresentationRow
            key={pres.id}
            presentation={pres}
            query={query}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            pinned={pinnedIds.includes(pres.id)}
            onTogglePinned={onTogglePinned}
            selected={selectedPresentationId === pres.id}
            onSelect={() => onSelectPresentation?.(pres.id)}
            menu={menu}
            onActionMenuToggle={onActionMenuToggle}
          />
        ))
      )}
    </div>
  )
}

function PresentationRow({
  presentation,
  query,
  onOpen,
  onContextMenu,
  pinned = false,
  onTogglePinned,
  selected = false,
  onSelect,
  menu,
  onActionMenuToggle,
}) {
  const [hovered, setHovered] = useState(false)
  const slide = firstSlideOf(presentation)
  const previewText =
    slideBodyToPlainText(slide?.body).split('\n').map((line) => line.trim()).filter(Boolean)[0] || 'No slide content yet'
  const menuOpen = menu?.source === 'actions' && menu?.pres?.id === presentation.id
  const showActions = hovered || selected || menuOpen

  return (
    <div
      className="grid grid-cols-[minmax(0,1.45fr)_180px_128px] gap-4 px-5 py-4 items-center cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: selected ? 'rgba(74,124,255,0.12)' : hovered ? 'var(--bg-hover)' : 'transparent',
      }}
      onClick={() => onSelect?.()}
      onDoubleClick={() => onOpen(presentation)}
      onContextMenu={(e) => {
        onSelect?.()
        onContextMenu(e, presentation)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="min-w-0 flex items-center gap-4">
        <PresentationPreview presentation={presentation} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {pinned && (
              <Pin size={13} fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            )}
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              <HighlightText text={presentation.title} query={query} />
            </p>
          </div>
          <p className="text-sm truncate mt-1" style={{ color: 'var(--text-secondary)' }}>
            {query ? <HighlightText text={previewText} query={query} /> : previewText}
          </p>
        </div>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        <HighlightText text={formatDate(presentation.updated_at)} query={query} />
      </p>
      <div className="flex justify-end items-center gap-2">
        {showActions ? (
          <>
            <button
              type="button"
              aria-label={pinned ? 'Unpin presentation' : 'Pin presentation'}
              title={pinned ? 'Unpin' : 'Pin'}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.()
                onTogglePinned?.(presentation)
              }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: pinned ? 'rgba(74,124,255,0.14)' : 'transparent',
                color: pinned ? 'var(--accent)' : 'var(--text-tertiary)',
                border: `1px solid ${pinned ? 'rgba(74,124,255,0.22)' : 'var(--border-subtle)'}`,
              }}
            >
              <Pin size={18} fill={pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              onMouseDown={(e) => {
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.()
                const rect = e.currentTarget.getBoundingClientRect()
                onActionMenuToggle?.(
                  { preventDefault() {}, clientX: rect.right - 8, clientY: rect.bottom + 6 },
                  presentation,
                  'actions'
                )
              }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'transparent',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </>
        ) : (
          <div className="w-[98px]" />
        )}
      </div>
    </div>
  )
}

function PresentationPreview({ presentation }) {
  const slide = firstSlideOf(presentation)

  if (!slide) {
    return (
      <div
        className="w-[90px] rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: '#171b24' }}
      >
        <FileText size={24} style={{ color: '#555' }} />
      </div>
    )
  }

  const lines = slide.body.split('\n').filter(Boolean).slice(0, 4)

  return (
    <div
      className="w-[90px] rounded-2xl shrink-0 overflow-hidden"
      style={{ background: '#171b24', aspectRatio: getPresentationAspectRatio(presentation) }}
    >
      <ScaledSlideText
        presentation={presentation}
        slide={{ ...slide, body: lines.join('\n') }}
        empty="No slide"
        shadow="none"
        minPaddingX={8}
        minPaddingY={8}
      />
    </div>
  )
}
