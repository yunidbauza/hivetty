import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JobLog } from '@features/pull-requests/components/job-log';

describe('JobLog', () => {
  it('draws the cut log, each line in its tone, an ellipsis when cut', () => {
    render(<JobLog onRetry={() => {}} entry={{ state: 'ok', log: { truncated: true, lines: [
      '  ✓ accepts a corporation (41 ms)', '  ✕ rejects a Delaware LLC (88 ms)', '    expect(received).toBe(expected)', 'Tests: 1 failed, 46 passed, 47 total',
    ] } }} />);
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByText(/accepts a corporation/)).toHaveAttribute('data-tone', 'muted');
    expect(screen.getByText(/rejects a Delaware LLC/)).toHaveAttribute('data-tone', 'fail');
    expect(screen.getByText(/expect\(received\)/)).toHaveAttribute('data-tone', 'plain');
    expect(screen.getByText(/Tests: 1 failed/)).toHaveAttribute('data-tone', 'muted');
  });

  it('shows a skeleton while reading', () => {
    render(<JobLog onRetry={() => {}} entry={{ state: 'loading' }} />);
    expect(screen.getByRole('status', { name: 'Loading the log' })).toBeInTheDocument();
  });

  it('names a failed read and retries it', () => {
    const onRetry = vi.fn();
    render(<JobLog onRetry={onRetry} entry={{ state: 'failed', problem: 'GitHub did not answer in time.' }} />);
    expect(screen.getByText('GitHub did not answer in time.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
