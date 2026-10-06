import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NeedsYou } from '@features/home/components/needs-you';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { notif } from '@tests/support/notifications';

const NOW = 1_700_000_000_000 + 60 * 60_000;

describe('NeedsYou', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const ask = (id: string, minutesAgo: number, subject = id) =>
    notif({
      id,
      kind: 'agent.ask',
      subject,
      title: `asks ${id}`,
      body: '',
      createdAt: NOW - minutesAgo * 60_000,
      action: { type: 'ask', thread: id },
    });

  it('heads with the queue count and lists the oldest wait first', () => {
    useHiveStore.setState({ notifs: [ask('builder', 2), ask('slack', 31), ask('shipper', 14)] });
    render(<NeedsYou />);
    expect(screen.getByRole('heading', { name: /needs you/i })).toHaveTextContent('3');
    expect(screen.getByText('3').className).toContain('text-amber-text');
    expect(screen.getByText('31m').className).toContain('text-amber-text');
    const rows = screen.getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('31m'),
      expect.stringContaining('14m'),
      expect.stringContaining('2m'),
    ]);
  });

  it('caps at five rows with a more line that opens the drawer at the top', () => {
    useHiveStore.setState({ notifs: [1, 2, 3, 4, 5, 6, 7].map((n) => ask(`a${n}`, n)) });
    render(<NeedsYou />);
    const more = screen.getByRole('button', { name: '2 more in the Inbox ›' });
    expect(screen.getAllByRole('button')).toHaveLength(6);
    fireEvent.click(more);
    expect(useUiStore.getState().inboxDrawer).toEqual({ open: true, thread: null });
  });

  it('an ask row opens the drawer on its thread', () => {
    useHiveStore.setState({ notifs: [ask('builder', 2)] });
    render(<NeedsYou />);
    fireEvent.click(screen.getByRole('button'));
    expect(useUiStore.getState().inboxDrawer).toEqual({ open: true, thread: 'builder' });
  });

  it('a session row opens the drawer at the top', () => {
    useHiveStore.setState({ notifs: [notif({ id: 's', createdAt: NOW - 60_000 })] });
    render(<NeedsYou />);
    fireEvent.click(screen.getByRole('button'));
    expect(useUiStore.getState().inboxDrawer).toEqual({ open: true, thread: null });
  });

  it('no row opens the asker', () => {
    const openEntity = vi.fn(() => true);
    useHiveStore.setState({
      notifs: [ask('builder', 2), notif({ id: 's', createdAt: NOW - 60_000 })],
      openEntity,
    });
    render(<NeedsYou />);
    for (const row of screen.getAllByRole('button')) fireEvent.click(row);
    expect(openEntity).not.toHaveBeenCalled();
  });

  it('a row with no asker names the title and still opens the drawer', () => {
    useHiveStore.setState({
      notifs: [
        notif({
          id: 'x',
          kind: 'agent.ask',
          title: 'Someone asks',
          body: 'first line\nsecond',
          createdAt: NOW - 60_000,
          action: { type: 'ask', thread: 'x' },
        }),
      ],
    });
    render(<NeedsYou />);
    expect(screen.getByText('Someone asks')).toBeInTheDocument();
    expect(screen.getByText('first line')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(useUiStore.getState().inboxDrawer).toEqual({ open: true, thread: 'x' });
  });
});
