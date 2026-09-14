import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getEffectiveBackgroundId, getMediaAssetUrl, isVideoMedia } from '@/utils/backgrounds';
import { isMediaSlide } from '@/utils/sectionTypes';
import { getPresentationDimensions, getPresentationScale } from '@/utils/presentationSizing';
import { getSlideTextBoxes } from '@/utils/textBoxes';
import { baseHighlightStyle } from '@/utils/canvasTextStyle';
import { slideBodyToHtml } from '@/utils/slideMarkup';
import { MEDIA_OVERLAY, textBoxContentStyle, textBoxFrameStyle } from '@/utils/slideRenderStyle';

/**
 * Plan ED36 — the one slide renderer.
 *
 * Every preview, the presenter panel and the projector draw a slide through
 * this component. It lays the slide out at the presentation's native size and
 * scales the whole stage with a single CSS transform, so a thumbnail wraps its
 * lines exactly where the wall does. The editor canvas shares the same style
 * module (`slideRenderStyle`) and adds its interaction layer on top.
 *
 * The stage stays hidden until the frame has been measured: rendering at
 * scale 1 for a frame would flash a 1920px-wide slide inside the thumbnail.
 *
 * `data-slide-render`, `data-slide-scale`, `data-slide-stage` and
 * `data-textbox-view` are the seams the fidelity E2E reads — keep them.
 */

/** A text box's body, with the highlight span when the style asks for one. */
export function TextBoxBody({ html, style }) {
  const highlightStyle = baseHighlightStyle(style);
  if (!highlightStyle) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div style={{ width: '100%', textAlign: style?.align || 'center' }}>
      <span style={highlightStyle} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function BackgroundMedia({ media }) {
  const src = getMediaAssetUrl(media);
  if (!src || media?.file_exists === false) return null;

  if (isVideoMedia(media)) {
    return (
      <video
        src={src}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      />
    );
  }

  return (
    <img
      src={src}
      alt={media?.name || 'Background'}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

function hasAsset(media) {
  return Boolean(media && media.file_exists !== false && getMediaAssetUrl(media));
}

function useFrameSize(frameRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // jsdom has no ResizeObserver; an unmeasured frame simply stays hidden.
    if (!frameRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [frameRef]);

  return size;
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * @typedef {object} SlideRenderProps
 * @property {object} presentation the presentation (for its native size and sections)
 * @property {object | null | undefined} slide the slide to draw; nothing renders for `null`
 * @property {string | null} [sectionId] the section the slide is in, for its background
 * @property {Array<object>} [mediaLibrary] the media rows backgrounds resolve against
 * @property {boolean} [placeholder] show a body-less box's placeholder text (default true)
 * @property {((media: object) => React.ReactNode) | null} [renderBackground] draws the
 *   background media in place of the default `<img>`/`<video>` (the projector's
 *   continuous-playback element)
 * @property {string | null} [missingMediaLabel] label for a media slide whose file is
 *   gone; `null` draws nothing (the projector never puts a label on the wall)
 * @property {string} [site] names the place this slide is drawn (`thumbnail`,
 *   `presenter-live`, `presenter-grid`, `home`, `filmstrip-preview`, `output`);
 *   the fidelity E2E selects sites by it
 */

/** @param {SlideRenderProps} props */
export default function SlideRender({
  presentation,
  slide,
  sectionId = null,
  mediaLibrary = [],
  placeholder = true,
  renderBackground = null,
  missingMediaLabel = 'Media slide',
  site = 'slide',
}) {
  const frameRef = useRef(null);
  const size = useFrameSize(frameRef);

  const mediaSlide = isMediaSlide(slide);
  const mediaSlideItem = useMemo(
    () => (mediaSlide ? mediaLibrary.find((item) => item.id === slide?.mediaId) || null : null),
    [mediaLibrary, mediaSlide, slide]
  );
  const backgroundMedia = useMemo(() => {
    if (mediaSlide) return null;
    const id = getEffectiveBackgroundId(presentation, sectionId, slide);
    return mediaLibrary.find((item) => item.id === id) || null;
  }, [mediaLibrary, mediaSlide, presentation, sectionId, slide]);
  const textBoxes = useMemo(() => getSlideTextBoxes(slide), [slide]);

  if (!slide) return null;

  const { width: nativeWidth, height: nativeHeight } = getPresentationDimensions(presentation);
  const measured = size.width > 0 && size.height > 0;
  const scale = measured ? getPresentationScale(presentation, size.width, size.height) : null;
  const left = measured ? round2((size.width - nativeWidth * scale) / 2) : 0;
  const top = measured ? round2((size.height - nativeHeight * scale) / 2) : 0;
  const showBackground = !mediaSlide && hasAsset(backgroundMedia);
  const showMediaSlide = mediaSlide && hasAsset(mediaSlideItem);
  const background = renderBackground || ((media) => <BackgroundMedia media={media} />);

  return (
    <div
      ref={frameRef}
      data-slide-render={site}
      data-slide-scale={scale === null ? '' : String(scale)}
      className="absolute inset-0 overflow-hidden"
    >
      <div
        data-slide-stage="true"
        style={{
          position: 'absolute',
          left,
          top,
          width: nativeWidth,
          height: nativeHeight,
          transform: scale === null ? 'none' : `scale(${scale})`,
          transformOrigin: 'top left',
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        {showMediaSlide ? background(mediaSlideItem) : null}
        {showBackground ? background(backgroundMedia) : null}
        {showBackground ? (
          <div
            data-slide-overlay="true"
            className="absolute inset-0"
            style={{ background: MEDIA_OVERLAY }}
          />
        ) : null}
        {mediaSlide
          ? null
          : textBoxes.map((box) => {
              const showPlaceholder = !box.body && placeholder;
              const empty = !box.body && !placeholder;
              return (
                <div
                  key={box.id}
                  data-testid="textbox-view"
                  data-textbox-view="true"
                  data-text-box-id={box.id}
                  dir="auto"
                  style={textBoxFrameStyle(box)}
                >
                  <div style={textBoxContentStyle(box, { placeholder: showPlaceholder })}>
                    {showPlaceholder ? (
                      <span>{box.placeholderText}</span>
                    ) : empty ? null : (
                      <TextBoxBody html={slideBodyToHtml(box.body)} style={box.textStyle} />
                    )}
                  </div>
                </div>
              );
            })}
      </div>
      {mediaSlide && !showMediaSlide && missingMediaLabel ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-center px-2"
          style={{ color: 'var(--on-dark-10)', fontSize: 10 }}
        >
          {missingMediaLabel}
        </div>
      ) : null}
    </div>
  );
}
