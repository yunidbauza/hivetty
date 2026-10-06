import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NextTry } from '@components/layout/next-try';

describe('NextTry (HIVE-211)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down once a second under fake timers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    render(
      <p>
        <NextTry at={4_000} prefix="Reconnecting in" />
      </p>,
    );
    const line = screen.getByText(/Reconnecting in/);
    expect(line).toHaveTextContent('Reconnecting in 4s');

    act(() => vi.advanceTimersByTime(1_000));

    expect(line).toHaveTextContent('Reconnecting in 3s');
  });

  it('stops at zero once the moment has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    render(
      <p>
        <NextTry at={4_000} prefix="Next try in" />
      </p>,
    );
    expect(screen.getByText(/Next try in/)).toHaveTextContent('Next try in 0s');
  });
});
