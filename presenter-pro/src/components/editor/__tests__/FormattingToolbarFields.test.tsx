// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { LineSpacingBtn, NumberField } from '@/components/editor/FormattingToolbar';

// Plan D2 #1/#2 — characterization of the two toolbar fields that keep a
// local draft of a controlled value, BEFORE their sync effects are replaced
// by derivation. Same behaviour must hold after.

function numberField(over: Partial<React.ComponentProps<typeof NumberField>> = {}) {
  const onCommit = vi.fn();
  const utils = render(<NumberField value={48} onCommit={onCommit} min={8} max={200} {...over} />);
  const input = utils.container.querySelector('input') as HTMLInputElement;
  return { ...utils, input, onCommit };
}

describe('NumberField', () => {
  it('shows the controlled value, and follows a parent change while unfocused', () => {
    const { input, rerender, onCommit } = numberField();
    expect(input.value).toBe('48');
    rerender(<NumberField value={72} onCommit={onCommit} min={8} max={200} />);
    expect(input.value).toBe('72');
  });

  it('while focused, typing shows the draft and an in-range number commits at once', () => {
    const { input, onCommit } = numberField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '64' } });
    expect(input.value).toBe('64');
    expect(onCommit).toHaveBeenCalledWith(64);
  });

  it('while focused, a parent value change does not clobber the draft', () => {
    const { input, rerender, onCommit } = numberField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6' } }); // below min: shown, not committed
    expect(onCommit).not.toHaveBeenCalled();
    rerender(<NumberField value={99} onCommit={onCommit} min={8} max={200} />);
    expect(input.value).toBe('6');
  });

  it('blur clamps an out-of-range number through onCommit', () => {
    const { input, onCommit } = numberField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(200);
  });

  it('blur on an emptied field commits the minimum (current behaviour: Number("") is 0 — recorded as a suspected UX bug, not changed here)', () => {
    const { input, onCommit } = numberField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(8);
  });
});

describe('LineSpacingBtn', () => {
  it('closed: shows the value; open: the custom input is seeded with it', () => {
    const onChange = vi.fn();
    render(<LineSpacingBtn value={1.2} onChange={onChange} />);
    const trigger = screen.getByTitle('Line Spacing');
    expect(trigger.textContent).toContain('1.2');
    fireEvent.click(trigger);
    const custom = document.querySelector('input') as HTMLInputElement;
    expect(custom.value).toBe('1.2');
  });

  it('a value change while closed is what the next open shows', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LineSpacingBtn value={1.2} onChange={onChange} />);
    const trigger = screen.getByTitle('Line Spacing');
    fireEvent.click(trigger); // open
    fireEvent.click(trigger); // close
    rerender(<LineSpacingBtn value={1.8} onChange={onChange} />);
    fireEvent.click(trigger); // open again
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('1.8');
  });
});
