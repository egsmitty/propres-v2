import React, { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { deleteSong } from '@/utils/ipc';
import { createSection } from '@/utils/sectionTypes';
import { confirmDialog } from '@/utils/dialog';
import {
  flattenSongGroupsToSlides,
  getOrderedSongSlides,
  getSongGroupsAndArrangement,
} from '@/utils/songSections';
import { insertSectionAfterCurrentSelection } from '@/utils/presentationCommands';

function resolveOrderedSlides(song) {
  return getOrderedSongSlides(song);
}

export default function SongCard({ song, onEdit, onInsert, onRefresh }) {
  const presentation = useEditorStore((s) => s.presentation);
  const [isInserting, setIsInserting] = useState(false);

  const slides = resolveOrderedSlides(song);

  async function handleInsert() {
    if (!presentation || isInserting) return;
    setIsInserting(true);
    try {
      const { groups, arrangement } = getSongGroupsAndArrangement(song);
      const flattened = flattenSongGroupsToSlides(groups, arrangement, {
        regenerateSlideIds: true,
        regenerateGroupIds: true,
        songId: song.id,
      });
      const newSection = createSection('song', presentation.sections.length, {
        title: song.title,
        songId: song.id,
        songGroups: flattened.groups,
        songOrder: flattened.arrangement,
        slides: flattened.slides,
      });
      insertSectionAfterCurrentSelection(newSection);
      await Promise.resolve(onInsert?.(newSection));
    } finally {
      setIsInserting(false);
    }
  }

  async function handleDelete() {
    const ok = await confirmDialog(`Delete "${song.title}" from library?`, {
      title: 'Delete Song',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteSong(song.id);
    onRefresh();
  }
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle hover:bg-bg-hover"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/presenterpro-song-id', String(song.id));
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate text-text-primary">{song.title}</p>
        <p className="text-xs truncate text-text-secondary">{song.artist || 'Unknown artist'}</p>
      </div>

      <span className="text-xs mx-2 shrink-0 text-text-tertiary">{slides.length} slides</span>

      {/* Insert button — visible on hover */}
      <button
        onClick={handleInsert}
        disabled={isInserting || !presentation}
        className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 ${
          isInserting || !presentation
            ? 'bg-border-default text-text-tertiary'
            : 'bg-[rgba(74,124,255,0.12)] text-accent hover:bg-accent hover:text-text-on-accent'
        }`}
        style={{
          border: `1px solid ${isInserting || !presentation ? 'var(--border-default)' : 'rgba(74,124,255,0.16)'}`,
          cursor: isInserting || !presentation ? 'default' : 'pointer',
        }}
      >
        {isInserting ? 'Inserted' : 'Insert'}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="flex items-center justify-center w-7 h-7 rounded shrink-0 text-text-tertiary border border-border-subtle bg-transparent hover:bg-bg-surface"
        title="Edit Song"
      >
        <Pencil size={13} />
      </button>

      <button
        type="button"
        onClick={handleDelete}
        className="flex items-center justify-center w-7 h-7 rounded shrink-0 text-danger border border-border-subtle bg-transparent hover:bg-[rgba(220,38,38,0.08)] hover:border-[rgba(220,38,38,0.35)]"
        title="Delete Song"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
