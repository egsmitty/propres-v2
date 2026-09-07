import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Image } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import ContextMenu from '@/components/shared/ContextMenu';
import { getSectionTypeLabel } from '@/utils/sectionTypes';
import { promptDialog } from '@/utils/dialog';

export default function SectionHeader({
  section,
  collapsed,
  onToggle,
  onAddSlide,
  onRemove,
  onEditSong,
}) {
  const [menu, setMenu] = useState(null);
  const updateSectionMeta = useEditorStore((s) => s.updateSectionMeta);

  function handleContextMenu(e) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleEditSection() {
    const title = await promptDialog('Section title:', section.title, {
      title:
        section.type === 'announcement'
          ? 'Rename Announcements'
          : section.type === 'sermon'
            ? 'Rename Sermon'
            : 'Rename Section',
      confirmLabel: 'Rename',
    });
    if (!title) return;
    updateSectionMeta(section.id, { title });
  }

  const menuItems =
    section.type === 'song'
      ? [
          { label: 'Edit Song', onClick: onEditSong, disabled: !onEditSong },
          { divider: true },
          { label: 'Remove Song', danger: true, onClick: onRemove },
        ]
      : [
          {
            label:
              section.type === 'announcement'
                ? 'Rename Announcements'
                : section.type === 'sermon'
                  ? 'Rename Sermon'
                  : 'Rename Section',
            onClick: handleEditSection,
          },
          { divider: true },
          { label: 'Add Slide', onClick: onAddSlide },
          { divider: true },
          {
            label:
              section.type === 'announcement'
                ? 'Remove Announcements'
                : section.type === 'sermon'
                  ? 'Remove Sermon'
                  : 'Remove Section',
            danger: true,
            onClick: onRemove,
          },
        ];

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className="flex items-center min-h-10 px-2 py-1 relative group bg-bg-surface border-b border-border-subtle"
        style={{
          borderLeft: `3px solid ${section.color || 'var(--section-1)'}`,
        }}
      >
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-4 h-4 shrink-0 mr-1 text-text-tertiary"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-wide mb-0.5 text-accent"
            title={getSectionTypeLabel(section.type)}
          >
            {getSectionTypeLabel(section.type)}
          </div>
          <div className="text-xs font-medium truncate text-text-primary" title={section.title}>
            {section.title}
          </div>
        </div>

        {section.backgroundId && (
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full mr-1 bg-white/6 text-text-secondary"
            title="Section background set"
          >
            <Image size={10} />
          </span>
        )}

        <span className="text-xs mr-1 whitespace-nowrap text-text-tertiary">
          {section.slides.length} {section.slides.length === 1 ? 'slide' : 'slides'}
        </span>

        <button
          onClick={onAddSlide}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-4 h-4 rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          title="Add slide to this section"
        >
          <Plus size={11} />
        </button>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
