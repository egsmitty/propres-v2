import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { slideBodyToPlainText } from '@/utils/slideMarkup';
import {
  closeStageDisplayWindow,
  getWindowViewState,
  notifyStageDisplayReady,
  onStageUpdate,
  onWindowViewState,
} from '@/utils/ipc';

function getStageText(slide, emptyMessage) {
  const text = slideBodyToPlainText(slide?.body || '');
  return text || emptyMessage;
}

function StageTextBlock({ text, empty = false, fontSize, lineHeight, textAlign = 'center' }) {
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        fontSize,
        lineHeight,
        fontWeight: empty ? 500 : 700,
        textAlign,
        color: empty ? 'rgba(255,255,255,0.34)' : 'var(--projector-text)',
      }}
    >
      {text}
    </div>
  );
}

export default function StageDisplayRenderer() {
  const [currentSlide, setCurrentSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState(null);
  const [isPreviewWindow, setIsPreviewWindow] = useState(true);

  useEffect(() => {
    notifyStageDisplayReady();
    getWindowViewState()
      .then((result) => {
        if (result?.success) setIsPreviewWindow(!result.data?.isFullScreen);
      })
      .catch(() => {});

    const offUpdate = onStageUpdate(({ currentSlide: current, nextSlide: next }) => {
      setCurrentSlide(current || null);
      setNextSlide(next || null);
    });
    const offViewState = onWindowViewState(({ isFullScreen }) => {
      setIsPreviewWindow(!isFullScreen);
    });

    return () => {
      offUpdate?.();
      offViewState?.();
    };
  }, []);

  const currentText = useMemo(
    () => getStageText(currentSlide, 'Waiting for live slide'),
    [currentSlide]
  );
  const nextText = useMemo(() => getStageText(nextSlide, 'No upcoming slide'), [nextSlide]);

  return (
    <div className="w-screen h-screen bg-projector-bg text-projector-text relative overflow-hidden">
      {isPreviewWindow ? (
        <button
          type="button"
          onClick={() => closeStageDisplayWindow()}
          className="absolute top-[22px] right-[22px] z-10 h-[42px] pt-0 pr-3.5 pb-0 pl-3 rounded-[999px] border border-white/18 bg-[rgba(18,18,18,0.82)] text-white/92 inline-flex items-center gap-2 text-[15px] font-bold cursor-pointer shadow-[0_10px_24px_rgba(0,0,0,0.32)]"
        >
          <X size={16} />
          <span>Close Preview</span>
        </button>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center pt-[5vh] px-[6vw] pb-[28vh] text-center">
        <div
          style={{
            width: !currentSlide?.body ? 'min(72vw, 1120px)' : 'min(90vw, 1820px)',
            textShadow: '0 10px 28px rgba(0,0,0,0.38)',
          }}
        >
          <StageTextBlock
            text={currentText}
            empty={!currentSlide?.body}
            fontSize={
              !currentSlide?.body ? 'clamp(42px, 4.2vw, 72px)' : 'clamp(58px, 6.2vw, 122px)'
            }
            lineHeight={!currentSlide?.body ? 1.12 : 1.08}
          />
        </div>
      </div>

      <div className="absolute left-1/2 bottom-[3vh] -translate-x-1/2 w-[min(92vw,1760px)] min-h-[18vh] pt-[22px] px-8 pb-6 rounded-[20px] bg-white/10 border border-white/16 shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
        <div className="text-[20px] font-bold tracking-[0.08em] uppercase text-white/70 mb-3">
          Next
        </div>
        <StageTextBlock
          text={nextText}
          empty={!nextSlide?.body}
          fontSize="clamp(30px, 2.9vw, 52px)"
          lineHeight={1.16}
          textAlign="left"
        />
      </div>
    </div>
  );
}
