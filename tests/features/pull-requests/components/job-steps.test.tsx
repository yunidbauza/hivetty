import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JobSteps } from '@features/pull-requests/components/job-steps';
import type { RunJob } from '@shared/github-contract';

const step = (number: number, name: string, conclusion: string | null, over = {}) => ({
  number, name, status: 'completed', conclusion, startedAt: '2026-10-03T14:00:00Z', completedAt: '2026-10-03T14:00:02Z', ...over,
});
const JOB: RunJob = {
  id: 77, runId: 2207, name: 'integration', status: 'completed', conclusion: 'failure',
  startedAt: '2026-10-03T14:00:00Z', completedAt: '2026-10-03T14:03:10Z', url: 'https://github.com/acme/x/actions/runs/2207/job/77',
  steps: [step(1, 'Set up job', 'success'), step(2, 'Run integration tests', 'failure'), step(3, 'Upload coverage', 'skipped', { startedAt: null, completedAt: null })],
};

describe('JobSteps', () => {
  it('heads with the job and its state, lists its steps, the failing one tinted', () => {
    render(<JobSteps job={JOB} canRerun onRerun={() => Promise.resolve(null)} holder={null} />);
    expect(screen.getByText('INTEGRATION')).toBeInTheDocument();
    expect(screen.getByText('FAILED · 3M 10S')).toHaveClass('text-red');
    expect(screen.getByText('Run integration tests').closest('li')).toHaveAttribute('data-state', 'failed');
    expect(screen.getByText('skipped')).toBeInTheDocument();
  });

  it('opens the job’s log on GitHub', () => {
    render(<JobSteps job={JOB} canRerun onRerun={() => Promise.resolve(null)} holder={null} />);
    expect(screen.getByRole('link', { name: /Open the log/ })).toHaveAttribute('href', JOB.url);
  });

  it('re-runs failed, and shows a refusal under the buttons', async () => {
    const onRerun = vi.fn().mockResolvedValue('GitHub is rate-limiting this account.');
    render(<JobSteps job={JOB} canRerun onRerun={onRerun} holder={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-run failed' }));
    expect(await screen.findByText('GitHub is rate-limiting this account.')).toBeInTheDocument();
  });

  it('cannot re-run while the run is in progress or nothing failed', () => {
    render(<JobSteps job={JOB} canRerun={false} onRerun={() => Promise.resolve(null)} holder={null} />);
    expect(screen.getByRole('button', { name: 'Re-run failed' })).toBeDisabled();
  });

  it('says who has the PR when an agent holds it', () => {
    render(<JobSteps job={JOB} canRerun onRerun={() => Promise.resolve(null)} holder="fixer" />);
    expect(screen.getByText('fixer')).toBeInTheDocument();
    expect(screen.getByText(/has it/)).toBeInTheDocument();
  });
});
