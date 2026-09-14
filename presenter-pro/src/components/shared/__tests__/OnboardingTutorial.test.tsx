// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Plan D2 #3 — characterization: the tutorial's step is the store's step.
// Before the fix a local copy mirrored the store through an effect; the
// observable behaviour (what is shown, what the store holds) must not change.

// Scaffolding for HOME-13/HOME-15b (plan H2): the source now also imports
// openPresentationInEditor (HOME-13 reuse path) and getPresentations /
// touchPresentation (HOME-13 lookup, HOME-15b's Home-bound Back path). None
// of the 3 pre-existing tests below reaches either new path, so their
// behavior is unchanged by adding these keys.
vi.mock('@/utils/presentationCommands', () => ({
  createPresentationFromTemplate: vi.fn(),
  openPresentationInEditor: vi.fn(),
}));

vi.mock('@/utils/ipc', () => ({
  getPresentations: vi.fn(),
  touchPresentation: vi.fn(),
}));

import OnboardingTutorial from '@/components/shared/OnboardingTutorial';
import { useAppStore } from '@/store/appStore';
import {
  createPresentationFromTemplate,
  openPresentationInEditor,
} from '@/utils/presentationCommands';
import { getPresentations } from '@/utils/ipc';

const INITIAL = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(INITIAL, true);
  useAppStore.setState({ tutorialStepIndex: 0, currentView: 'home', homeTab: 'home' });
  vi.mocked(createPresentationFromTemplate).mockReset();
  vi.mocked(openPresentationInEditor).mockReset();
  vi.mocked(getPresentations).mockReset().mockResolvedValue({ success: true, data: [] });
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

  // HOME-15a (plan H2): a missing tour target must not dim the whole
  // screen. Every real page in this app is elsewhere; this component is
  // rendered standalone here, so `document.querySelector(step.selector)`
  // never matches and targetRect is always null — the same "no target"
  // condition all 3 tests above already render under, just asserted on
  // directly here.
  it('shows no full-screen dim when the step target is missing', () => {
    render(<OnboardingTutorial onComplete={vi.fn()} />);
    expect(screen.queryByTestId('tutorial-full-dim')).not.toBeInTheDocument();
  });

  // HOME-15b (plan H2): Back from the toolbar step (editor-only target)
  // lands on the templates step (Home-only target), so it must return to
  // Home the same way every other Home-bound navigation does.
  it('Back from the toolbar step returns to Home', async () => {
    useAppStore.setState({ tutorialStepIndex: 2, currentView: 'editor' });
    render(<OnboardingTutorial onComplete={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    expect(useAppStore.getState().currentView).toBe('home');
  });

  // HOME-13 (plan H2): re-running the tour must not create a second
  // "Sunday Morning Example" when one already exists.
  it('reuses an existing Sunday Morning Example instead of creating another one', async () => {
    vi.mocked(getPresentations).mockResolvedValue({
      success: true,
      data: [{ id: 'existing-1', title: 'Sunday Morning Example' }],
    });
    useAppStore.setState({ tutorialStepIndex: 1, currentView: 'home' });
    render(<OnboardingTutorial onComplete={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Open Featured Example'));
    });
    expect(openPresentationInEditor).toHaveBeenCalledWith('existing-1');
    expect(createPresentationFromTemplate).not.toHaveBeenCalled();
  });
});
