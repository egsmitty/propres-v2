import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Film,
  Folder,
  FolderPlus,
  Image,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useEditorStore } from '@/store/editorStore'
import {
  createMediaFolder,
  deleteMedia,
  deleteMediaFolder,
  getMedia,
  getMediaFolders,
  importMedia,
  updateMedia,
  updateMediaFolder,
} from '@/utils/ipc'
import { getMediaAssetUrl, isVideoMedia } from '@/utils/backgrounds'
import { getSectionTypeLabel } from '@/utils/sectionTypes'
import { insertMediaSlideIntoCurrentPresentation } from '@/utils/presentationCommands'
import { confirmDialog, promptDialog, showDialog } from '@/utils/dialog'
import ContextMenu from '@/components/shared/ContextMenu'

export default function MediaLibraryPanel() {
  const setMediaLibraryOpen = useAppStore((s) => s.setMediaLibraryOpen)
  const presentation = useEditorStore((s) => s.presentation)
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId)
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId)
  const setSlideBackground = useEditorStore((s) => s.setSlideBackground)
  const setSectionBackground = useEditorStore((s) => s.setSectionBackground)

  const [media, setMedia] = useState([])
  const [folders, setFolders] = useState([])
  const [tab, setTab] = useState('images')
  const [query, setQuery] = useState('')
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [selectedMediaId, setSelectedMediaId] = useState(null)
  const [dragOverFolderId, setDragOverFolderId] = useState(null)
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    loadLibrary()
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (!selectedFolderId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      const folder = folders.find((item) => item.id === selectedFolderId)
      if (folder) void handleDeleteFolder(folder)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [folders, selectedFolderId])

  async function loadLibrary() {
    const [mediaResult, folderResult] = await Promise.all([getMedia(), getMediaFolders()])
    if (mediaResult?.success) setMedia(mediaResult.data)
    if (folderResult?.success) setFolders(folderResult.data)
  }

  async function handleImport() {
    const result = await importMedia({ folderId: currentFolderId })
    if (result?.success) loadLibrary()
  }

  async function handleNewFolder() {
    const name = await promptDialog('Folder name:', '', {
      title: 'New Folder',
      confirmLabel: 'Create',
      placeholder: 'New Folder',
    })
    if (!name) return
    const result = await createMediaFolder({ name })
    if (result?.success) {
      setSelectedFolderId(result.data?.id ?? null)
      loadLibrary()
    }
  }

  async function handleRenameFolder(folder) {
    const nextName = await promptDialog('Rename folder:', folder.name, {
      title: 'Rename Folder',
      confirmLabel: 'Rename',
    })
    if (!nextName || nextName === folder.name) return
    const result = await updateMediaFolder(folder.id, { name: nextName })
    if (result?.success) loadLibrary()
  }

  async function handleDeleteFolder(folder) {
    const count = media.filter((item) => item.folder_id === folder.id).length
    const ok = await confirmDialog(
      count
        ? `Delete folder "${folder.name}" and remove its ${count} media item${count === 1 ? '' : 's'} from your media library? The files on your hard drive will not be deleted.`
        : `Delete folder "${folder.name}"?`,
      {
        title: 'Delete Folder',
        confirmLabel: 'Delete',
        danger: true,
      }
    )
    if (!ok) return
    const result = await deleteMediaFolder(folder.id)
    if (result?.success) {
      if (currentFolderId === folder.id) setCurrentFolderId(null)
      if (selectedFolderId === folder.id) setSelectedFolderId(null)
      loadLibrary()
    }
  }

  async function handleRenameItem(item) {
    const nextName = await promptDialog('Rename media item:', item.name, { title: 'Rename Media', confirmLabel: 'Rename' })
    if (!nextName || nextName === item.name) return
    const result = await updateMedia(item.id, { name: nextName })
    if (result?.success) loadLibrary()
  }

  async function handleMoveItem(item) {
    const folderOptions = [
      { value: 'root', label: 'Library Root' },
      ...folders.map((folder) => ({ value: String(folder.id), label: folder.name })),
    ]
    const result = await showDialog({
      title: 'Move Media',
      description: `Choose where "${item.name}" should live.`,
      fields: [
        {
          name: 'folderId',
          label: 'Folder',
          type: 'select',
          defaultValue: item.folder_id ? String(item.folder_id) : 'root',
          options: folderOptions,
        },
      ],
      actions: [
        { label: 'Cancel', value: null, cancel: true },
        { label: 'Move', value: 'confirm', primary: true },
      ],
    })
    if (!result || result.action !== 'confirm') return
    const nextFolderId = result.values?.folderId === 'root' ? null : Number(result.values?.folderId)
    const updateResult = await updateMedia(item.id, { folder_id: Number.isFinite(nextFolderId) ? nextFolderId : null })
    if (updateResult?.success) loadLibrary()
  }

  async function handleDeleteItem(item) {
    const ok = await confirmDialog(`Delete "${item.name}" from the media library?`, {
      title: 'Delete Media',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const result = await deleteMedia(item.id)
    if (result?.success) loadLibrary()
  }

  function applyToSlide(mediaId) {
    if (!selectedSectionId || !selectedSlideId) return
    setSlideBackground(selectedSectionId, selectedSlideId, mediaId)
    setMediaLibraryOpen(false)
  }

  function applyToSection(mediaId) {
    if (!selectedSectionId) return
    setSectionBackground(selectedSectionId, mediaId)
    setMediaLibraryOpen(false)
  }

  async function insertAsMediaSlide(item) {
    const result = await insertMediaSlideIntoCurrentPresentation(item)
    if (result) setMediaLibraryOpen(false)
  }

  const currentFolder = folders.find((folder) => folder.id === currentFolderId) || null
  const selectedSection = presentation?.sections?.find((section) => section.id === selectedSectionId) || null
  const sectionLabel = selectedSection ? getSectionTypeLabel(selectedSection.type) : 'Section'
  const sectionBackgroundLabel = `Set ${sectionLabel} Background`
  const normalizedQuery = query.trim().toLowerCase()

  const visibleFolders = useMemo(
    () =>
      currentFolderId
        ? []
        : folders.filter((folder) => !normalizedQuery || folder.name.toLowerCase().includes(normalizedQuery)),
    [currentFolderId, folders, normalizedQuery]
  )

  const visibleMedia = useMemo(
    () =>
      media.filter((item) => {
        const matchesType = tab === 'images' ? item.type === 'image' : item.type === 'video'
        const matchesFolder = currentFolderId ? item.folder_id === currentFolderId : item.folder_id == null
        const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery)
        return matchesType && matchesFolder && matchesQuery
      }),
    [currentFolderId, media, normalizedQuery, tab]
  )
  const selectedMediaItem = visibleMedia.find((item) => item.id === selectedMediaId) || media.find((item) => item.id === selectedMediaId) || null

  useEffect(() => {
    if (!selectedMediaId) return
    if (media.some((item) => item.id === selectedMediaId)) return
    setSelectedMediaId(null)
  }, [media, selectedMediaId])

  function buildUseMenuItems(item) {
    return [
      { label: 'Set Slide Background', onClick: () => applyToSlide(item.id), disabled: !selectedSlideId },
      { label: sectionBackgroundLabel, onClick: () => applyToSection(item.id), disabled: !selectedSection },
      { label: 'Insert Media Slide', onClick: () => insertAsMediaSlide(item), disabled: !selectedSection },
    ]
  }

  function buildMoreMenuItems(item) {
    return [
      { label: 'Move', onClick: () => handleMoveItem(item) },
      { label: 'Rename', onClick: () => handleRenameItem(item) },
    ]
  }

  function buildContextMenuItems(item) {
    return [
      ...buildUseMenuItems(item),
      ...buildMoreMenuItems(item),
      { label: 'Delete', onClick: () => handleDeleteItem(item), danger: true },
    ]
  }

  function openContextMenuForItem(item, x, y) {
    setSelectedMediaId(item.id)
    setMenu({
      x,
      y,
      items: buildContextMenuItems(item),
    })
  }

  function openFooterMenu(button, items) {
    const rect = button.getBoundingClientRect()
    setMenu({
      x: rect.right - 8,
      y: rect.bottom + 6,
      items,
    })
  }

  return (
    <div
      className="h-full z-30 flex flex-col shadow-xl shrink-0"
      style={{
        width: 320,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
        animation: 'slide-in-left 150ms ease',
      }}
      onMouseDown={() => setSelectedFolderId(null)}
    >
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <Image size={14} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Media Library
          </span>
        </div>
        <button
          onClick={() => setMediaLibraryOpen(false)}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={14} />
        </button>
      </div>

      <div
        className="flex shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {['images', 'videos'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 text-xs capitalize"
            style={{
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t ? 500 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        className="px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div
          className="rounded-xl px-3 py-2 mb-2"
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-default)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Applying To
          </p>
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {selectedSection ? `${sectionLabel}: ${selectedSection.title}` : 'Choose a section first'}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Library items can become a section background or a media slide in the flow.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {currentFolder ? (
            <button
              type="button"
              onClick={() => { setCurrentFolderId(null); setSelectedFolderId(null) }}
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              title="Back to media library"
            >
              <ArrowLeft size={14} />
            </button>
          ) : null}
          <div
            className="flex-1 rounded-xl px-3 py-2"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {currentFolder ? 'Folder' : 'Library'}
            </p>
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {currentFolder ? `Library / ${currentFolder.name}` : 'Library Root'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleNewFolder}
            className="px-2.5 h-8 rounded-lg text-[11px] font-medium shrink-0"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            New Folder
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="px-2.5 h-8 rounded-lg text-[11px] font-medium shrink-0"
            style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            Import
          </button>
        </div>

        <div
          className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
          style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
        >
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={currentFolder ? 'Search this folder...' : 'Search library...'}
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--text-primary)' }}
            onMouseDown={(event) => event.stopPropagation()}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {!currentFolder && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Folder size={13} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                Folders
              </span>
            </div>
            {visibleFolders.length ? (
              <div className="grid grid-cols-1 gap-2">
                {visibleFolders.map((folder) => {
                  const folderCount = media.filter((item) => item.folder_id === folder.id).length
                  const selected = selectedFolderId === folder.id
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.stopPropagation()
                        setSelectedFolderId(folder.id)
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        setCurrentFolderId(folder.id)
                        setSelectedFolderId(folder.id)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setSelectedFolderId(folder.id)
                        setMenu({
                          x: event.clientX,
                          y: event.clientY,
                          items: [
                            { label: 'Open Folder', onClick: () => setCurrentFolderId(folder.id) },
                            { label: 'Rename Folder', onClick: () => handleRenameFolder(folder) },
                            { divider: true },
                            { label: 'Delete Folder', onClick: () => handleDeleteFolder(folder), danger: true },
                          ],
                        })
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left"
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setDragOverFolderId(folder.id)
                      }}
                      onDragLeave={() => {
                        setDragOverFolderId((current) => (current === folder.id ? null : current))
                      }}
                      onDrop={async (event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setDragOverFolderId(null)
                        const rawMediaId = event.dataTransfer.getData('application/presenterpro-media-id')
                        const mediaId = Number(rawMediaId)
                        if (!Number.isFinite(mediaId)) return
                        const updateResult = await updateMedia(mediaId, { folder_id: folder.id })
                        if (updateResult?.success) loadLibrary()
                      }}
                      style={{
                        background: dragOverFolderId === folder.id ? 'rgba(74,124,255,0.14)' : selected ? 'rgba(74,124,255,0.1)' : 'var(--bg-app)',
                        border: dragOverFolderId === folder.id ? '1px solid rgba(74,124,255,0.72)' : selected ? '1px solid rgba(74,124,255,0.55)' : '1px solid var(--border-default)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Folder size={16} style={{ color: selected ? 'var(--accent)' : 'var(--text-secondary)' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {folder.name}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                            {folderCount} item{folderCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div
                className="rounded-xl px-3 py-4 text-center"
                style={{ background: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
              >
                <FolderPlus size={18} className="mx-auto mb-2" />
                <p className="text-xs">{query ? 'No folders match that search' : 'No folders yet'}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
          {tab === 'images'
            ? <Image size={13} style={{ color: 'var(--text-secondary)' }} />
            : <Film size={13} style={{ color: 'var(--text-secondary)' }} />}
          <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {currentFolder ? currentFolder.name : tab}
          </span>
        </div>

        {visibleMedia.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            {tab === 'images'
              ? <Image size={24} style={{ color: 'var(--text-tertiary)' }} />
              : <Film size={24} style={{ color: 'var(--text-tertiary)' }} />}
            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              {query
                ? 'No media matches that search'
                : currentFolder
                  ? `No ${tab} in this folder yet`
                  : `No ${tab} in the library root`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleMedia.map((item) => (
              <div
                key={item.id}
                className="rounded overflow-hidden cursor-pointer"
                title={item.name}
                style={{
                  background: '#1a1a1a',
                  border: selectedMediaId === item.id ? '1px solid rgba(74,124,255,0.72)' : '1px solid var(--border-subtle)',
                  boxShadow: selectedMediaId === item.id ? '0 0 0 2px rgba(74,124,255,0.18)' : 'none',
                }}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/presenterpro-media-id', String(item.id))
                  event.dataTransfer.effectAllowed = 'move'
                  setSelectedMediaId(item.id)
                }}
                onClick={() => setSelectedMediaId(item.id)}
                onMouseDown={() => setSelectedMediaId(item.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openContextMenuForItem(item, event.clientX, event.clientY)
                }}
              >
                <div style={{ aspectRatio: '16/9' }} className="relative overflow-hidden">
                  <MediaPreview item={item} />
                </div>
                <div
                  className="px-2 py-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[11px] font-medium truncate flex-1" style={{ color: '#f3f4f6' }}>
                    {item.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                    {item.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="px-3 py-2 shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="mb-2 min-h-[2.25rem]">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Selected Media
          </p>
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {selectedMediaItem ? selectedMediaItem.name : 'Select a media item'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!selectedMediaItem}
            onClick={(event) => {
              if (!selectedMediaItem) return
              openFooterMenu(event.currentTarget, buildUseMenuItems(selectedMediaItem))
            }}
            className="h-9 rounded-lg text-xs font-medium"
            style={{
              background: selectedMediaItem ? 'var(--bg-surface)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              color: selectedMediaItem ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            Use
          </button>
          <button
            type="button"
            disabled={!selectedMediaItem}
            onClick={(event) => {
              if (!selectedMediaItem) return
              openFooterMenu(event.currentTarget, buildMoreMenuItems(selectedMediaItem))
            }}
            className="h-9 rounded-lg flex items-center justify-center"
            style={{
              background: selectedMediaItem ? 'var(--bg-surface)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              color: selectedMediaItem ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
            aria-label="More actions"
            title="More actions"
          >
            <MoreHorizontal size={15} />
          </button>
          <button
            type="button"
            disabled={!selectedMediaItem}
            onClick={() => {
              if (selectedMediaItem) void handleDeleteItem(selectedMediaItem)
            }}
            className="h-9 rounded-lg flex items-center justify-center"
            style={{
              background: selectedMediaItem ? 'rgba(220,38,38,0.08)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              color: selectedMediaItem ? '#dc2626' : 'var(--text-tertiary)',
            }}
            aria-label="Delete media"
            title="Delete media"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}

function MediaPreview({ item }) {
  const src = getMediaAssetUrl(item, { preferThumbnail: true })

  if (!src || item.file_exists === false) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center">
        <Image size={20} style={{ color: '#555' }} />
        <span style={{ color: '#9ca3af', fontSize: 10, fontWeight: 600 }}>
          Missing File
        </span>
      </div>
    )
  }

  if (isVideoMedia(item)) {
    return (
      <video
        src={src}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return (
    <img
      src={src}
      alt={item.name}
      className="w-full h-full object-cover"
    />
  )
}
