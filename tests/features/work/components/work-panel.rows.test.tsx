import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Session } from '@/types/entity';
import type { Ticket } from '@/types/ticket';
import { WorkPanel } from '@features/work/components/work-panel';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

/** Round two's grouped Work panel (HIVE-203). Classic's cards are `work-panel.test.tsx`'s. */

const ticket = (key: string, statusCategory: Ticket['statusCategory'], status: string): Ticket => ({
  key,
  status,
  statusCategory,
  title: `[BE] ${key} title`,
  priority: null,
  assignee: null,
});

const setWaiting = (waiting: boolean) =>
  useHiveStore.setState((state) => ({
    entities: {
      ...state.entities,
      'hero-refresh': { ...(state.entities['hero-refresh'] as Session), status: waiting ? 'waiting' : 'idle' },
    },
  }));

const header = (name: RegExp) => screen.getByRole('button', { name });

describe('WorkPanel rows (HIVE-203)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    useHiveStore.setState({
      refreshTickets: () => Promise.resolve(),
      refreshPrs: () => Promise.resolve(),
      searchTickets: () => Promise.resolve(),
      prs: [],
      ledger: [],
      tickets: [
        ticket('GRAC-3018', 'in-progress', 'In Progress'),
        ticket('T-2', 'todo', 'To Do'),
        ticket('T-3', 'done', 'Done'),
      ],
    });
    setWaiting(true);
  });

  it('heads the panel with the counts, need-you in amber', () => {
    render(<WorkPanel />);

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText(/3 tickets/)).toBeInTheDocument();
    expect(screen.getByText('1 need you')).toHaveClass('text-amber-text');
  });

  it('drops need-you at zero', () => {
    setWaiting(false);
    render(<WorkPanel />);

    expect(screen.queryByText(/need you/)).not.toBeInTheDocument();
  });

  it('groups in order, Done folded until opened, and folds a group on click', async () => {
    render(<WorkPanel />);

    const groups = screen.getAllByRole('button', { expanded: true }).concat(screen.getAllByRole('button', { expanded: false }));
    expect(groups.map((group) => group.textContent)).toEqual(['In progress1', 'To do1', 'Done1']);
    expect(screen.getByText('GRAC-3018 title')).toBeInTheDocument();
    expect(screen.queryByText('T-3 title')).not.toBeInTheDocument();

    await userEvent.click(header(/^Done/));
    expect(screen.getByText('T-3 title')).toBeInTheDocument();

    await userEvent.click(header(/^In progress/));
    expect(screen.queryByText('GRAC-3018 title')).not.toBeInTheDocument();
    expect(header(/^In progress/)).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no header for an empty group', () => {
    useHiveStore.setState({ tickets: [ticket('T-2', 'todo', 'To Do')] });
    render(<WorkPanel />);

    expect(screen.queryByRole('button', { name: /^In progress/ })).not.toBeInTheDocument();
    expect(header(/^To do/)).toBeInTheDocument();
  });

  it('shows rows, not groups, for a search', () => {
    useUiStore.setState({ workSearchTerm: 'x' });
    useHiveStore.setState((state) => ({
      ticketSearch: { ...state.ticketSearch, term: 'x', results: [ticket('S-1', 'todo', 'To Do')] },
    }));
    render(<WorkPanel />);

    expect(screen.getByText('S-1 title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^To do/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows the search box only once the search button is pressed', async () => {
    render(<WorkPanel />);
    expect(screen.queryByRole('searchbox', { name: 'Search tickets' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Search tickets' }));

    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search tickets' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a ticket from its row', async () => {
    render(<WorkPanel />);

    await userEvent.click(screen.getByText('GRAC-3018 title'));

    expect(useUiStore.getState().workTicket).toBe('GRAC-3018');
  });

});
