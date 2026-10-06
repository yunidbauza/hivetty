import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReconnectLine } from '@components/layout/reconnect-line';
import type { RemoteLinkStatus } from '@shared/ipc-contract';
import { useHiveStore } from '@stores/hive-store';

describe('ReconnectLine (HIVE-211)', () => {
  const link = (over: Partial<RemoteLinkStatus>): RemoteLinkStatus => ({
    state: 'reconnecting',
    serverName: 'mac-mini',
    attempt: 2,
    nextAttemptAt: 4_000,
    reason: null,
    epoch: 1,
    lost: 0,
    ...over,
  });
  const bridge = window.hive;

  beforeEach(() => {
    useHiveStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.hive = bridge;
  });

  it('draws nothing local or attached', () => {
    const { container, rerender } = render(<ReconnectLine />);
    expect(container).toBeEmptyDOMElement();
    act(() => useHiveStore.getState().setRemoteLink(link({ state: 'attached', nextAttemptAt: null })));
    rerender(<ReconnectLine />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reconnecting: amber, names the server, counts down, Try now dials', () => {
    const dialNow = vi.fn().mockResolvedValue(undefined);
    window.hive = { remote: { dialNow } } as unknown as typeof window.hive;
    act(() => useHiveStore.getState().setRemoteLink(link({})));
    render(<ReconnectLine />);
    const line = screen.getByRole('status');
    expect(line).toHaveClass('text-amber-text');
    expect(line).toHaveTextContent(
      'Lost Hive TTY on mac-mini. Reconnecting in 4s. The sessions keep running there.',
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(line).toHaveTextContent('Reconnecting in 3s');

    fireEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(dialNow).toHaveBeenCalledTimes(1);
    // D1: keystrokes while down are counted, never queued, so nothing promises otherwise.
    expect(line).not.toHaveTextContent(/you can type|nothing here is lost/);
  });

  it('reconnecting with no try scheduled says so without a countdown', () => {
    act(() => useHiveStore.getState().setRemoteLink(link({ nextAttemptAt: null })));
    render(<ReconnectLine />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Lost Hive TTY on mac-mini. Reconnecting. The sessions keep running there.',
    );
  });

  it('disconnected: red, the reason, no countdown, no Try now', () => {
    act(() =>
      useHiveStore
        .getState()
        .setRemoteLink(link({ state: 'disconnected', nextAttemptAt: null, reason: 'That device was revoked.' })),
    );
    render(<ReconnectLine />);
    const line = screen.getByRole('status');
    expect(line).toHaveClass('text-red');
    expect(line).toHaveTextContent(
      'Disconnected from mac-mini. The connection ended and is not being retried: That device was revoked.',
    );
    expect(line).not.toHaveTextContent('Reconnecting in');
    expect(screen.queryByRole('button', { name: 'Try now' })).toBeNull();
  });

  it('disconnected with no reason ends the sentence', () => {
    act(() =>
      useHiveStore.getState().setRemoteLink(link({ state: 'disconnected', nextAttemptAt: null })),
    );
    render(<ReconnectLine />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected from mac-mini. The connection ended and is not being retried.',
    );
  });

  it('shows the lost count and Clear, shared with the bar foot', () => {
    act(() => useHiveStore.getState().setRemoteLink(link({ lost: 2 })));
    render(<ReconnectLine />);
    expect(
      screen.getByText(/2 actions \(clicks or keystrokes\) did not reach mac-mini/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(useHiveStore.getState().remoteLostAcked).toBe(2);
    expect(screen.queryByText(/did not reach/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});
