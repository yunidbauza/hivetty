import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ticket } from '@/types/ticket';
import { TicketNextAction } from '@features/work/components/ticket-next-action';
import { useHiveStore } from '@stores/hive-store';
import type { JiraIssue, JiraTransition } from '@shared/jira-contract';

/** "Move to ⌄": every status the workflow allows, shared by the ticket page and the Ticket tab (HIVE-202). */

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
const review: JiraTransition = { id: '21', name: 'Review', to: { name: 'In Review', statusCategory: 'in-progress' } };
const back: JiraTransition = { id: '11', name: 'Reopen', to: { name: 'To Do', statusCategory: 'todo' } };
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
  seed([back, review, done]);
});

const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Move to' }));

describe('TicketNextAction (HIVE-202)', () => {
  it('is a plain action row with the given class, not a centred button', () => {
    render(<TicketNextAction ticketKey="GRAC-3018" className="action" />);

    const trigger = screen.getByRole('button', { name: 'Move to' });
    expect(trigger).toHaveClass('action');
    expect(trigger).not.toHaveClass('justify-center', 'font-semibold');
  });

  it('lists every status the workflow allows, each as the header status pill', async () => {
    render(<TicketNextAction ticketKey="GRAC-3018" />);
    await openMenu();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['To Do', 'In Review', 'Done']);
    expect(screen.getByText('Done')).toHaveClass('rounded-full', 'bg-chip', 'uppercase', 'text-green');
  });

  it('draws nothing when the workflow offers no move', () => {
    seed([]);
    render(<TicketNextAction ticketKey="GRAC-3018" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('applies the picked transition, not only the forward one', async () => {
    applyJiraTransition.mockResolvedValue({ ok: true, value: moved });
    render(<TicketNextAction ticketKey="GRAC-3018" />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'In Review' }));

    expect(applyJiraTransition).toHaveBeenCalledWith({ key: 'GRAC-3018', transitionId: '21' });
    expect(useHiveStore.getState().tickets[0]).toMatchObject({ status: 'Done', statusCategory: 'done' });
  });

  it('says why a move was refused, in amber, and keeps the action', async () => {
    applyJiraTransition.mockResolvedValue({ ok: false, error: { kind: 'unknown', message: 'No transition' } });
    render(<TicketNextAction ticketKey="GRAC-3018" />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

    expect(await screen.findByText('No transition')).toHaveClass('text-amber-text');
    expect(screen.getByRole('button', { name: 'Move to' })).toBeEnabled();
  });

  it('names a missing bridge', async () => {
    applyJiraTransition.mockResolvedValue(null);
    render(<TicketNextAction ticketKey="GRAC-3018" />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

    expect(await screen.findByText(/./, { selector: 'p.text-amber-text' })).toBeInTheDocument();
  });
});
