import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { getPlatform, getShortcutKeys } from '@/utils/platformShortcuts';
import { shortcutGroups } from '@/utils/commandRegistry';

// Plan CMDS1: the command rows come from the registry (the same list the
// menus read), so a shortcut cannot be listed here and missing there. The
// keys below are not commands — they are what the editor and the presenter
// do with a bare key — and stay hand-written.
const KEYS = {
  group: 'Keys',
  items: [
    { shortcutTokens: ['Double-click'], label: 'Edit slide text' },
    { shortcutTokens: ['esc'], label: 'Exit text editing' },
    { shortcutTokens: ['left', 'right'], label: 'Previous / Next slide' },
    { shortcutTokens: ['?'], label: 'Show this overlay' },
  ],
};

function sheetGroups(platform) {
  return [
    ...shortcutGroups(platform),
    {
      group: KEYS.group,
      items: KEYS.items.map((item) => ({
        label: item.label,
        keys: getShortcutKeys(item.shortcutTokens, platform),
      })),
    },
  ];
}

export default function ShortcutsOverlay({ onClose }) {
  const platform = getPlatform();
  const groups = sheetGroups(platform);

  useEffect(() => {
    // Escape in the capture phase and consumed, so closing the sheet does not
    // also stop a live presentation (plan L1).
    function handleEscape(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    }
    // `?` deliberately stays in the bubble phase: the Editor toggles the sheet
    // on `?` too, and closing here first would let that toggle reopen it.
    function handleQuestionMark(e) {
      if (e.key === '?') onClose();
    }
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('keydown', handleQuestionMark);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('keydown', handleQuestionMark);
    };
  }, [onClose]);

  return (
    <div
      data-backdrop="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="rounded-xl shadow-2xl overflow-hidden w-[520px] bg-bg-surface border border-border-default">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close shortcuts"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-text-tertiary hover:bg-bg-hover"
          >
            <X size={14} />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-5 grid grid-cols-2 gap-6">
          {groups.map((group) => (
            <div key={group.group}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-text-tertiary">
                {group.group}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{item.label}</span>
                    <div className="flex items-center gap-0.5 ml-3">
                      {item.keys.map((key, ki) => (
                        <kbd
                          key={ki}
                          className="px-1.5 py-0.5 rounded-sm text-[11px] leading-4 font-medium bg-bg-app border border-border-default text-text-primary font-[monospace]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 text-xs text-center text-text-tertiary border-t border-border-subtle">
          Press{' '}
          <kbd className="px-1 py-0.5 rounded-sm mx-0.5 bg-bg-app border border-border-default font-[monospace] text-[11px]">
            ?
          </kbd>{' '}
          or{' '}
          <kbd className="px-1 py-0.5 rounded-sm mx-0.5 bg-bg-app border border-border-default font-[monospace] text-[11px]">
            Esc
          </kbd>{' '}
          to dismiss
        </div>
      </div>
    </div>
  );
}
