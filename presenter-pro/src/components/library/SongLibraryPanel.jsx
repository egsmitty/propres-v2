import React, { useState, useEffect } from 'react';
import { X, Search, Music, Plus } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getSongs } from '@/utils/ipc';
import SongCard from './SongCard';
import SongEditorModal from './SongEditorModal';

export default function SongLibraryPanel() {
  const setSongLibraryOpen = useAppStore((s) => s.setSongLibraryOpen);
  const [songs, setSongs] = useState([]);
  const [query, setQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editSong, setEditSong] = useState(null);

  useEffect(() => {
    loadSongs();
  }, []);

  async function loadSongs() {
    const result = await getSongs();
    if (result?.success) setSongs(result.data);
  }

  function handleInsert() {
    setSongLibraryOpen(false);
  }

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      (s.artist || '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <div
        className="h-full z-30 flex flex-col shadow-xl shrink-0 w-[320px] bg-bg-surface border-r border-border-default [animation:slide-in-left_150ms_ease]"
        data-panel="song-library"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Music size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">Song Library</span>
          </div>
          <button
            type="button"
            aria-label="Close song library"
            onClick={() => setSongLibraryOpen(false)}
            className="flex items-center justify-center w-6 h-6 rounded text-text-tertiary hover:bg-bg-hover"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0 border-b border-border-subtle">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-bg-app border border-border-default">
            <Search size={12} className="text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs…"
              className="flex-1 bg-transparent text-xs text-text-primary"
            />
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Music size={24} className="text-text-tertiary" />
              <p className="text-xs text-text-tertiary">
                {query ? 'No songs found' : 'No songs in library'}
              </p>
            </div>
          ) : (
            filtered.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                onInsert={handleInsert}
                onEdit={() => {
                  setEditSong(song);
                  setShowEditor(true);
                }}
                onRefresh={loadSongs}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 shrink-0 border-t border-border-subtle">
          <button
            onClick={() => {
              setEditSong(null);
              setShowEditor(true);
            }}
            className="flex items-center gap-1.5 w-full justify-center py-1.5 rounded text-xs font-medium bg-bg-surface hover:bg-bg-hover border border-border-default text-text-primary"
          >
            <Plus size={13} />
            New Song
          </button>
        </div>
      </div>

      {showEditor && (
        <SongEditorModal
          key={editSong?.id ?? 'new'}
          song={editSong}
          onClose={() => {
            setShowEditor(false);
            setEditSong(null);
          }}
          onSave={loadSongs}
        />
      )}
    </>
  );
}
