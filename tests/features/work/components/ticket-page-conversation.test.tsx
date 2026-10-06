import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/types/entity';
import type { Ticket, TicketDetail } from '@/types/ticket';
import { TicketPageConversation } from '@features/work/components/ticket-page-conversation';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import type { JiraComment } from '@shared/jira-contract';
import type { LedgerEntry } from '@shared/ledger-contract';

/** The ticket page's conversation (HIVE-203). */

const readJiraDetail = vi.fn();
const readJiraComments = vi.fn();
const addJiraComment = vi.fn();
const searchJiraUsers = vi.fn();

vi.mock('@/lib/jira', () => ({
  readJiraStatus: () => Promise.resolve(null),
  searchJiraIssues: () => Promise.resolve(null),
  readJiraIssue: () => Promise.resolve(null),
  readJiraTransitions: () => Promise.resolve(null),
  readJiraDetail: (request: unknown) => readJiraDetail(request),
  readJiraComments: (request: unknown) => readJiraComments(request),
  addJiraComment: (request: unknown) => addJiraComment(request),
  searchJiraUsers: (request: unknown) => searchJiraUsers(request),
}));

const ticket: Ticket = {
  key: 'HIVE-7',
  status: 'In Progress',
  statusCategory: 'in-progress',
  title: 'Page',
  priority: null,
  assignee: null,
  url: 'https://jira.example/browse/HIVE-7',
};
const comment = (id: string, author: string, created: string, text: string): JiraComment => ({
  id,
  author,
  created,
  body: [{ kind: 'paragraph', runs: [{ text, marks: [] }] }],
});
const dana = { ...comment('100', 'Dana Kim', '2026-10-01T10:00:00.000Z', 'First words'), authorId: '712020:dana' };
const acr = comment('101', 'acr', '2026-10-01T12:00:00.000Z', 'Second words');
const event = (id: string, ts: number, meta: Record<string, unknown>, body = 'Built it\nmore detail'): LedgerEntry => ({
  id,
  ts,
  from: 'builder',
  kind: 'post',
  body,
  meta: { ticket: 'HIVE-7', ...meta },
});
const between = event('20261001-110000-0001', Date.parse('2026-10-01T11:00:00.000Z'), { pr: 412 });

const seed = (over: Partial<TicketDetail> = {}) =>
  useHiveStore.setState({
    tickets: [ticket],
    ledger: [],
    ticketDetails: { 'HIVE-7': { key: 'HIVE-7', comments: [dana, acr], total: 2, history: [between], problems: {}, ...over } },
  });

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  writeText.mockResolvedValue(undefined);
  readJiraDetail.mockResolvedValue(null);
  readJiraComments.mockResolvedValue(null);
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const items = () => within(screen.getByRole('list', { name: 'Conversation' })).getAllByRole('listitem');

describe('TicketPageConversation (HIVE-203)', () => {
  it('heads the conversation with its counts and a Comments | Everything switch', () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeInTheDocument();
    expect(screen.getByText('2 comments · 1 event')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Comments' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Everything' })).toBeInTheDocument();
  });

  it('counts in the singular', () => {
    seed({ comments: [dana], total: 1, history: [between, event('20261001-110000-0002', 1, {})] });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText('1 comment · 2 events')).toBeInTheDocument();
  });

  it('shows only comments, oldest first, then everything interleaved by time', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    expect(items().map((item) => item.textContent)).toEqual([
      expect.stringContaining('First words'),
      expect.stringContaining('Second words'),
    ]);

    await userEvent.click(screen.getByRole('radio', { name: 'Everything' }));

    expect(items()).toHaveLength(3);
    expect(items()[1]).toHaveTextContent('builder Built it');
    expect(items()[1]).not.toHaveTextContent('more detail');
  });

  it('gives a comment a face with initials, its author and its time', () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(within(items()[0]!).getByText('DK')).toBeInTheDocument();
    expect(within(items()[1]!).getByText('AC')).toBeInTheDocument();
    expect(within(items()[0]!).getByText('Dana Kim')).toBeInTheDocument();
    expect(within(items()[0]!).getByText(/\d/, { selector: 'time' })).toBeInTheDocument();
  });

  it('marks an event with a PR glyph or the hexagon, and gives it no Reply', async () => {
    seed({ history: [between, event('20261001-115000-0001', Date.parse('2026-10-01T11:50:00.000Z'), {})] });
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Everything' }));

    const [, pr, plain] = items();
    expect(pr!.querySelector('[data-glyph]')).toHaveAttribute('data-glyph', 'pr');
    expect(plain!.querySelector('[data-glyph]')).toHaveAttribute('data-glyph', 'session');
    expect(within(pr!).queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('puts Reply and Copy link in the time slot, revealed on hover or focus', () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    const first = items()[0]!;

    const time = within(first).getByText(/\d/, { selector: 'time' });
    expect(time).toHaveClass('group-hover:invisible', 'group-has-[:focus-visible]:invisible');
    const actions = within(first).getByRole('button', { name: 'Reply' }).parentElement!;
    // Opacity, not visibility: `invisible` would take the buttons out of the tab order (HIVE-223).
    expect(actions).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-has-[:focus-visible]:opacity-100');
    expect(actions).not.toHaveClass('invisible');
    expect(within(actions).getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(actions.parentElement).toBe(time.parentElement);
    expect(time.parentElement).toHaveClass('w-[120px]', 'shrink-0');
  });

  it('reaches Reply and Copy link with Tab (HIVE-223)', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    const first = items()[0]!;
    const reply = within(first).getByRole('button', { name: 'Reply' });
    const copy = within(first).getByRole('button', { name: 'Copy link' });

    for (let i = 0; i < 20 && document.activeElement !== reply; i += 1) await userEvent.tab();
    expect(reply).toHaveFocus();
    await userEvent.tab();
    expect(copy).toHaveFocus();
  });

  it('says when only the latest comments are shown', () => {
    seed({ total: 80 });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText(/Showing the latest 2 of 80/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Jira' })).toHaveAttribute('href', ticket.url);
  });

  it('copies a link to the comment', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith(`${ticket.url}?focusedCommentId=100`);
  });

  it('shows a skeleton until the comments land', () => {
    seed({ comments: undefined, total: undefined });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByRole('status', { name: 'Loading conversation' })).toBeInTheDocument();
  });

  it('shows a failed read with Retry', async () => {
    seed({ comments: undefined, total: undefined, problems: { comments: 'Jira is down' } });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText('Jira is down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(readJiraComments).toHaveBeenCalledWith({ key: 'HIVE-7', newest: true });
  });

  it('keeps the comments it has, with their age, when a re-read fails', () => {
    seed({ problems: { comments: 'Jira is down' }, readAt: Date.parse('2026-10-01T12:30:00.000Z') });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText('First words')).toBeInTheDocument();
    expect(screen.getByText(/^as of /)).toBeInTheDocument();
  });

  it('says so when there are no comments', () => {
    seed({ comments: [], total: 0, history: [] });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });
});

describe('the reply box (HIVE-203)', () => {
  const box = () => screen.getByRole('combobox', { name: 'Comment on HIVE-7' });

  it('replies to a comment, and Escape in an empty box forgets whom', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    expect(box()).toHaveAttribute('placeholder', 'Add a comment — markdown works');

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));

    expect(box()).toHaveAttribute('placeholder', 'Reply to Dana Kim…');
    expect(box()).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(box()).toHaveAttribute('placeholder', 'Add a comment — markdown works');
  });

  it('keeps the reply when Escape lands on a box with text', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));

    await userEvent.type(box(), 'hi');
    await userEvent.keyboard('{Escape}');

    expect(box()).toHaveAttribute('placeholder', 'Reply to Dana Kim…');
    expect(box()).toHaveValue('hi');
  });

  it('says where the comment goes and who sees it', () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(screen.getByText('Comment on Jira')).toBeInTheDocument();
    expect(screen.getByText('everyone on the ticket sees it')).toBeInTheDocument();
  });

  it('disables Comment while empty and while posting', async () => {
    let finish!: (value: unknown) => void;
    addJiraComment.mockReturnValue(new Promise((done) => (finish = done)));
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();

    await userEvent.type(box(), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(screen.getByRole('button', { name: 'Posting…' })).toHaveAttribute('aria-disabled', 'true');
    finish(null);
  });

  it('keeps the disabled Comment label legible: on-brand text, dimmed by opacity', () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    const button = screen.getByRole('button', { name: 'Comment' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('text-on-brand', 'disabled:opacity-60');
    expect(button.className).not.toMatch(/disabled:text-subtle|\btext-ink\b/);
  });

  it('posts the trimmed draft, clears the box and shows the comment', async () => {
    const posted = comment('102', 'Me Myself', '2026-10-01T13:00:00.000Z', 'Posted words');
    addJiraComment.mockResolvedValue({ ok: true, value: posted });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.type(box(), '  Posted words  ');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(addJiraComment).toHaveBeenCalledWith({ key: 'HIVE-7', markdown: 'Posted words' });
    expect(await screen.findByText('Posted words')).toBeInTheDocument();
    expect(box()).toHaveValue('');
    expect(useHiveStore.getState().ticketDetails['HIVE-7']?.total).toBe(3);
  });

  it('shows a refusal and each detail in amber, keeping the draft', async () => {
    addJiraComment.mockResolvedValue({
      ok: false,
      error: { kind: 'invalid', message: 'Jira refused it', details: ['body: too long'] },
    });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.type(box(), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText('Jira refused it')).toHaveClass('text-amber-text');
    expect(screen.getByText('body: too long')).toHaveClass('text-amber-text');
    expect(box()).toHaveValue('draft');
  });

  it('names a missing bridge', async () => {
    addJiraComment.mockResolvedValue(null);
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.type(box(), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText(/./, { selector: 'p.text-amber-text' })).toBeInTheDocument();
  });
});

describe('comments posted for an agent (HIVE-216)', () => {
  const viaBuilder: JiraComment = { ...comment('103', 'Yunid Bauza', '2026-10-01T13:00:00.000Z', 'Task 3 done'), via: { agent: 'builder' } };

  it('draws the agent: its glyph in a rounded square, its name, and "via Hive TTY"', () => {
    seed({ comments: [dana, viaBuilder], total: 2 });
    useHiveStore.setState({
      entities: { builder: { kind: 'agent', id: 'builder', icon: 'ph-robot' } as unknown as Agent },
    });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    const row = items()[1]!;
    expect(within(row).getByText('builder')).toBeInTheDocument();
    expect(within(row).getByText('via Hive TTY')).toHaveClass('text-subtle');
    expect(within(row).queryByText('Yunid Bauza')).toBeNull();
    expect(row.querySelector('[data-gutter="agent"]')).not.toBeNull();
    expect(within(items()[0]!).getByText('DK')).toBeInTheDocument();
  });

  it('still draws an agent this machine does not know, with the generic glyph', () => {
    seed({ comments: [viaBuilder], total: 1 });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(within(items()[0]!).getByText('via Hive TTY')).toBeInTheDocument();
    expect(items()[0]!.querySelector('[data-gutter="agent"] svg')).not.toBeNull();
  });

  it('draws a person\'s face, even for a comment you wrote in Jira', () => {
    seed({ comments: [comment('104', 'Yunid Bauza', '2026-10-01T14:00:00.000Z', 'mine')], total: 1 });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    expect(within(items()[0]!).getByText('YB')).toBeInTheDocument();
    expect(screen.queryByText('via Hive TTY')).toBeNull();
  });
});

describe('mentions in the reply box (HIVE-216)', () => {
  const box = () => screen.getByRole('combobox', { name: 'Comment on HIVE-7' });

  it('Reply adds the author as a chip, and the post carries it', async () => {
    addJiraComment.mockResolvedValue({ ok: true, value: comment('105', 'Me', '2026-10-01T15:00:00.000Z', 'ok') });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('@Dana Kim')).toBeInTheDocument();

    await userEvent.type(box(), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(addJiraComment).toHaveBeenCalledWith({
      key: 'HIVE-7',
      markdown: 'thanks',
      mentions: [{ accountId: '712020:dana', name: 'Dana Kim' }],
    });
    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(screen.queryByText('@Dana Kim')).toBeNull();
  });

  it('posts a comment that is the chip alone, and only then', async () => {
    addJiraComment.mockResolvedValue({ ok: true, value: comment('106', 'Me', '2026-10-01T15:00:00.000Z', 'x') });
    render(<TicketPageConversation ticketKey="HIVE-7" />);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(addJiraComment).toHaveBeenCalledWith({
      key: 'HIVE-7',
      markdown: '',
      mentions: [{ accountId: '712020:dana', name: 'Dana Kim' }],
    });
  });

  it('× removes the chip; Escape in an empty box clears the chip and the reply', async () => {
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove mention of Dana Kim' }));
    expect(screen.queryByText('@Dana Kim')).toBeNull();

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('@Dana Kim')).toBeNull();
    expect(box()).toHaveAttribute('placeholder', 'Add a comment — markdown works');
  });

  it('Reply on a second comment swaps the chip, so only that author is notified', async () => {
    const lee = { ...comment('108', 'Lee Ro', '2026-10-01T17:00:00.000Z', 'Third words'), authorId: '712020:lee' };
    seed({ comments: [dana, lee], total: 2 });
    addJiraComment.mockResolvedValue({ ok: true, value: comment('109', 'Me', '2026-10-01T18:00:00.000Z', 'ok') });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.click(within(items()[1]!).getByRole('button', { name: 'Reply' }));
    expect(screen.queryByText('@Dana Kim')).toBeNull();
    expect(screen.getByText('@Lee Ro')).toBeInTheDocument();

    await userEvent.type(box(), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(addJiraComment).toHaveBeenCalledWith({
      key: 'HIVE-7',
      markdown: 'thanks',
      mentions: [{ accountId: '712020:lee', name: 'Lee Ro' }],
    });
  });

  it('Reply on an agent\'s comment, or one with no author id, adds no chip', async () => {
    const viaAcr: JiraComment = { ...acr, authorId: '712020:me', via: { agent: 'acr' } };
    seed({ comments: [viaAcr, comment('107', 'Old', '2026-10-01T16:00:00.000Z', 'no id')], total: 2 });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.click(within(items()[1]!).getByRole('button', { name: 'Reply' }));

    expect(screen.queryByRole('button', { name: /Remove mention/ })).toBeNull();
    expect(box()).toHaveAttribute('placeholder', 'Reply to Old…');
  });

  it('keeps the draft and the chips when Jira refuses', async () => {
    addJiraComment.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Jira refused it' } });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await userEvent.click(within(items()[0]!).getByRole('button', { name: 'Reply' }));
    await userEvent.type(box(), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText('Jira refused it')).toBeInTheDocument();
    expect(screen.getByText('@Dana Kim')).toBeInTheDocument();
    expect(box()).toHaveValue('draft');
  });
});

describe('the @ picker (HIVE-216)', () => {
  const box = () => screen.getByRole('combobox', { name: 'Comment on HIVE-7' });
  /*
    `shouldAdvanceTime`, as notification-card.test.tsx does: Testing Library's
    async wrapper waits on a zero timeout, which a frozen clock never fires.
    The debounce restarts on every keystroke, so the few real milliseconds a
    typed string takes never reach 250; the test advances those by hand.
  */
  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const people = [
    { accountId: '712020:carla', displayName: 'Carla Ruiz' },
    { accountId: '712020:cam', displayName: 'Cam Mendes' },
  ];

  it('searches 250ms after @ and two characters, and Enter picks into a chip without sending', async () => {
    searchJiraUsers.mockResolvedValue({ ok: true, value: people });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await user().type(box(), 'thanks @ca');
    expect(searchJiraUsers).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchJiraUsers).toHaveBeenCalledTimes(1);
    expect(searchJiraUsers).toHaveBeenCalledWith({ query: 'ca' });

    const list = await screen.findByRole('listbox', { name: 'Mention someone' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    expect(box()).toHaveAttribute('aria-expanded', 'true');

    await user().keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('@Cam Mendes')).toBeInTheDocument();
    expect(box()).toHaveValue('thanks ');
    expect(addJiraComment).not.toHaveBeenCalled();
  });

  it('asks once for the newest query while typing fast', async () => {
    searchJiraUsers.mockResolvedValue({ ok: true, value: people });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await user().type(box(), '@car');
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(searchJiraUsers).toHaveBeenCalledTimes(1);
    expect(searchJiraUsers).toHaveBeenCalledWith({ query: 'car' });
  });

  it('Escape closes the list and keeps the text', async () => {
    searchJiraUsers.mockResolvedValue({ ok: true, value: people });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await user().type(box(), '@ca');
    await act(() => vi.advanceTimersByTimeAsync(250));
    await screen.findByRole('listbox');
    await user().keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveValue('@ca');
  });

  it('says it could not search, in one line, and the box keeps working', async () => {
    searchJiraUsers.mockResolvedValue({ ok: false, error: { kind: 'timeout', message: 'slow' } });
    render(<TicketPageConversation ticketKey="HIVE-7" />);

    await user().type(box(), '@ca');
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(await screen.findByText('Could not search Jira')).toBeInTheDocument();
    await user().type(box(), 'rl');
    expect(box()).toHaveValue('@carl');
  });
});
