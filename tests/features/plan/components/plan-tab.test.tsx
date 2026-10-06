import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanTab } from '@features/plan/components/plan-tab';
import { formatDuration } from '@lib/format-duration';
import type { SessionPlan } from '@shared/plan-contract';

const plan: SessionPlan = {
  entityId: 's',
  source: 'task-tools',
  allDone: false,
  tasks: [
    { id: '1', title: 'Stage a transcript', status: 'completed', startedAt: 0, endedAt: 252_000 },
    {
      id: '2',
      title: 'Push and open the draft PR',
      status: 'in_progress',
      activeForm: 'Pushing and opening the draft PR…',
      startedAt: 300_000,
    },
    { id: '3', title: 'Later', status: 'pending' },
  ],
};

const summary = (text: string) =>
  screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text);

describe('PlanTab (HIVE-201)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(338_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('formats durations', () => {
    expect([formatDuration(38_000), formatDuration(252_000), formatDuration(3_720_000)]).toEqual([
      '38s',
      '4m 12s',
      '1h 2m',
    ]);
  });

  it('summarises done of total and the summed time, live', () => {
    render(<PlanTab plan={plan} onOpenFile={vi.fn()} />);
    expect(summary('1 of 3 tasks · 4m 50s')).toBeInTheDocument();
    expect(screen.getByText('38s')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('40s')).toBeInTheDocument();
  });

  it('tints the current task with its activeForm; a task with no startedAt shows no time', () => {
    render(<PlanTab plan={plan} onOpenFile={vi.fn()} />);
    expect(screen.getByText('Pushing and opening the draft PR…')).toBeInTheDocument();
    expect(screen.getByText('Later').closest('li')?.textContent).toBe('3Later');
  });

  it('does not tick with nothing in progress', () => {
    const spy = vi.spyOn(window, 'setInterval');
    render(<PlanTab plan={{ ...plan, tasks: [plan.tasks[0] as SessionPlan['tasks'][number]] }} onOpenFile={vi.fn()} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('names the plan file, its read time, and opens it on click', () => {
    const onOpenFile = vi.fn();
    const at = new Date(2026, 9, 2, 10, 4).getTime();
    render(
      <PlanTab
        plan={{ ...plan, file: '/r/.hive/plans/2026-09-30-hive-193.md', fileAt: at }}
        onOpenFile={onOpenFile}
      />,
    );
    expect(screen.getByText('Where it came from')).toBeInTheDocument();
    expect(screen.getByText(/Written by hive:plan at 10:04/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2026-09-30-hive-193\.md/ }));
    expect(onOpenFile).toHaveBeenCalledWith('/r/.hive/plans/2026-09-30-hive-193.md');
  });

  it('no plan file, no block', () => {
    render(<PlanTab plan={plan} onOpenFile={vi.fn()} />);
    expect(screen.queryByText('Where it came from')).toBeNull();
  });
});
