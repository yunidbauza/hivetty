import { Files, GitPullRequest } from '@phosphor-icons/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionPanelStrip, type StripTab } from '@components/layout/session-panel-strip';
import type { SessionPlan } from '@shared/plan-contract';

const plan: SessionPlan = {
  entityId: 's',
  source: 'task-tools',
  allDone: false,
  tasks: [
    { id: '1', title: 'A', status: 'completed' },
    { id: '2', title: 'B', status: 'in_progress' },
  ],
};

const files = (count: number): StripTab => ({
  id: 'files',
  label: count === 0 ? 'Files' : `Files ${String(count)}`,
  Icon: Files,
  fact: count === 0 ? 'Files' : `${String(count)} files changed`,
  count,
});

describe('SessionPanelStrip (HIVE-201)', () => {
  it('draws a tab dot in its tone, and none without one', () => {
    render(
      <SessionPanelStrip
        plan={undefined}
        tabs={[{ id: 'pr', label: 'PR', Icon: GitPullRequest, fact: '#313 · Open', dot: 'amber' }, files(0)]}
        onOpen={vi.fn()}
      />,
    );
    expect(within(screen.getByRole('button', { name: '#313 · Open' })).getByTestId('pr-dot')).toHaveClass('bg-amber');
    expect(within(screen.getByRole('button', { name: 'Files' })).queryByTestId('pr-dot')).toBeNull();
  });

  it('draws the plan rings, then each other tab with its fact; each opens its tab', () => {
    const onOpen = vi.fn();
    render(<SessionPanelStrip plan={plan} tabs={[files(2)]} onOpen={onOpen} />);

    const planButton = screen.getByRole('button', { name: 'Plan, 1 of 2 done' });
    expect(planButton).toHaveTextContent('1/2');
    const filesButton = screen.getByRole('button', { name: '2 files changed' });
    expect(filesButton).toHaveAttribute('title', '2 files changed');
    expect(filesButton).toHaveTextContent('2');

    fireEvent.click(planButton);
    fireEvent.click(filesButton);
    expect(onOpen.mock.calls).toEqual([['plan'], ['files']]);
  });

  it('a zero count draws no number', () => {
    render(<SessionPanelStrip plan={plan} tabs={[files(0)]} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Files' })).toHaveTextContent('');
  });

  it('no plan, no plan button and no divider', () => {
    const { container } = render(<SessionPanelStrip plan={undefined} tabs={[files(1)]} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Plan/ })).toBeNull();
    expect(container.querySelectorAll('[data-divider]')).toHaveLength(0);
  });

  it('an all-done plan says so', () => {
    render(<SessionPanelStrip plan={{ ...plan, allDone: true }} tabs={[]} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Plan, all done' })).toBeInTheDocument();
  });
});
