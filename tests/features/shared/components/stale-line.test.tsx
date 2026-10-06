import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { clockTime } from '@lib/format-clock';
import { StaleLine } from '@features/shared/components/stale-line';

describe('StaleLine (HIVE-211)', () => {
  const loaded = new Date('2026-10-03T10:31:00').getTime();
  const failed = new Date('2026-10-03T10:42:00').getTime();

  it('names both times in an amber wash, and retries', async () => {
    const onRetry = vi.fn();
    render(<StaleLine service="Jira" failedAt={failed} readAt={loaded} onRetry={onRetry} />);
    const line = screen.getByText(
      `Couldn't reach Jira at ${clockTime(failed)}. Showing what was loaded at ${clockTime(loaded)}.`,
    );
    expect(line).toHaveClass('text-amber-text');
    expect(screen.getByRole('status')).toHaveClass('bg-amber-soft');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, loaded],
    [failed, null],
  ])('falls back to the old sentence without both times (%s, %s)', (failedAt, readAt) => {
    render(<StaleLine service="GitHub" failedAt={failedAt} readAt={readAt} onRetry={vi.fn()} />);
    expect(screen.getByText('Could not reach GitHub. These may be out of date.')).toBeInTheDocument();
  });
});
