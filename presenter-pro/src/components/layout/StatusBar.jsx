import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePresenterStore } from '@/store/presenterStore';

export default function StatusBar() {
  const presentation = useEditorStore((s) => s.presentation);
  const selectedSlideId = useEditorStore((s) => s.selectedSlideId);
  const isPresenting = usePresenterStore((s) => s.isPresenting);

  const totalSlides = presentation
    ? presentation.sections.reduce((sum, sec) => sum + sec.slides.length, 0)
    : 0;

  const slideIndex =
    presentation && selectedSlideId
      ? (() => {
          let idx = 0;
          for (const sec of presentation.sections) {
            for (const sl of sec.slides) {
              idx++;
              if (sl.id === selectedSlideId) return idx;
            }
          }
          return null;
        })()
      : null;

  return (
    <div className="flex items-center justify-between px-3 h-6 shrink-0 text-xs bg-bg-toolbar border-t border-border-subtle text-text-tertiary">
      <span>
        {presentation
          ? `${totalSlides} slide${totalSlides !== 1 ? 's' : ''}`
          : 'No presentation open'}
      </span>

      <div className="flex items-center gap-3">
        {slideIndex && (
          <span>
            Slide {slideIndex} of {totalSlides}
          </span>
        )}
        {isPresenting && <span className="font-medium text-live">LIVE</span>}
      </div>
    </div>
  );
}
