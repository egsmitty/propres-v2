// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import ScaledSlideText from '@/components/shared/ScaledSlideText';

// ED-30 (fable-pass-2-audit.md, Part 3). Right-to-left lyrics (Hebrew,
// Arabic) reorder punctuation/numbers incorrectly without a direction set on
// the text container. `dir="auto"` lets the browser detect direction from the
// slide's own content rather than always assuming left-to-right.

const HEBREW_TEXT = 'שלום עולם 123';

function songSlide(body: string) {
  return { id: 'slide-1', type: 'song', body };
}

beforeEach(() => {
  // jsdom has no ResizeObserver; the sizing effect only needs it to exist —
  // a measurement seam per testing-standards.mdc, stubbed rather than
  // asserted through.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

describe('ScaledSlideText', () => {
  it('sets dir="auto" on the text box container so RTL content reorders correctly', () => {
    render(<ScaledSlideText presentation={{}} slide={songSlide(HEBREW_TEXT)} />);

    const boxes = screen.getAllByTestId('scaled-slide-text-box');
    // Structural floor: at least one box actually rendered the slide's text,
    // so an empty render can't pass this test.
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0]).toHaveTextContent(HEBREW_TEXT);
    expect(boxes[0]).toHaveAttribute('dir', 'auto');
  });

  it('still sets dir="auto" for plain left-to-right content (inert there, per the audit)', () => {
    render(<ScaledSlideText presentation={{}} slide={songSlide('Hello world')} />);

    const box = screen.getByTestId('scaled-slide-text-box');
    expect(box).toHaveTextContent('Hello world');
    expect(box).toHaveAttribute('dir', 'auto');
  });
});
