// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import SlideRender from '@/components/shared/SlideRender';
import { MEDIA_OVERLAY } from '@/utils/slideRenderStyle';

// Plan ED36. One renderer for every place a slide is drawn. It lays the slide
// out at native size and scales the whole stage with ONE transform; these
// tests pin that structure and the props each site relies on.
//
// jsdom has no layout and no ResizeObserver. The observer is a measurement
// seam: the stub below records what was observed and lets a test "measure"
// the frame by firing a size. Nothing here is asserted through jsdom layout.
// If an assertion fails, the bug is elsewhere — never loosen the assertion to
// pass.

const HEBREW_TEXT = 'שלום עולם 123';

type Fire = (size: { width: number; height: number }) => void;
let fire: Fire;
let observed: Element[];

beforeEach(() => {
  observed = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        fire = (size) =>
          this.callback(
            [{ contentRect: size } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function textSlide(body: string, extra: Record<string, unknown> = {}) {
  return { id: 'slide-1', type: 'song', body, ...extra };
}

function measure(size: { width: number; height: number }) {
  act(() => fire(size));
}

function stage(): HTMLElement {
  const element = document.querySelector('[data-slide-stage]');
  if (!element) throw new Error('no stage rendered');
  return element as HTMLElement;
}

function frame(): HTMLElement {
  const element = document.querySelector('[data-slide-render]');
  if (!element) throw new Error('no frame rendered');
  return element as HTMLElement;
}

describe('SlideRender', () => {
  it('1. hides the stage until measured, then scales the native stage with one transform', () => {
    render(<SlideRender presentation={{}} slide={textSlide('Hello')} site="thumbnail" />);
    expect(observed).toEqual([frame()]);
    expect(frame().getAttribute('data-slide-render')).toBe('thumbnail');
    expect(frame().getAttribute('data-slide-scale')).toBe('');
    expect(stage().style.visibility).toBe('hidden');

    measure({ width: 480, height: 270 });

    expect(frame().getAttribute('data-slide-scale')).toBe('0.25');
    expect(stage().style.visibility).toBe('visible');
    expect(stage().style.transform).toBe('scale(0.25)');
    expect(stage().style.width).toBe('1920px');
    expect(stage().style.height).toBe('1080px');
  });

  it('2. a 4:3 presentation letterboxes: the stage is centred in the frame', () => {
    render(<SlideRender presentation={{ aspectRatio: '4:3' }} slide={textSlide('Hello')} />);

    measure({ width: 400, height: 300 });
    expect(stage().style.width).toBe('1440px');
    expect(stage().style.height).toBe('1080px');
    expect(stage().style.transform).toBe(`scale(${300 / 1080})`);
    expect(stage().style.left).toBe('0px');
    expect(stage().style.top).toBe('0px');

    measure({ width: 600, height: 300 });
    expect(stage().style.left).toBe('100px');
    expect(stage().style.top).toBe('0px');
  });

  it('3. renders every text box in z order with dir="auto" (RTL content reorders correctly)', () => {
    render(
      <SlideRender
        presentation={{}}
        slide={{
          id: 'slide-1',
          type: 'song',
          textBoxes: [
            { id: 'top', body: 'Hello world', zIndex: 1 },
            { id: 'bottom', body: HEBREW_TEXT, zIndex: 0 },
          ],
        }}
      />
    );

    const boxes = screen.getAllByTestId('textbox-view');
    // Order is z order, count is exact: the whole array is asserted.
    expect(boxes.map((box) => box.getAttribute('data-text-box-id'))).toEqual(['bottom', 'top']);
    expect(boxes[0]).toHaveTextContent(HEBREW_TEXT);
    expect(boxes[0]).toHaveAttribute('dir', 'auto');
    expect(boxes[1]).toHaveTextContent('Hello world');
    expect(boxes[1]).toHaveAttribute('dir', 'auto');
  });

  it('4. a media slide whose item is missing renders no text box and the missing-media label', () => {
    render(
      <SlideRender
        presentation={{}}
        slide={{ id: 'slide-1', type: 'media', mediaId: 9 }}
        mediaLibrary={[]}
        missingMediaLabel="Sermon clip"
      />
    );

    expect(screen.queryAllByTestId('textbox-view')).toEqual([]);
    expect(screen.getByText('Sermon clip')).toBeInTheDocument();
  });

  it('8. missingMediaLabel={null} draws nothing for a missing media slide (the projector)', () => {
    const { container } = render(
      <SlideRender
        presentation={{}}
        slide={{ id: 'slide-1', type: 'media', mediaId: 9 }}
        mediaLibrary={[]}
        missingMediaLabel={null}
      />
    );
    expect(container.textContent).toBe('');
    expect(screen.queryAllByTestId('textbox-view')).toEqual([]);
  });

  it('9. a highlighted style wraps the body in a highlight span', () => {
    render(
      <SlideRender
        presentation={{}}
        slide={{
          id: 'slide-1',
          type: 'song',
          textBoxes: [{ id: 'a', body: 'Marked', textStyle: { highlightColor: '#ffff00' } }],
        }}
      />
    );
    const span = screen.getByText('Marked');
    expect(span.tagName).toBe('SPAN');
    expect(span).toHaveStyle({ backgroundColor: '#ffff00' });
  });

  it('11. backgroundMedia, when given, wins over the library lookup (the projector resolves its own)', () => {
    render(
      <SlideRender
        presentation={{}}
        slide={textSlide('Hello', { backgroundId: 7 })}
        mediaLibrary={[{ id: 7, type: 'image', file_path: '/library.jpg', name: 'Library' }]}
        backgroundMedia={{ id: 42, type: 'image', file_path: '/resolved.jpg', name: 'Resolved' }}
      />
    );
    measure({ width: 480, height: 270 });
    expect(screen.getByRole('img', { name: 'Resolved' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Library' })).toBeNull();
  });

  it('12. mediaSlideItem, when given, wins over the library lookup', () => {
    render(
      <SlideRender
        presentation={{}}
        slide={{ id: 'slide-2', type: 'media', mediaId: 9 }}
        mediaLibrary={[{ id: 9, type: 'image', file_path: '/library.jpg', name: 'Library' }]}
        mediaSlideItem={{ id: 9, type: 'image', file_path: '/resolved.jpg', name: 'Resolved' }}
      />
    );
    measure({ width: 480, height: 270 });
    expect(screen.getByRole('img', { name: 'Resolved' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Library' })).toBeNull();
  });

  it('13. a custom renderBackground also receives an item whose file is missing; the default draws nothing', () => {
    const missing = {
      id: 7,
      type: 'image',
      file_path: '/gone.jpg',
      file_exists: false,
      name: 'Gone',
    };
    const renderBackground = vi.fn((media: object) => (
      <div data-testid="custom-background">{(media as { name: string }).name}</div>
    ));
    const { unmount } = render(
      <SlideRender
        presentation={{}}
        slide={textSlide('Hello')}
        backgroundMedia={missing}
        renderBackground={renderBackground}
      />
    );
    measure({ width: 480, height: 270 });
    // The projector draws its own "Missing media file" notice; it must still be asked.
    expect(screen.getByTestId('custom-background')).toHaveTextContent('Gone');
    // No overlay over a background that is not there.
    expect(document.querySelector('[data-slide-overlay]')).toBeNull();
    unmount();

    render(<SlideRender presentation={{}} slide={textSlide('Hello')} backgroundMedia={missing} />);
    measure({ width: 480, height: 270 });
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('10. without a ResizeObserver the frame renders hidden instead of throwing', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<SlideRender presentation={{}} slide={textSlide('Hello')} />);
    expect(stage().style.visibility).toBe('hidden');
    expect(frame().getAttribute('data-slide-scale')).toBe('');
  });

  it('5. a text slide with a background renders the media and the fixed overlay; a media slide has no overlay', () => {
    const mediaLibrary = [
      { id: 7, type: 'image', file_path: '/bg.jpg', name: 'Sky' },
      { id: 9, type: 'video', file_path: '/clip.mp4', name: 'Clip' },
    ];
    const { unmount } = render(
      <SlideRender
        presentation={{ sections: [{ id: 's1', backgroundId: 7 }] }}
        sectionId="s1"
        slide={textSlide('Hello')}
        mediaLibrary={mediaLibrary}
      />
    );
    // The stage is hidden until measured, and hidden elements have no
    // accessible role — so measure first, as a real frame would.
    measure({ width: 480, height: 270 });
    expect(screen.getByRole('img', { name: 'Sky' })).toBeInTheDocument();
    const overlay = document.querySelector('[data-slide-overlay]') as HTMLElement;
    // jsdom serializes colours with spaces; toHaveStyle normalizes both sides.
    expect(overlay).toHaveStyle({ background: MEDIA_OVERLAY });
    unmount();

    render(
      <SlideRender
        presentation={{}}
        slide={{ id: 'slide-2', type: 'media', mediaId: 9 }}
        mediaLibrary={mediaLibrary}
      />
    );
    expect(document.querySelector('video')).not.toBeNull();
    expect(document.querySelector('[data-slide-overlay]')).toBeNull();
    expect(screen.queryAllByTestId('textbox-view')).toEqual([]);
  });

  it('6. a body-less box shows its own placeholder in italics by default, and nothing with placeholder={false}', () => {
    const { unmount } = render(<SlideRender presentation={{}} slide={textSlide('')} />);
    const box = screen.getByTestId('textbox-view');
    expect(box).toHaveTextContent('Double-click to edit');
    expect(box.firstElementChild).toHaveStyle({ fontStyle: 'italic' });
    unmount();

    render(<SlideRender presentation={{}} slide={textSlide('')} placeholder={false} />);
    expect(screen.getByTestId('textbox-view')).toHaveTextContent('');
  });

  it('7. renderBackground receives the resolved media and its element is used instead of the default', () => {
    const renderBackground = vi.fn((media: object) => (
      <div data-testid="custom-background">{(media as { name: string }).name}</div>
    ));
    render(
      <SlideRender
        presentation={{}}
        slide={textSlide('Hello', { backgroundId: 7 })}
        mediaLibrary={[{ id: 7, type: 'image', file_path: '/bg.jpg', name: 'Sky' }]}
        renderBackground={renderBackground}
      />
    );

    measure({ width: 480, height: 270 });
    // React renders more than once (before and after measuring), so the call
    // count is a render count. What matters: every call got the resolved media.
    expect(renderBackground.mock.calls.length).toBeGreaterThan(0);
    for (const call of renderBackground.mock.calls) {
      expect(call[0]).toMatchObject({ id: 7, name: 'Sky' });
    }
    expect(screen.getByTestId('custom-background')).toHaveTextContent('Sky');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
