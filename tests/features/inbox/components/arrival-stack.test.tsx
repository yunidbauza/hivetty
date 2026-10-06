import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { announcement, ARRIVAL_FOLD_MS, ArrivalStack } from '@features/inbox/components/arrival-stack';
import { LEAVE_MS } from '@features/inbox/hooks/use-leaving-asks';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

import { seedLedger } from '@tests/support/ledger';
import { notif, resetNotifIds } from '@tests/support/notifications';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@hooks/use-reduced-motion', () => ({ useReducedMotion: () => motion.reduced }));

const askEntry = (id: string) => ({
  id,
  ts: Date.now(),
  from: 'builder',
  to: 'overmind',
  kind: 'ask' as const,
  body: 'Run the ledger tests?',
  meta: { options: ['yes', 'no'] },
});

const askRow = (id: string) =>
  notif({ id, kind: 'agent.ask', title: 'Run the ledger tests?', action: { type: 'ask', thread: id } });

const blocked = () => notif({ id: 's1', kind: 'session.blocked', action: { type: 'session', entityId: 'nova' } });

beforeEach(() => {
  motion.reduced = false;
  resetNotifIds();
  useUiStore.getState().reset();
  seedLedger(['a1', 'a2', 'a3'].map(askEntry));
  useHiveStore.getState().hydrateNotifs(['a1', 'a2', 'a3'].map(askRow));
});

describe('ArrivalStack (HIVE-198)', () => {
  it('the card appears in place under reduced motion: no rise', () => {
    motion.reduced = true;
    useUiStore.getState().pushArrival('a1', false);
    const { container } = render(<ArrivalStack onStage={null} />);
    expect(screen.getByRole('article')).toBeTruthy();
    expect(container.querySelector('.motion-safe\\:animate-ccslidein')).toBeNull();
  });

  it('the card rises with motion on', () => {
    useUiStore.getState().pushArrival('a1', false);
    const { container } = render(<ArrivalStack onStage={null} />);
    expect(container.querySelector('.motion-safe\\:animate-ccslidein')).not.toBeNull();
  });

  it('draws nothing with nothing up', () => {
    render(<ArrivalStack onStage={null} />);
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('one arrival: the card, no slivers, no burst line', () => {
    useUiStore.getState().pushArrival('a1', false);
    const { container } = render(<ArrivalStack onStage={null} />);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(container.querySelectorAll('[data-sliver]')).toHaveLength(0);
    expect(screen.queryByText(/arrived just now/)).toBeNull();
  });

  it('a burst: the newest card, two slivers at most, the line above', () => {
    for (const id of ['a1', 'a2', 'a3']) useUiStore.getState().pushArrival(id, false);
    const { container } = render(<ArrivalStack onStage={null} />);
    expect(screen.getByRole('article').getAttribute('data-notification')).toBe('a3');
    expect(container.querySelectorAll('[data-sliver]')).toHaveLength(2);
    expect(screen.getByText('3 arrived just now · newest first')).toBeInTheDocument();
  });

  it('two up: one sliver', () => {
    for (const id of ['a1', 'a2']) useUiStore.getState().pushArrival(id, false);
    const { container } = render(<ArrivalStack onStage={null} />);
    expect(container.querySelectorAll('[data-sliver]')).toHaveLength(1);
  });

  it('a newer ask arriving mid-reply gets a fresh card, not the typed draft of the one before', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Other…' }));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'for a1 only' } });
    act(() => useUiStore.getState().pushArrival('a2', false));
    expect(screen.getByRole('article').getAttribute('data-notification')).toBe('a2');
    expect(screen.queryByLabelText('Your answer')).toBeNull();
  });

  it('a session off stage: a note instead of a card', () => {
    useHiveStore.getState().hydrateNotifs([blocked()]);
    useUiStore.getState().pushArrival('s1', false);
    render(<ArrivalStack onStage={null} />);
    expect(screen.getByRole('button', { name: 'Open the session' })).toBeInTheDocument();
  });

  it('a review request: the plain notification card', () => {
    useHiveStore.getState().hydrateNotifs([
      notif({ id: 'r1', kind: 'pr.review_requested', title: 'Review #12', action: { type: 'none' } }),
    ]);
    useUiStore.getState().pushArrival('r1', false);
    render(<ArrivalStack onStage={null} />);
    expect(screen.getByText('Review #12')).toBeInTheDocument();
  });

  it('never the session on stage, nor an arrival that has left the queue', () => {
    useHiveStore.getState().hydrateNotifs([blocked()]);
    useUiStore.getState().pushArrival('s1', false);
    useUiStore.getState().pushArrival('gone', false);
    render(<ArrivalStack onStage="nova" />);
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('holds while Settings is open, and rises when it closes', () => {
    useUiStore.getState().pushArrival('a1', false);
    useUiStore.getState().openSettings();
    render(<ArrivalStack onStage={null} />);
    expect(screen.queryByRole('article')).toBeNull();
    act(() => useUiStore.getState().closeSettings());
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('announcement reads as the ticket words it', () => {
    expect(announcement(notif({ kind: 'agent.permission', title: 'Run the ledger tests?' }), 'builder')).toBe(
      'builder wants to run a command: Run the ledger tests?',
    );
    expect(announcement(notif({ kind: 'agent.ask', title: 'Which repo?' }), 'pr-patrol')).toBe(
      'pr-patrol asks: Which repo?',
    );
    expect(announcement(notif({ kind: 'session.blocked', title: 'asked a question' }), 'inbox-redesign')).toBe(
      'inbox-redesign asked a question',
    );
    expect(announcement(notif({ kind: 'session.idle', title: 'is yours again' }), 'inbox-redesign')).toBe(
      'inbox-redesign is yours again',
    );
  });
});

describe('the fold (fake timers, HIVE-198)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('folds into the pill after 5 seconds untouched', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    act(() => vi.advanceTimersByTime(ARRIVAL_FOLD_MS - 1));
    expect(useUiStore.getState().arrivals).toEqual(['a1']);
    act(() => vi.advanceTimersByTime(1));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('a new arrival restarts the 5 seconds', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    act(() => vi.advanceTimersByTime(4000));
    act(() => useUiStore.getState().pushArrival('a2', false));
    act(() => vi.advanceTimersByTime(4000));
    expect(useUiStore.getState().arrivals).toEqual(['a2', 'a1']);
    act(() => vi.advanceTimersByTime(1000));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('hovering holds it up; leaving starts a fresh 5 seconds', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    fireEvent.pointerEnter(screen.getByTestId('arrival-stack'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(useUiStore.getState().arrivals).toEqual(['a1']);
    fireEvent.pointerLeave(screen.getByTestId('arrival-stack'));
    act(() => vi.advanceTimersByTime(ARRIVAL_FOLD_MS));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('focus inside holds it up, and leaving the stack releases it', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    act(() => screen.getByRole('button', { name: 'yes' }).focus());
    act(() => vi.advanceTimersByTime(10_000));
    expect(useUiStore.getState().arrivals).toEqual(['a1']);
    act(() => screen.getByRole('button', { name: 'yes' }).blur());
    act(() => vi.advanceTimersByTime(ARRIVAL_FOLD_MS));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('✕ folds at once', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fold into the pill' }));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('a hold dies with the stack it was on: ✕ under the pointer, then the next arrival still folds', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    fireEvent.pointerEnter(screen.getByTestId('arrival-stack'));
    fireEvent.click(screen.getByRole('button', { name: 'Fold into the pill' }));
    act(() => useUiStore.getState().pushArrival('a2', false));
    act(() => vi.advanceTimersByTime(ARRIVAL_FOLD_MS));
    expect(useUiStore.getState().arrivals).toEqual([]);
  });

  it('does not fold while held back by Settings', () => {
    useUiStore.getState().pushArrival('a1', false);
    useUiStore.getState().openSettings();
    render(<ArrivalStack onStage={null} />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(useUiStore.getState().arrivals).toEqual(['a1']);
  });
});

it('an arrival never moves focus', () => {
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  render(<ArrivalStack onStage={null} />);
  act(() => useUiStore.getState().pushArrival('a1', false));
  expect(screen.getByRole('article')).toBeInTheDocument();
  expect(document.activeElement).toBe(input);
  input.remove();
});

describe('an arrival leaves with its reason (HIVE-218)', () => {
  afterEach(() => vi.useRealTimers());

  it('lets the arrival leave with "answered on mac-mini" when another device answers', () => {
    vi.useFakeTimers();
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    act(() =>
      useHiveStore.getState().hydrateLedger([
        { id: 'x1', ts: Date.now(), from: 'overmind', to: 'builder', kind: 'answer', body: 'yes', thread: 'a1', meta: { answeredOn: 'mac-mini' } },
      ]),
    );
    expect(screen.getByText('mac-mini')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(screen.queryByTestId('arrival-stack')).toBeNull();
  });

  it('draws nothing when a fold takes the arrival down', () => {
    useUiStore.getState().pushArrival('a1', false);
    render(<ArrivalStack onStage={null} />);
    act(() => useUiStore.getState().foldArrivals());
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    // No empty card box for the beat it is held.
    expect(screen.queryByTestId('arrival-stack')).toBeNull();
  });
});
