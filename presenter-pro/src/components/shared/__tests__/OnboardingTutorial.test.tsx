// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Plan D2 #3 — characterization: the tutorial's step is the store's step.
// Before the fix a local copy mirrored the store through an effect; the
// observable behaviour (what is shown, what the store holds) must not change.

vi.mock('@/utils/presentationCommands', () => ({
  createPresentationFromTemplate: vi.fn(),
}));

import OnboardingTutorial from '@/components/shared/OnboardingTutorial';
import { useAppStore } from '@/store/appStore';

const INITIAL = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(INITIAL, true);
  useAppStore.setState({ tutorialStepIndex: 0, currentView: 'home' });
});

const stepText = () => screen.getByText(/^Step \d+ of \d+$/).textContent;

describe('OnboardingTutorial', () => {
  it('starts on the store’s step and Next writes the store', () => {
    render(<OnboardingTutorial onComplete={vi.fn()} />);
    expect(stepText()).toBe('Step 1 of 6');
    fireEvent.click(screen.getByText('Next'));
    expect(useAppStore.getState().tutorialStepIndex).toBe(1);
    expect(stepText()).toBe('Step 2 of 6');
  });

  it('an external store write is reflected, and Back writes the store', () => {
    render(<OnboardingTutorial onComplete={vi.fn()} />);
    act(() => useAppStore.getState().setTutorialStepIndex(3));
    expect(stepText()).toBe('Step 4 of 6');
    fireEvent.click(screen.getByText('Back'));
    expect(useAppStore.getState().tutorialStepIndex).toBe(2);
    expect(stepText()).toBe('Step 3 of 6');
  });

  it('Next on the last step completes without advancing the store', () => {
    const onComplete = vi.fn();
    render(<OnboardingTutorial onComplete={onComplete} />);
    act(() => useAppStore.getState().setTutorialStepIndex(5));
    expect(stepText()).toBe('Step 6 of 6');
    fireEvent.click(screen.getByText('Finish'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().tutorialStepIndex).toBe(5);
  });
});
