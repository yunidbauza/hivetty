import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RetryButton, SourceProblem } from '@features/shared/components/source-problem';

/**
 * What both rails say when their source failed or went stale.
 *
 * The sentence is amber rather than red because the panel still has something
 * to show in the stale case — see each panel's own branch for which it is.
 */
describe('SourceProblem', () => {
  it('shows the message and retries on the button', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<SourceProblem message="Could not reach GitHub." onRetry={onRetry} />);

    expect(screen.getByText('Could not reach GitHub.')).toHaveClass('text-amber-text');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/** A retry that answers nothing while it is out reads as a dead button. */
describe('RetryButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const pending = () => {
    let settle!: (fail: boolean) => void;
    const promise = new Promise<void>((resolve, reject) => {
      settle = (fail) => (fail ? reject(new Error('gh')) : resolve());
    });
    return { promise, settle };
  };

  it.each([
    ['answers', false],
    ['fails', true],
  ])('spins and is disabled until the retry %s', async (_, fail) => {
    vi.useFakeTimers();
    const call = pending();
    const onRetry = vi.fn(() => call.promise);
    render(<RetryButton onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    const busy = screen.getByRole('button', { name: 'Trying…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy.querySelector('svg')).toHaveClass('animate-spin');

    fireEvent.click(busy);
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      call.settle(fail);
      await vi.advanceTimersByTimeAsync(400);
    });

    const idle = screen.getByRole('button', { name: 'Try again' });
    expect(idle).toBeEnabled();
    expect(idle.querySelector('svg')).not.toHaveClass('animate-spin');
  });

  it('keeps spinning for a beat when the retry fails at once, so it does not flicker', async () => {
    vi.useFakeTimers();
    render(<RetryButton onRetry={() => Promise.reject(new Error('offline'))} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(screen.getByRole('button', { name: 'Trying…' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
