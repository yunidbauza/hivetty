import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { endedReason, type Session } from '@/types/entity';

import { SessionEndedCover } from '@features/sessions/components/session-ended-cover';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

describe('SessionEndedCover (HIVE-211)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T10:02:00'));
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().openTab('hero-refresh', 'sessions');
  });
  afterEach(() => vi.useRealTimers());

  const ended = (over: Partial<Session> = {}): Session => ({
    ...(useHiveStore.getState().entities['hero-refresh'] as Session),
    status: 'terminated',
    endedAt: new Date('2026-10-03T10:00:00').getTime(),
    resumable: false,
    ...over,
  });

  it('says why and when, and offers only the Overmind when not resumable', () => {
    render(<SessionEndedCover session={ended()} />);
    expect(screen.getByRole('heading', { name: 'This session ended' })).toBeInTheDocument();
    expect(screen.getByText(endedReason(ended()))).toBeInTheDocument();
    expect(screen.getByText('It ended 2m ago.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.queryByText(/transcript is on disk/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Overmind/ }));
    expect(useUiStore.getState().activeTab).toBe('orch');
  });

  it('offers Resume only when resumable', () => {
    const resume = vi.fn();
    useHiveStore.setState({ resumeSession: resume });
    render(<SessionEndedCover session={ended({ resumable: true })} />);
    expect(screen.getByText('Its transcript is on disk, so it can carry on where it stopped.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(resume).toHaveBeenCalledWith('hero-refresh');
  });

  it('says no time without one', () => {
    render(<SessionEndedCover session={ended({ endedAt: undefined })} />);
    expect(screen.queryByText(/It ended/)).toBeNull();
  });

  it('closes to a strip that keeps Resume and the Overmind (D2)', () => {
    render(<SessionEndedCover session={ended({ resumable: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'This session ended' })).toBeNull();
    expect(screen.getByTestId('session-ended-strip')).toHaveTextContent(endedReason(ended()));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Overmind/ })).toBeInTheDocument();
  });
});
