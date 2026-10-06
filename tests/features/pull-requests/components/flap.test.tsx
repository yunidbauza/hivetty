import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FLAP_DOT, Flap } from '@features/pull-requests/components/flap';
import { fixtureHatch } from '@tests/support/hatchery';

const motion = { reduced: false };
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => motion.reduced }));

beforeEach(() => {
  motion.reduced = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Flap', () => {
  it('draws the word in its tone, and HATCHED with its time', () => {
    const { rerender } = render(<Flap hatch={fixtureHatch({ flap: 'MUTATING', tone: 'green' })} />);
    expect(screen.getByText('MUTATING')).toHaveClass('text-green');
    rerender(<Flap hatch={fixtureHatch({ flap: 'HATCHED', at: '11:32', tone: 'brand' })} />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText('HATCHED 11:32')).toHaveClass('text-brand');
  });

  it('pulses SUMMONS, and nothing else', () => {
    const { rerender } = render(<Flap hatch={fixtureHatch({ flap: 'SUMMONS', tone: 'amber' })} />);
    expect(screen.getByText('SUMMONS')).toHaveClass('animate-ccpulse');
    rerender(<Flap hatch={fixtureHatch({ flap: 'BURROWED' })} />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText('BURROWED')).not.toHaveClass('animate-ccpulse');
  });

  it('never turns on first render', () => {
    render(<Flap hatch={fixtureHatch()} />);
    expect(screen.getByText('BURROWED')).not.toHaveClass('animate-ccflap');
  });

  it('turns once on a changed word, the word landing half way', () => {
    const { rerender } = render(<Flap hatch={fixtureHatch({ flap: 'INCUBATING', tone: 'green' })} />);
    rerender(<Flap hatch={fixtureHatch({ flap: 'MUTATING', tone: 'green' })} />);
    expect(screen.getByText('INCUBATING')).toHaveClass('animate-ccflap');
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByText('MUTATING')).toBeInTheDocument();
  });

  it('does not turn for the same word', () => {
    const { rerender } = render(<Flap hatch={fixtureHatch()} />);
    rerender(<Flap hatch={fixtureHatch({ github: 'Open · waits on its author' })} />);
    expect(screen.getByText('BURROWED')).not.toHaveClass('animate-ccflap');
  });

  it('neither turns nor pulses under reduced motion', () => {
    motion.reduced = true;
    const { rerender } = render(<Flap hatch={fixtureHatch({ flap: 'SUMMONS', tone: 'amber' })} />);
    expect(screen.getByText('SUMMONS')).not.toHaveClass('animate-ccpulse');
    rerender(<Flap hatch={fixtureHatch({ flap: 'MUTATING', tone: 'green' })} />);
    expect(screen.getByText('MUTATING')).not.toHaveClass('animate-ccflap');
  });
});

describe('FLAP_DOT', () => {
  it('one background utility per tone', () => {
    expect(FLAP_DOT).toEqual({ muted: 'bg-subtle', green: 'bg-green', amber: 'bg-amber', brand: 'bg-brand' });
  });
});
