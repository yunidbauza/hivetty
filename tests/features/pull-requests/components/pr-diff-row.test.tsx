import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DiffRowView } from '@features/pull-requests/components/pr-diff-row';

const line = { kind: 'del' as const, oldN: 115, newN: null, text: 'gone' };

describe('DiffRowView', () => {
  it('selects with its own position, so its parent can hand every row the same callback', async () => {
    const onSelect = vi.fn();
    render(<DiffRowView line={line} n={115} side="L" selected={false} hunk={2} at={7} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Old line 115' }));
    expect(onSelect).toHaveBeenCalledWith('L', 2, 7);
  });

  it('has no gutter button where the side has no number', () => {
    render(<DiffRowView line={line} n={null} side="L" selected={false} hunk={0} at={0} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
