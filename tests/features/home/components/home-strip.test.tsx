import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeStrip } from '@features/home/components/home-strip';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { notif } from '@tests/support/notifications';

describe('HomeStrip', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('shows While you were away with nothing in the queue', () => {
    render(<HomeStrip />);
    expect(screen.getByRole('heading', { name: /while you were away/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /needs you/i })).toBeNull();
  });

  it('swaps to Needs you when the queue fills, and back when it empties', () => {
    const { rerender } = render(<HomeStrip />);
    useHiveStore.setState({
      notifs: [
        notif({ kind: 'agent.ask', subject: 'builder', title: 'asks', action: { type: 'ask', thread: 't1' } }),
      ],
    });
    rerender(<HomeStrip />);
    expect(screen.getByRole('heading', { name: /needs you/i })).toBeInTheDocument();
    useHiveStore.setState({ notifs: [] });
    rerender(<HomeStrip />);
    expect(screen.getByRole('heading', { name: /while you were away/i })).toBeInTheDocument();
  });
});
