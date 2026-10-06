import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CombHeadline, headline, summaryText } from '@features/home/components/comb-headline';
import { useAppearanceStore } from '@stores/appearance-store';

const BUSY = { working: 4, failed: 1, resting: 3, projects: 3, agents: 6 };
const CALM = { working: 4, failed: 0, resting: 3, projects: 3, agents: 6 };

describe('CombHeadline', () => {
  beforeEach(() => useAppearanceStore.getState().reset());

  it('is calling, in amber, with the summons count', () => {
    render(<CombHeadline needs={5} summary={BUSY} />);
    expect(screen.getByRole('heading', { level: 2, name: 'The hive is calling · 5 summons' })).toHaveClass('text-amber-text');
    expect(screen.getByText('4 working · 1 failed · 3 resting · 3 projects · 6 agents')).toBeInTheDocument();
    expect(screen.queryByText('The Comb')).not.toBeInTheDocument();
  });

  it('is humming in grey when nothing needs you, and leaves out failed at zero', () => {
    render(<CombHeadline needs={0} summary={CALM} />);
    expect(screen.getByRole('heading', { level: 2, name: 'The hive is humming' })).toHaveClass('text-muted');
    expect(summaryText(CALM)).toBe('4 working · 3 resting · 3 projects · 6 agents');
  });

  it('takes the first mood that fits', () => {
    const none = { working: 0, failed: 0, resting: 0, projects: 1, agents: 0 };
    expect(headline(1, BUSY).text).toBe('The hive is calling · 1 summons');
    expect(headline(0, BUSY)).toEqual({ text: 'The hive is wounded', tone: 'text-red' });
    expect(headline(0, { ...none, resting: 2 }).text).toBe('The hive is quiet');
    expect(headline(0, none).text).toBe('The hive is dormant');
  });

  it('shows the team name, and nothing when it is blank', () => {
    useAppearanceStore.setState({ teamName: 'Zergling Battalion' });
    const { unmount } = render(<CombHeadline needs={0} summary={CALM} />);
    expect(screen.getByText('Zergling Battalion')).toBeInTheDocument();
    unmount();

    useAppearanceStore.setState({ teamName: '  ' });
    const { container } = render(<CombHeadline needs={0} summary={CALM} />);
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });
});
