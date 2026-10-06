import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ticket } from '@/types/ticket';
import { TicketNextAction } from '@features/work/components/ticket-next-action';
import { useHiveStore } from '@stores/hive-store';
import type { JiraIssue, JiraTransition } from '@shared/jira-contract';

/** "Move to <status>", shared by the ticket page and the Ticket tab (HIVE-202). */

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
const moved: JiraIssue = {
  key: 'GRAC-3018',
  summary: ticket.title,
  status: 'Done',
  statusCategory: 'done',
  issueType: 'Story',
  priority: 'High',
  assignee: 'Dana Kim',
  updated: '2026-10-02T00:00:00.000-0400',
  url: ticket.url!,
};

const seed = (transitions: JiraTransition[]) =>
  useHiveStore.setState({
    tickets: [ticket],
    ticketDetails: { 'GRAC-3018': { key: 'GRAC-3018', transitions, problems: {} } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  seed([done]);
});

describe('TicketNextAction (HIVE-202)', () => {
  it('offers the one step forward, with the given class', () => {
    render(<TicketNextAction ticketKey="GRAC-3018" className="action" />);

    expect(screen.getByRole('button', { name: 'Move to Done' })).toHaveClass('action');
  });

  it('draws the destination as the header status pill, coloured by its category', () => {
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    expect(screen.getByText('Done')).toHaveClass('rounded-full', 'bg-chip', 'uppercase', 'text-green');
  });

  it('keeps a space between "Move to" and the status pill in its text', () => {
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    // jsdom has no layout, so the accessible name cannot tell inline from flex: the text content is the check.
    expect(screen.getByRole('button', { name: 'Move to Done' }).textContent).toBe('Move to Done');
  });

  it('draws nothing when there is no step forward', () => {
    seed([]);
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('moves the ticket one step forward', async () => {
    applyJiraTransition.mockResolvedValue({ ok: true, value: moved });
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    await userEvent.click(screen.getByRole('button', { name: 'Move to Done' }));

    expect(applyJiraTransition).toHaveBeenCalledWith({ key: 'GRAC-3018', transitionId: '31' });
    expect(useHiveStore.getState().tickets[0]).toMatchObject({ status: 'Done', statusCategory: 'done' });
  });

  it('says why a move was refused, in amber, and keeps the button', async () => {
    applyJiraTransition.mockResolvedValue({ ok: false, error: { kind: 'unknown', message: 'No transition' } });
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    await userEvent.click(screen.getByRole('button', { name: 'Move to Done' }));

    expect(await screen.findByText('No transition')).toHaveClass('text-amber-text');
    expect(screen.getByRole('button', { name: 'Move to Done' })).toBeEnabled();
  });

  it('names a missing bridge', async () => {
    applyJiraTransition.mockResolvedValue(null);
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    await userEvent.click(screen.getByRole('button', { name: 'Move to Done' }));

    expect(await screen.findByText(/./, { selector: 'p.text-amber-text' })).toBeInTheDocument();
  });
});
