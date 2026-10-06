import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrChecks } from '@features/pull-requests/components/pr-checks';
import { useAppearanceStore } from '@stores/appearance-store';
import { prKey, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { prDetail } from '@tests/support/pr-detail';
import { expectNoHexColour, inLight } from '@tests/support/light';

const { pr } = hatchRow({}, { flap: 'MUTATING', tone: 'green' });
const key = prKey(pr.owner, pr.repo, pr.n);
const loadPrChecks = vi.fn(() => Promise.resolve());
const loadJobLog = vi.fn(() => Promise.resolve());
const rerunFailed = vi.fn(() => Promise.resolve({ ok: true as const, value: true as const }));
const run = (id: number, headSha: string, conclusion: string | null, status = 'completed') => ({
  id, number: id, attempt: 1, status, conclusion, headSha, event: 'push', workflowName: 'CI',
  createdAt: new Date().toISOString(), updatedAt: 'u', url: 'u' });
const job = (id: number, runId: number, conclusion: string) => ({ id, runId, name: `job${String(id)}`, status: 'completed', conclusion,
  startedAt: null, completedAt: null, url: `https://x/${String(id)}`, steps: [] });

const seed = (runs: ReturnType<typeof run>[], jobs: Record<number, ReturnType<typeof job>[]>) =>
  useHiveStore.setState({ prChecks: { [key]: { key, state: 'ok', runs, workflows: [], jobs, logs: {} } } });

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({ loadPrChecks, loadJobLog, rerunFailed });
});

afterEach(() => {
  act(() => useAppearanceStore.getState().setTheme('dark'));
});

describe('PrChecks', () => {
  it('reads on mount for this PR’s head branch', () => {
    render(<PrChecks pr={pr} detail={prDetail()} />);
    expect(loadPrChecks).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, prDetail().headRef ?? pr.branch, undefined);
    expect(loadPrChecks).toHaveBeenCalledTimes(1);
  });

  it('says there are no checks on the head commit rather than drawing an empty graph', () => {
    seed([], {});
    render(<PrChecks pr={pr} detail={prDetail({ headSha: '9f3c2ab0123', checks: [] })} />);
    expect(screen.getByText('No checks on 9f3c2ab')).toBeInTheDocument();
  });

  it('renders in light on tokens alone (HIVE-210)', () => {
    seed([run(2, 'new', 'failure'), run(1, 'old', 'success')], { 2: [job(21, 2, 'success'), job(22, 2, 'failure')] });
    inLight();
    const { container } = render(<PrChecks pr={pr} detail={prDetail()} />);
    expect(screen.getByText('JOB22')).toBeInTheDocument();
    expectNoHexColour(container);
  });

  it('draws the newest push, shows its failed job and reads that job’s log once', () => {
    seed([run(2, 'new', 'failure'), run(1, 'old', 'success')], { 2: [job(21, 2, 'success'), job(22, 2, 'failure')] });
    render(<PrChecks pr={pr} detail={prDetail()} />);
    expect(screen.getByText('Run #2')).toBeInTheDocument();
    expect(screen.getByText('JOB22')).toBeInTheDocument();
    expect(loadJobLog).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 22);
    expect(loadJobLog).toHaveBeenCalledTimes(1);
  });

  it('stacks steps over the log on a page under 640px (HIVE-223)', () => {
    seed([run(2, 'new', 'failure')], { 2: [job(22, 2, 'failure')] });
    render(<PrChecks pr={pr} detail={prDetail()} />);
    const grid = screen.getByText('JOB22').closest('.grid');
    expect(grid).toHaveClass('grid-cols-1', '@min-[640px]:grid-cols-[300px_minmax(0,1fr)]');
  });

  it('shows another push when its square is clicked', () => {
    seed([run(2, 'new', 'failure'), run(1, 'old', 'success')], {});
    render(<PrChecks pr={pr} detail={prDetail()} />);
    fireEvent.click(screen.getByRole('button', { name: /Run #1,/ }));
    expect(useUiStore.getState().prRun).toBe('old');
  });

  it('cannot re-run while a run of the push is in progress', () => {
    // Another workflow: a push keeps one run per workflow (D1).
    seed([run(2, 'new', 'failure'), { ...run(3, 'new', null, 'in_progress'), workflowName: 'Preview' }], { 2: [job(22, 2, 'failure')] });
    render(<PrChecks pr={pr} detail={prDetail()} />);
    expect(screen.getByRole('button', { name: 'Re-run failed' })).toBeDisabled();
  });

  it('re-runs the shown job’s run', async () => {
    seed([run(2, 'new', 'failure')], { 2: [job(22, 2, 'failure')] });
    render(<PrChecks pr={pr} detail={prDetail()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-run failed' })); await Promise.resolve(); });
    expect(rerunFailed).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 2, prDetail().headRef ?? pr.branch, undefined);
  });

  it('lists checks from outside Actions in a row of their own, with a link out', () => {
    seed([], {});
    render(<PrChecks pr={pr} detail={prDetail({ checks: [
      { name: 'netlify/deploy-preview', status: 'success', startedAt: null, completedAt: null, url: 'https://netlify', app: 'netlify', jobId: null },
      { name: 'unit', status: 'success', startedAt: null, completedAt: null, url: 'https://x', app: 'github-actions', jobId: 9 },
    ] })} />);
    expect(screen.getByRole('link', { name: /netlify\/deploy-preview/ })).toHaveAttribute('href', 'https://netlify');
    expect(screen.queryByText('No checks on', { exact: false })).toBeNull();
    expect(screen.queryByRole('link', { name: /^unit/ })).toBeNull();
  });
});
