// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import SlideTextEditor from '@/components/editor/SlideTextEditor';

// ED-30 (fable-pass-2-audit.md, Part 3). The contentEditable slide text
// editor needs `dir="auto"` too, so typing RTL lyrics (Hebrew, Arabic) keeps
// correct punctuation/number order while editing, not just once rendered.

describe('SlideTextEditor', () => {
  it('sets dir="auto" on the contentEditable element', () => {
    const { container } = render(
      <SlideTextEditor
        textBox={{ id: 'box-1', body: 'שלום עולם' }}
        onSave={() => {}}
        onBlurCommit={() => {}}
        onEscape={() => {}}
        onTabNext={() => {}}
        registerCommitHandler={() => {}}
      />
    );

    const editor = container.querySelector('[data-slide-text-editor="true"]');
    expect(editor).not.toBeNull();
    expect(editor).toHaveAttribute('dir', 'auto');
  });
});
