import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  closeOutputWindow,
  getMedia,
  getWindowViewState,
  notifyOutputReady,
  onOutputBlack,
  onOutputCountdown,
  onOutputLogo,
  onOutputUpdate,
  onWindowViewState,
} from '@/utils/ipc';
import { getMediaAssetUrl, isVideoMedia } from '@/utils/backgrounds';
import { isMediaSlide } from '@/utils/sectionTypes';
import { getPresentationDimensions, getPresentationScale } from '@/utils/presentationSizing';
import ScaledSlideText from '@/components/shared/ScaledSlideText';

function formatRemaining(endAt) {
  if (!endAt) return '00:00';
  const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** The media library, or an empty list when main reports a failure. Module scope on purpose (plan D1 #5). */
async function fetchMedia() {
  const result = await getMedia();
  return result?.success ? result.data : [];
}

function PreviewCloseButton() {
  return (
    <button
      type="button"
      onClick={() => closeOutputWindow()}
      style={{
        position: 'absolute',
        top: 22,
        right: 22,
        zIndex: 10,
        height: 42,
        padding: '0 14px 0 12px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(18,18,18,0.82)',
        color: 'rgba(255,255,255,0.92)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
      }}
    >
      <X size={16} />
      <span>Close Preview</span>
    </button>
  );
}

export default function OutputRenderer() {
  const [slide, setSlide] = useState(null);
  const [background, setBackground] = useState(null);
  const [mediaSlideItem, setMediaSlideItem] = useState(null);
  const [media, setMedia] = useState([]);
  const [isBlack, setIsBlack] = useState(false);
  const [isLogo, setIsLogo] = useState(false);
  const [isPreviewWindow, setIsPreviewWindow] = useState(true);
  const [countdown, setCountdown] = useState({ active: false, endAt: null, durationSeconds: 0 });
  const [remaining, setRemaining] = useState('00:00');
  const mediaRef = useRef([]);
  const backgroundRef = useRef(null);
  const backgroundIdRef = useRef(null);
  const viewportRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  // The display value is set where the countdown state arrives (the event
  // handler below) and on every tick; this effect only owns the interval
  // (plan D2 #15).
  useEffect(() => {
    if (!countdown.active || !countdown.endAt) return undefined;
    const interval = window.setInterval(() => setRemaining(formatRemaining(countdown.endAt)), 250);
    return () => window.clearInterval(interval);
  }, [countdown]);

  useEffect(() => {
    if (!viewportRef.current) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetchMedia().then((library) => {
      setMedia(library);
      mediaRef.current = library;
    });

    notifyOutputReady();
    getWindowViewState()
      .then((result) => {
        if (result?.success) setIsPreviewWindow(!result.data?.isFullScreen);
      })
      .catch(() => {});

    const offUpdate = onOutputUpdate(async ({ slide: s, background: bg }) => {
      setSlide(s);
      setIsBlack(false);
      setIsLogo(false);

      if (isMediaSlide(s)) {
        const library = mediaRef.current.length ? mediaRef.current : await fetchMedia();
        const mediaItem = library.find((item) => item.id === s.mediaId) || null;
        setMediaSlideItem(mediaItem);
        setBackground(null);
        backgroundIdRef.current = null;
        return;
      }

      setMediaSlideItem(null);

      const nextBackgroundId = bg?.id || s?.effectiveBackgroundId || null;
      if (!nextBackgroundId) {
        setBackground(null);
        backgroundIdRef.current = null;
        return;
      }

      if (backgroundIdRef.current === nextBackgroundId && backgroundRef.current) {
        return;
      }

      const library = mediaRef.current.length ? mediaRef.current : await fetchMedia();
      const nextBackground = bg || library.find((item) => item.id === nextBackgroundId) || null;
      setBackground(nextBackground);
      backgroundIdRef.current = nextBackgroundId;
    });

    const offBlack = onOutputBlack(({ active }) => {
      setIsBlack(Boolean(active));
      if (active) setIsLogo(false);
    });

    const offLogo = onOutputLogo(({ active }) => {
      setIsLogo(Boolean(active));
      if (active) setIsBlack(false);
    });
    const offCountdown = onOutputCountdown((state) => {
      const next = state || { active: false, endAt: null, durationSeconds: 0 };
      setCountdown(next);
      setRemaining(next.active && next.endAt ? formatRemaining(next.endAt) : '00:00');
    });
    const offViewState = onWindowViewState(({ isFullScreen }) => {
      setIsPreviewWindow(!isFullScreen);
    });

    return () => {
      offUpdate?.();
      offBlack?.();
      offLogo?.();
      offCountdown?.();
      offViewState?.();
    };
  }, []);

  if (isBlack) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--projector-bg)',
          position: 'relative',
        }}
      >
        {isPreviewWindow ? <PreviewCloseButton /> : null}
      </div>
    );
  }

  if (isLogo) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--projector-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {isPreviewWindow ? <PreviewCloseButton /> : null}
        <div
          style={{
            width: 120,
            height: 120,
            background: 'var(--accent)',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            fontWeight: 700,
            color: 'var(--projector-text)',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          P
        </div>
      </div>
    );
  }

  if (!slide) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--projector-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6vw',
          position: 'relative',
        }}
      >
        {isPreviewWindow ? <PreviewCloseButton /> : null}
        <span
          style={{
            color: 'rgba(255,255,255,0.24)',
            fontSize: 'clamp(30px, 2.8vw, 52px)',
            fontWeight: 500,
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.02em',
            textAlign: 'center',
          }}
        >
          Main Output Display
        </span>
      </div>
    );
  }

  const { width: nativeWidth, height: nativeHeight } = getPresentationDimensions(slide);
  const stageScale = getPresentationScale(slide, viewportSize.width, viewportSize.height);
  const stageWidth = nativeWidth * stageScale;
  const stageHeight = nativeHeight * stageScale;
  const stageLeft = Math.max(0, (viewportSize.width - stageWidth) / 2);
  const stageTop = Math.max(0, (viewportSize.height - stageHeight) / 2);
  return (
    <div
      ref={viewportRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: 'var(--projector-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isPreviewWindow ? <PreviewCloseButton /> : null}

      <div
        style={{
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
          width: stageWidth,
          height: stageHeight,
          overflow: 'hidden',
          background: 'var(--projector-bg)',
        }}
      >
        {mediaSlideItem?.file_path ? (
          <OutputBackground media={mediaSlideItem} />
        ) : background?.file_path ? (
          <OutputBackground media={background} />
        ) : null}
        {!mediaSlideItem?.file_path && background?.file_path && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.22)',
            }}
          />
        )}
        {!mediaSlideItem?.file_path && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <ScaledSlideText
              presentation={slide}
              slide={slide}
              empty=""
              shadow="0 2px 16px rgba(0,0,0,0.9)"
              showPlaceholder={false}
            />
          </div>
        )}
      </div>
      {countdown.active && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            right: 36,
            padding: '14px 18px',
            borderRadius: 18,
            background: 'rgba(9, 14, 26, 0.66)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'var(--projector-text)',
            fontFamily: 'Inter, system-ui, sans-serif',
            textAlign: 'right',
            minWidth: 144,
            boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              opacity: 0.72,
            }}
          >
            Countdown
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, marginTop: 6 }}>
            {remaining}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputBackground({ media }) {
  const src = getMediaAssetUrl(media);
  if (!src || media.file_exists === false) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--projector-bg)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '2vw',
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        Missing media file
      </div>
    );
  }

  if (isVideoMedia(media)) {
    return (
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={media.name}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  );
}
