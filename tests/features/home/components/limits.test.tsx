import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Limits } from '@features/home/components/limits';
import { useHiveStore } from '@stores/hive-store';

const NOW = new Date(2026, 9, 5, 12, 0).getTime();
const secs = (ms: number) => Math.floor(ms / 1000);

describe('Limits', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('draws Session and Week with their percentages and remainders', () => {
    useHiveStore.setState({
      metrics: {
        a: {
          fiveHourPct: 38,
          fiveHourResetsAt: secs(NOW + (3 * 60 + 12) * 60_000),
          sevenDayPct: 61,
          sevenDayResetsAt: secs(new Date(2026, 9, 12, 9).getTime()),
        },
      } as never,
    });
    render(<Limits />);
    expect(screen.getByText('LIMITS', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('3h 12m left')).toBeInTheDocument();
    expect(screen.getByText('61%')).toBeInTheDocument();
    expect(screen.getByText(/^resets /)).toBeInTheDocument();
  });

  it('an absent window draws no row and no zero', () => {
    useHiveStore.setState({ metrics: { a: { sevenDayPct: 61 } } as never });
    render(<Limits />);
    expect(screen.queryByText('Session')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByText('Week')).toBeInTheDocument();
  });

  it('draws nothing with neither window', () => {
    const { container } = render(<Limits />);
    expect(container).toBeEmptyDOMElement();
  });
});
