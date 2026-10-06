import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimelineLane, type LaneMark } from '@features/pull-requests/components/timeline-lane';

const marks: LaneMark[] = [
  { key: 'r1', from: 0.5, shape: 'ci', to: 0.6, tone: 'bg-red/65', tip: ['Run #2204 · failed', 'integration', '9 min · on 7c21e0f'], onOpen: vi.fn() },
  { key: 'c1', from: 0.2, shape: 'comment', tone: 'bg-brand', word: 'Maria', tip: ['Comment · Maria', '13:31'], onOpen: vi.fn() },
  { key: 'h1', from: 0.1, to: 0.3, shape: 'hold', tone: 'text-ink', word: 'fixer', tip: ['fixer held it', '13:00–13:20 · 20m'], onOpen: vi.fn() },
];

describe('TimelineLane', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders every mark as a labelled button', () => {
    render(<TimelineLane label="CI" marks={marks} />);
    expect(screen.getByRole('button', { name: 'Run #2204 · failed, integration, 9 min · on 7c21e0f' })).toBeTruthy();
    expect(screen.getByText('CI')).toBeTruthy();
  });

  it('draws a point\'s word only when it fits before the next mark; the tooltip carries it otherwise', () => {
    // A 1130px lane: 1000px of axis past the 130px label column.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1130);
    const point = (key: string, from: number, word: string): LaneMark => ({
      key, from, shape: 'review', tone: 'bg-subtle', word, tip: [word, '13:00'], onOpen: vi.fn(),
    });
    render(<TimelineLane label="Reviews" marks={[point('a', 0.01, 'tatre · commented'), point('b', 0.02, 'gru · commented'), point('c', 0.5, 'Shachee · approved')]} />);
    expect(screen.queryByText('tatre · commented')).toBeNull();
    expect(screen.getByText('gru · commented')).toBeTruthy();
    expect(screen.getByText('Shachee · approved')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^tatre · commented/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('tatre · commented');
  });

  it('draws no point word before the lane is measured (happy-dom measures 0)', () => {
    render(<TimelineLane label="Comments" marks={marks} />);
    expect(screen.queryByText('Maria')).toBeNull();
  });

  it('carries a span\'s word for the fit check (happy-dom measures 0, so it is not drawn)', () => {
    render(<TimelineLane label="Agents" marks={marks} height={40} />);
    const hold = screen.getByRole('button', { name: /fixer held it/ });
    expect(hold.getAttribute('data-word')).toBe('fixer');
    expect(hold.textContent).toBe('');
  });

  it('hover and focus show the tooltip; leaving hides it; Enter and click open', () => {
    render(<TimelineLane label="CI" marks={marks} />);
    const run = screen.getByRole('button', { name: /Run #2204/ });
    fireEvent.mouseEnter(run);
    expect(screen.getByRole('tooltip').textContent).toContain('9 min · on 7c21e0f');
    fireEvent.mouseLeave(run);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(run);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.blur(run);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(run);
    expect(marks[0]!.onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the tip below the lane, so the top lane\'s is not clipped under the ship track; past the middle it hangs left', () => {
    render(<TimelineLane label="Flap" marks={[...marks, { key: 'f1', from: 0.8, to: 0.9, shape: 'flap', tone: 'bg-amber', word: 'SUMMONS', tip: ['Summons'], onOpen: vi.fn() }]} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Comment · Maria/ }));
    expect(screen.getByRole('tooltip')).toHaveClass('top-full');
    expect(screen.getByRole('tooltip')).not.toHaveClass('-translate-x-full');
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Summons' }));
    expect(screen.getByRole('tooltip')).toHaveClass('top-full', '-translate-x-full');
  });
});
