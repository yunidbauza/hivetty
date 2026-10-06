import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TicketRowModel } from '@lib/ticket-activity';
import { TicketRow } from '@features/work/components/ticket-row';
import { useUiStore } from '@stores/ui-store';

/** The Work panel's row (HIVE-203). */

const model = (over: Partial<TicketRowModel> = {}): TicketRowModel => ({
  ticket: { key: 'HIVE-1', status: 'In Progress', statusCategory: 'in-progress', title: '[BE] Drafter', priority: null, assignee: null },
  title: 'Drafter',
  tone: 'ring',
  fact: 'no session',
  ...over,
});

describe('TicketRow (HIVE-203)', () => {
  beforeEach(() => useUiStore.getState().reset());

  it('shows the title, and the key and fact on one line', () => {
    render(<TicketRow row={model()} />);

    expect(screen.getByText('Drafter')).toBeInTheDocument();
    expect(screen.getByText('HIVE-1').parentElement).toHaveTextContent('HIVE-1 · no session');
  });

  it('draws the tone on the dot', () => {
    const { container } = render(<TicketRow row={model({ tone: 'amber' })} />);

    expect(container.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'amber');
  });

  it('opens the ticket on click, and marks the open one current', async () => {
    render(<TicketRow row={model()} />);
    const row = screen.getByRole('button', { name: /Drafter/ });
    expect(row).not.toHaveAttribute('aria-current');

    await userEvent.click(row);

    expect(useUiStore.getState().workTicket).toBe('HIVE-1');
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row).toHaveClass('bg-active');
  });

  it('is not current for another open ticket', () => {
    act(() => useUiStore.getState().openWorkTicket('HIVE-2'));
    render(<TicketRow row={model()} />);

    expect(screen.getByRole('button')).not.toHaveAttribute('aria-current');
  });
});
