// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// E3 follow-up (Ethan, 2026-09-09): every other overlay closes on Escape;
// the menu bar only closed on a click outside or on its trigger.

vi.mock('@/utils/ipc', () => ({
  getElectronPlatform: () => 'darwin',
}));

import MenuBar from '@/components/layout/MenuBar';

describe('MenuBar', () => {
  it('closes the open menu on Escape', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByRole('button', { name: /^View$/ }));
    expect(screen.getByRole('button', { name: /^Song Library/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /^Song Library/ })).toBeNull();
  });
});
