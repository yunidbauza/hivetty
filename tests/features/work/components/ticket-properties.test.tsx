import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ticket } from '@/types/ticket';
import { TicketProperties } from '@features/work/components/ticket-properties';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';
import type { JiraTransition } from '@shared/jira-contract';

/** The ticket page's properties column (HIVE-203). */

const applyJiraTransition = vi.fn();

vi.mock('@/lib/jira', () => ({
  readJiraStatus: () => Promise.resolve(null),
  searchJiraIssues: () => Promise.resolve(null),
  readJiraIssue: () => Promise.resolve(null),
  readJiraTransitions: () => Promise.resolve({ ok: true, value: [] }),
  applyJiraTransition: (request: unknown) => applyJiraTransition(request),
}));

const ticket: Ticket = {
  key: 'GRAC-3018',
  status: 'In Progress',
  statusCategory: 'in-progress',
  title: '[BE][P4]-Hero refresh',
  priority: 'High',
  assignee: 'Dana Kim',
  url: 'https://jira.example/browse/GRAC-3018',
};
const done: JiraTransition = { id: '31', name: 'Finish', to: { name: 'Done', statusCategory: 'done' } };
const value = (key: string) => screen.getByText(key, { selector: 'dt' }).nextElementSibling;

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  seedDemoFleet();
  useHiveStore.setState((state) => ({
    tickets: [ticket, { ...ticket, key: 'T-2', title: 'Quiet', priority: null, assignee: null }],
    ledger: [
      {
        id: '20261002-100000-0001',
        ts: 1,
        from: 'builder',
        kind: 'post',
        body: 'task 3',
        meta: { ticket: 'GRAC-3018', stage: 'build', task: 3 },
      },
    ],
    ticketDetails: {
      'GRAC-3018': {
        key: 'GRAC-3018',
        detail: { description: [], parent: { key: 'HIVE-194', summary: 'Epic' } },
        transitions: [done],
        problems: {},
      },
    },
    prs: state.prs,
  }));
});

describe('TicketProperties (HIVE-203)', () => {
  it('lists every property it has', () => {
    render(<TicketProperties ticketKey="GRAC-3018" />);

    expect(value('Status')).toHaveTextContent('In Progress');
    expect(value('Priority')).toHaveTextContent('P4');
    expect(value('Side')).toHaveTextContent('BE');
    expect(value('Project')).toHaveTextContent(/\S/);
    expect(value('Assignee')).toHaveTextContent('Dana Kim');
    expect(value('Agent')).toHaveTextContent('builder');
    expect(value('Epic')).toHaveTextContent('HIVE-194');
  });

  it('lists the sessions and pull requests on the ticket', () => {
    render(<TicketProperties ticketKey="GRAC-3018" />);

    expect(screen.getByRole('heading', { name: 'Session' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pull request' })).toBeInTheDocument();
    expect(screen.getByText('#482')).toBeInTheDocument();
  });

  it('leaves out what a quiet ticket does not have', () => {
    render(<TicketProperties ticketKey="T-2" />);

    expect(screen.queryByRole('heading', { name: 'Session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pull request' })).not.toBeInTheDocument();
    for (const key of ['Agent', 'Epic', 'Side', 'Priority', 'Project']) {
      expect(screen.queryByText(key, { selector: 'dt' })).not.toBeInTheDocument();
    }
    expect(value('Assignee')).toHaveTextContent('Unassigned');
    expect(screen.queryByRole('button', { name: /^Move to/ })).not.toBeInTheDocument();
  });

  it('opens the picker for the ticket', async () => {
    render(<TicketProperties ticketKey="GRAC-3018" />);

    await userEvent.click(screen.getByRole('button', { name: 'New session' }));

    expect(useUiStore.getState()).toMatchObject({ picker: true, pickerTicket: 'GRAC-3018' });
  });

  it('offers the step forward among its actions', () => {
    render(<TicketProperties ticketKey="GRAC-3018" />);

    const actions = screen.getByRole('heading', { name: 'Actions' }).parentElement!;
    expect(within(actions).getByRole('button', { name: 'Move to Done' })).toBeInTheDocument();
  });

  it('links to Jira outside the app', () => {
    render(<TicketProperties ticketKey="GRAC-3018" />);

    const link = screen.getByRole('link', { name: 'Open in Jira' });
    expect(link).toHaveAttribute('href', ticket.url);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('draws nothing for a ticket it does not know', () => {
    const { container } = render(<TicketProperties ticketKey="NOPE-1" />);

    expect(within(container).queryByText('Status')).not.toBeInTheDocument();
  });
});
