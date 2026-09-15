// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/utils/ipc', () => ({
  getMedia: vi.fn(async () => ({ success: true, data: [] })),
  getElectronPlatform: () => 'darwin',
}));

import Canvas from '@/components/editor/Canvas';
import { useEditorStore } from '@/store/editorStore';
import { useAppStore } from '@/store/appStore';
import { PLACEHOLDER_TEXT_COLOR } from '@/utils/colorPalettes';
import { LEGIBILITY_TEXT_SHADOW } from '@/utils/slideRenderStyle';

// Plan ED36, Todo 11 — characterization of how the editor canvas draws a
// text box, pinned BEFORE the canvas read the shared style module (Todo 12).
// Every value here was what the canvas rendered before; Todo 12 changed
// exactly one, named below: the legibility text-shadow became the projector's
// (0.9), so the editor shows what the wall shows.
//
// jsdom has no layout: these are the inline style values the canvas sets, read
// from `element.style` (jsdom's getComputedStyle knows only a few properties,
// so it is not asserted through). If an assertion fails, the bug is elsewhere
// — never loosen the assertion to pass. Fix the root cause or record it as a
// suspected regression.

const EDITOR_INITIAL = useEditorStore.getState();
const APP_INITIAL = useAppStore.getState();

const PRESENTATION = {
  id: 'p1',
  title: 'Pinned',
  aspectRatio: '16:9',
  sections: [
    {
      id: 's1',
      type: 'announcement',
      title: 'Section',
      slides: [
        {
          id: 'a',
          type: 'text',
          textBoxes: [
            {
              id: 'styled',
              body: 'Hello',
              x: 100,
              y: 50,
              width: 800,
              height: 300,
              zIndex: 0,
              textStyle: { size: 120, bold: true, align: 'left' },
            },
            { id: 'empty', body: '', zIndex: 1 },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  useEditorStore.setState(EDITOR_INITIAL, true);
  useAppStore.setState(APP_INITIAL, true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  useEditorStore.getState().setPresentation(PRESENTATION);
  useEditorStore.getState().setSelectedSlide('s1', 'a');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountBoxes() {
  const { container } = render(<Canvas />);
  const roots = await waitFor(() => {
    const found = container.querySelectorAll('[data-textbox-root="true"]');
    expect(found).toHaveLength(2);
    return Array.from(found) as HTMLElement[];
  });
  return roots.map((root) => ({ root, content: root.firstElementChild as HTMLElement }));
}

function pick(style: CSSStyleDeclaration, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = style[key as keyof CSSStyleDeclaration] as string;
  return out;
}

const CONTENT_KEYS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'justifyContent',
  'color',
  'lineHeight',
  'fontFamily',
  'textShadow',
  'boxShadow',
  // `border: none` is read back as borderStyle: jsdom's cssstyle serializes
  // the shorthand itself as "medium".
  'borderStyle',
  'borderRadius',
  'background',
  'overflow',
  'writingMode',
  'whiteSpace',
  'wordBreak',
];

describe('the canvas draws a text box (plan ED36 pin)', () => {
  it('places the frame at its native geometry', async () => {
    const [styled] = await mountBoxes();
    expect(
      pick(styled!.root.style, ['left', 'top', 'width', 'height', 'transform', 'opacity'])
    ).toEqual({
      left: '100px',
      top: '50px',
      width: '800px',
      height: '300px',
      transform: 'none',
      opacity: '1',
    });
  });

  it('styles the content from the stored style, in native px', async () => {
    const [styled] = await mountBoxes();
    expect(pick(styled!.content.style, CONTENT_KEYS)).toEqual({
      paddingTop: '22px',
      paddingRight: '28px',
      paddingBottom: '22px',
      paddingLeft: '28px',
      fontSize: '120px',
      fontWeight: '700',
      fontStyle: 'normal',
      textAlign: 'left',
      justifyContent: 'center',
      color: 'rgb(255, 255, 255)',
      lineHeight: '1',
      fontFamily: 'Arial, sans-serif',
      // The one deliberate change of plan ED36 slice 3: the canvas now draws
      // the projector's legibility shadow (was 0.5) — the editor shows the wall.
      textShadow: LEGIBILITY_TEXT_SHADOW,
      boxShadow: 'none',
      borderStyle: 'none',
      borderRadius: '14px',
      background: 'transparent',
      overflow: 'hidden',
      writingMode: 'horizontal-tb',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    });
    expect(styled!.content).toHaveTextContent('Hello');
  });

  it('shows a body-less box as an italic grey placeholder', async () => {
    const [, empty] = await mountBoxes();
    expect(pick(empty!.content.style, ['color', 'fontStyle'])).toEqual({
      color: 'rgb(136, 136, 136)',
      fontStyle: 'italic',
    });
    expect(PLACEHOLDER_TEXT_COLOR).toBe('#888888');
    expect(empty!.content).toHaveTextContent('Double-click to edit');
  });
});
