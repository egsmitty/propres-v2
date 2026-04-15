import React, { useEffect, useMemo, useState } from 'react'
import { Home as HomeIcon, PlusCircle, FolderOpen, Clock3, BookOpen, Search, FileText, Plus } from 'lucide-react'
import { getPresentations, getProfile } from '@/utils/ipc'
import ContextMenu from '@/components/shared/ContextMenu'
import { useAppStore } from '@/store/appStore'
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
    if (result?.success) await loadPresentations()
  }

  function handleShowTutorial() {
    setHomeTab('home')
    setTutorialStepIndex(0)
    setTutorialOpen(true)
  }

  const sortedPresentations = useMemo(
    () => [...presentations].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)),
    [presentations]
  )
  const homeRecentPresentations = sortedPresentations.slice(0, 10)
  const recentPresentations = sortedPresentations.slice(0, 25)
  const filteredPresentations = sortedPresentations.filter((pres) =>
    matchesPresentationQuery(pres, query)
  )

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

      <div className="flex-1 flex flex-col overflow-auto">
        <div className="px-8 pt-7 pb-8 min-h-full">
          <div className="flex items-start justify-between gap-6 mb-8">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] mb-3"
                style={{ color: 'var(--accent)' }}
              >
                PresenterPro
              </p>
              <h1 className="text-[2rem] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {homeTab === 'home'
                  ? 'Home'
                  : homeTab === 'new'
                    ? 'New Presentation'
                    : homeTab === 'recent'
                      ? 'Recent Presentations'
                      : 'Open Presentation'}
              </h1>
              <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
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
                setMenu({ x: e.clientX, y: e.clientY, pres })
              }}
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
                setMenu({ x: e.clientX, y: e.clientY, pres })
              }}
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
                setMenu({ x: e.clientX, y: e.clientY, pres })
              }}
            />
          )}
        </div>
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

function HomeLibrary({
  templates,
  onTemplate,
  onViewAllTemplates,
  presentations,
  onOpen,
  onContextMenu,
}) {
  return (
    <>
      <section className="mb-10" data-tour="home-templates">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {templates.map((template) => (
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
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Recent
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Showing your latest 10 presentations
          </p>
        </div>

        <PresentationList
          presentations={presentations}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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

function RecentLibrary({ presentations, onOpen, onContextMenu }) {
  return (
    <PresentationList
      presentations={presentations}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      emptyTitle="No recent presentations yet"
      emptyBody="As you work, your most recently opened presentations will collect here."
    />
  )
}

function OpenLibrary({ presentations, query, setQuery, onOpen, onContextMenu }) {
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
        emptyTitle="No presentations match that search"
        emptyBody="Try a different title, month, or full date."
      />
    </>
  )
}

function TemplateCard({ template, onSelect, variant = 'compact', blank = false }) {
  const visual = TEMPLATE_VISUALS[blank ? 'blank' : template.id]
  const title = blank ? 'Blank Presentation' : template.title
  const description = blank
    ? 'Start with a clean deck and build every section yourself.'
    : template.description

  return (
    <button
      onClick={onSelect}
      className="text-left rounded-[28px] p-4"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 18px 48px rgba(8, 14, 30, 0.08)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <TemplatePreview visual={visual} blank={blank} variant={variant} />
      <div className={variant === 'hero' ? 'pt-4' : 'pt-3'}>
        {template?.featured && (
          <div
            className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] mb-2"
            style={{ background: 'rgba(74,124,255,0.12)', color: 'var(--accent)' }}
          >
            Featured
          </div>
        )}
        <p
          className={variant === 'hero' ? 'text-base font-semibold' : 'text-sm font-semibold'}
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </p>
        <p className="text-xs leading-5 mt-1" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
    </button>
  )
}

function TemplatePreview({ visual, blank, variant }) {
  return (
    <div
      className="rounded-[24px] p-4 overflow-hidden"
      style={{
        background: visual.gradient,
        minHeight: variant === 'hero' ? 220 : 180,
      }}
    >
      <div
        className="rounded-[22px] h-full p-4 flex flex-col justify-between"
        style={{
          background: visual.card,
          boxShadow: '0 12px 28px rgba(17, 25, 40, 0.14)',
        }}
      >
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: visual.accent }}
          >
            {visual.eyebrow}
          </p>
          <p className="text-xl font-semibold mt-3" style={{ color: '#12161d' }}>
            {visual.title}
          </p>
        </div>

        {blank ? (
          <div
            className="rounded-2xl border-2 border-dashed h-24 flex items-center justify-center"
            style={{ borderColor: 'rgba(47,115,255,0.22)', color: visual.accent }}
          >
            <Plus size={28} />
          </div>
        ) : (
          <div className="space-y-2">
            {visual.lines.map((line) => (
              <div
                key={line}
                className="rounded-full px-3 py-2 text-xs font-medium"
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
        className="grid grid-cols-[minmax(0,1.45fr)_180px_110px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
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
          />
        ))
      )}
    </div>
  )
}

function PresentationRow({ presentation, query, onOpen, onContextMenu }) {
  const slide = firstSlideOf(presentation)
  const previewText =
    slide?.body?.split('\n').map((line) => line.trim()).filter(Boolean)[0] || 'No slide content yet'

  return (
    <div
      className="grid grid-cols-[minmax(0,1.45fr)_180px_110px] gap-4 px-5 py-4 items-center"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
      onContextMenu={(e) => onContextMenu(e, presentation)}
    >
      <div className="min-w-0 flex items-center gap-4">
        <PresentationPreview presentation={presentation} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            <HighlightText text={presentation.title} query={query} />
          </p>
          <p className="text-sm truncate mt-1" style={{ color: 'var(--text-secondary)' }}>
            {query ? <HighlightText text={previewText} query={query} /> : previewText}
          </p>
        </div>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        <HighlightText text={formatDate(presentation.updated_at)} query={query} />
      </p>
      <div className="flex justify-end">
        <button
          onClick={() => onOpen(presentation)}
          className="w-24 px-3 py-2 rounded-full text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          Open
        </button>
      </div>
    </div>
  )
}

function PresentationPreview({ presentation }) {
  const slide = firstSlideOf(presentation)

  if (!slide?.body) {
    return (
      <div
        className="w-[90px] h-[54px] rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: '#171b24' }}
      >
        <FileText size={24} style={{ color: '#555' }} />
      </div>
    )
  }

  const lines = slide.body.split('\n').filter(Boolean).slice(0, 4)

  return (
    <div
      className="w-[90px] h-[54px] rounded-2xl flex items-center justify-center px-3 shrink-0"
      style={{ background: '#171b24' }}
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
