import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PrRow } from '@features/pull-requests/components/pr-row';
import { hatchRow } from '@tests/support/hatchery';

describe('PrRow', () => {
  const row = hatchRow({}, { flap: 'MUTATING', tone: 'green', github: 'Open · 2 open findings, fixer on it' });

  it('leads with the title and the flap, then the number and repo, small', () => {
    render(<PrRow row={row} open={false} onOpen={() => {}} />);
    expect(screen.getByText('Fee rule validator for Delaware filings')).toHaveClass('truncate', 'text-ui');
    expect(screen.getByText('MUTATING')).toBeInTheDocument();
    expect(screen.getByText('#1182 · incorpx-server')).toHaveClass('text-ui-sm');
  });

  it("carries GitHub's words in its name and tooltip", () => {
    render(<PrRow row={row} open={false} onOpen={() => {}} />);
    const button = screen.getByRole('button', { name: /MUTATING: Open · 2 open findings, fixer on it/ });
    expect(button).toHaveAttribute('title', 'Open · 2 open findings, fixer on it');
  });

  it('marks the open PR', () => {
    render(<PrRow row={row} open onOpen={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button')).toHaveClass('bg-active');
  });

  it('draws the draft glyph for LARVA and COCOONING', () => {
    const { container } = render(<PrRow row={hatchRow({ state: 'draft' }, { flap: 'LARVA' })} open={false} onOpen={() => {}} />);
    expect(container.querySelector('[data-glyph="draft"]')).not.toBeNull();
  });

  it('opens on click', async () => {
    const onOpen = vi.fn();
    render(<PrRow row={row} open={false} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(row);
  });
});
