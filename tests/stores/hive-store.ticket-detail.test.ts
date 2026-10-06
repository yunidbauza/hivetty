import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SECOND_HOP_MAX_LINKS } from '@lib/ticket-links';
import { BRIDGE_ERROR } from '@lib/utils';
import { TICKET_DETAIL_CAP, useHiveStore, useTicketLinks } from '@stores/hive-store';
import type { JiraComment, JiraIssue, JiraIssueDetail, JiraLink, JiraTransition } from '@shared/jira-contract';
import type { LedgerEntry } from '@shared/ledger-contract';

/**
 * The ticket detail slice (HIVE-203), keyed by issue key (HIVE-202).
 *
 * `lib/jira` is mocked: what is under test is how each answer merges, that one
 * failed read never blanks another, that the map holds at most
 * TICKET_DETAIL_CAP tickets, and that a late answer for an evicted key is dropped.
 */

const readJiraDetail = vi.fn();
const readJiraComments = vi.fn();
const readJiraTransitions = vi.fn();
const readJiraIssue = vi.fn();
const readJiraLinks = vi.fn();
const searchJiraIssues = vi.fn();

vi.mock('@/lib/jira', () => ({
  readJiraStatus: () => Promise.resolve(null),
  searchJiraIssues: (request: unknown) => searchJiraIssues(request),
  readJiraDetail: (request: unknown) => readJiraDetail(request),
  readJiraComments: (request: unknown) => readJiraComments(request),
  readJiraTransitions: (request: unknown) => readJiraTransitions(request),
  readJiraIssue: (request: unknown) => readJiraIssue(request),
  readJiraLinks: (request: unknown) => readJiraLinks(request),
}));

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });

const detail: JiraIssueDetail = { description: [], parent: { key: 'HIVE-194', summary: 'Epic' } };
const comment = (id: string): JiraComment => ({ id, author: 'Dana Kim', created: '2026-10-01T10:00:00.000Z', body: [] });
const transition: JiraTransition = { id: '31', name: 'Done', to: { name: 'Done', statusCategory: 'done' } };
const entry: LedgerEntry = { id: '20261002-100000-0001', ts: 1, from: 'builder', kind: 'post', body: 'x', meta: { ticket: 'HIVE-7' } };
const issue: JiraIssue = {
  key: 'HIVE-8',
  summary: '[BE] Remote ticket',
  status: 'To Do',
  statusCategory: 'todo',
  issueType: 'Story',
  priority: 'High',
  assignee: null,
  updated: '2026-10-01T00:00:00.000-0400',
  url: 'https://behiques.atlassian.net/browse/HIVE-8',
};

const ledgerList = vi.fn();
const state = () => useHiveStore.getState();

/** A promise whose resolution the test controls. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const allOk = () => {
  readJiraDetail.mockResolvedValue(ok(detail));
  readJiraComments.mockResolvedValue(ok({ comments: [comment('1')], total: 3 }));
  readJiraTransitions.mockResolvedValue(ok([transition]));
  readJiraIssue.mockResolvedValue(ok(issue));
  readJiraLinks.mockResolvedValue(ok([]));
  searchJiraIssues.mockResolvedValue(ok({ issues: [], capped: false }));
};

beforeEach(() => {
  vi.clearAllMocks();
  state().reset();
  ledgerList.mockResolvedValue({ entries: [entry], openAsks: [], claims: {} });
  window.hive = { ledger: { list: ledgerList } } as unknown as NonNullable<Window['hive']>;
  useHiveStore.setState({
    tickets: [
      { key: 'HIVE-7', status: 'In Progress', statusCategory: 'in-progress', title: 'Open', priority: null, assignee: null },
    ],
  });
  allOk();
});

afterEach(() => {
  delete (window as { hive?: unknown }).hive;
});

describe('loadTicketDetail (HIVE-203)', () => {
  it('merges every part for a listed ticket, without re-reading the issue', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');

    expect(state().ticketDetails['HIVE-7']).toMatchObject({
      key: 'HIVE-7',
      detail,
      comments: [comment('1')],
      total: 3,
      transitions: [transition],
      history: [entry],
      problems: {},
    });
    expect(typeof state().ticketDetails['HIVE-7']?.readAt).toBe('number');
    expect(readJiraComments).toHaveBeenCalledWith({ key: 'HIVE-7', newest: true });
    expect(ledgerList).toHaveBeenCalledWith({ ticket: 'HIVE-7' });
    expect(readJiraIssue).not.toHaveBeenCalled();
  });

  it('reads the issue when the key is not in the list', async () => {
    await state().loadTicketDetail('HIVE-8', 'page');

    expect(readJiraIssue).toHaveBeenCalledWith({ key: 'HIVE-8' });
    expect(state().ticketDetails['HIVE-8']?.issue).toMatchObject({
      key: 'HIVE-8',
      title: '[BE] Remote ticket',
      priority: 'High',
      issueType: 'Story',
    });
  });

  it('records a failed comments read without blanking the detail', async () => {
    readJiraComments.mockResolvedValue(fail('boom'));
    await state().loadTicketDetail('HIVE-7', 'page');

    expect(state().ticketDetails['HIVE-7']?.problems.comments).toBe('boom');
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(detail);
  });

  it('names a missing bridge as the problem', async () => {
    readJiraComments.mockResolvedValue(null);
    readJiraDetail.mockResolvedValue(null);
    await state().loadTicketDetail('HIVE-7', 'page');

    expect(state().ticketDetails['HIVE-7']?.problems).toEqual({ comments: BRIDGE_ERROR, detail: BRIDGE_ERROR });
  });

  it('keeps what it had when a reload of the same key fails, and clears a problem that recovered', async () => {
    readJiraDetail.mockResolvedValue(fail('first'));
    await state().loadTicketDetail('HIVE-7', 'page');
    expect(state().ticketDetails['HIVE-7']?.problems.detail).toBe('first');

    readJiraDetail.mockResolvedValue(ok(detail));
    readJiraComments.mockResolvedValue(fail('boom'));
    await state().loadTicketDetail('HIVE-7', 'page');

    expect(state().ticketDetails['HIVE-7']?.comments).toEqual([comment('1')]);
    expect(state().ticketDetails['HIVE-7']?.problems).toEqual({ comments: 'boom' });
  });

  it('keeps two tickets side by side (HIVE-202, D2)', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    await state().loadTicketDetail('HIVE-8', 'tab');
    expect(Object.keys(state().ticketDetails)).toEqual(['HIVE-7', 'HIVE-8']);
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(detail);
  });

  it('drops an answer for a key evicted while it was in flight', async () => {
    const late = deferred<ReturnType<typeof ok<JiraIssueDetail>>>();
    readJiraDetail.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'page');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok(detail));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('drops a failed read for a key evicted while it was in flight', async () => {
    const late = deferred<ReturnType<typeof fail>>();
    readJiraComments.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'page');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(fail('late'));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('keeps two keys in flight apart when their answers land in reverse order', async () => {
    const seven = deferred<ReturnType<typeof ok<JiraIssueDetail>>>();
    const eight = deferred<ReturnType<typeof ok<JiraIssueDetail>>>();
    const sevenDetail: JiraIssueDetail = { description: [], parent: { key: 'HIVE-1', summary: 'Seven' } };
    const eightDetail: JiraIssueDetail = { description: [], parent: { key: 'HIVE-2', summary: 'Eight' } };
    readJiraDetail.mockReturnValueOnce(seven.promise).mockReturnValueOnce(eight.promise);
    const first = state().loadTicketDetail('HIVE-7', 'page');
    const second = state().loadTicketDetail('HIVE-8', 'tab');

    eight.resolve(ok(eightDetail));
    await second;
    seven.resolve(ok(sevenDetail));
    await first;

    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(sevenDetail);
    expect(state().ticketDetails['HIVE-8']?.detail).toEqual(eightDetail);
  });

  it(`holds at most ${String(TICKET_DETAIL_CAP)} tickets; a load or refresh makes one the newest`, async () => {
    for (let n = 1; n <= TICKET_DETAIL_CAP; n += 1) await state().loadTicketDetail(`HIVE-${String(n)}`, 'tab');
    await state().refreshTicketDetail('HIVE-1', 'tab');
    await state().loadTicketDetail('HIVE-99', 'tab');
    const keys = Object.keys(state().ticketDetails);
    expect(keys).toHaveLength(TICKET_DETAIL_CAP);
    expect(keys).toContain('HIVE-1');
    expect(keys).not.toContain('HIVE-2');
    expect(keys.at(-1)).toBe('HIVE-99');
  });

  it('refresh of a key never loaded does nothing (the poller runs before the load)', async () => {
    await state().refreshTicketDetail('HIVE-7', 'page');
    expect(state().ticketDetails).toEqual({});
    expect(readJiraDetail).not.toHaveBeenCalled();
  });

  it("'tab' does not read the ledger history; 'page' does", async () => {
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(ledgerList).not.toHaveBeenCalled();
    await state().loadTicketDetail('HIVE-8', 'page');
    expect(ledgerList).toHaveBeenCalledWith({ ticket: 'HIVE-8' });
  });

  it('survives a ledger that rejects, and a missing bridge', async () => {
    ledgerList.mockRejectedValue(new Error('down'));
    await state().loadTicketDetail('HIVE-7', 'page');
    expect(state().ticketDetails['HIVE-7']?.history).toBeUndefined();

    delete (window as { hive?: unknown }).hive;
    await state().loadTicketDetail('HIVE-7', 'page');
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(detail);
  });

  it('is cleared by reset', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    state().reset();
    expect(state().ticketDetails).toEqual({});
  });
});

describe('refreshTicketDetail (HIVE-203)', () => {
  it('re-reads detail, comments and transitions of the open ticket, not its history', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    vi.clearAllMocks();
    readJiraComments.mockResolvedValue(ok({ comments: [comment('1'), comment('2')], total: 4 }));

    await state().refreshTicketDetail('HIVE-7', 'page');

    expect(readJiraDetail).toHaveBeenCalledWith({ key: 'HIVE-7' });
    expect(readJiraComments).toHaveBeenCalledWith({ key: 'HIVE-7', newest: true });
    expect(readJiraTransitions).toHaveBeenCalledWith({ key: 'HIVE-7' });
    expect(ledgerList).not.toHaveBeenCalled();
    expect(readJiraIssue).not.toHaveBeenCalled();
    expect(state().ticketDetails['HIVE-7']).toMatchObject({ comments: [comment('1'), comment('2')], total: 4, history: [entry] });
  });

  it('re-reads the issue only when the slice holds one', async () => {
    await state().loadTicketDetail('HIVE-8', 'page');
    vi.clearAllMocks();

    await state().refreshTicketDetail('HIVE-8', 'page');

    expect(readJiraIssue).toHaveBeenCalledWith({ key: 'HIVE-8' });
  });

  it('does nothing for a key that is not open', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    vi.clearAllMocks();

    await state().refreshTicketDetail('HIVE-8', 'page');

    expect(readJiraDetail).not.toHaveBeenCalled();
    expect(Object.keys(state().ticketDetails)).toEqual(['HIVE-7']);
  });
});

describe('appendTicketComment (HIVE-203)', () => {
  it('pushes the comment and counts it', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    state().appendTicketComment('HIVE-7', comment('9'));

    expect(state().ticketDetails['HIVE-7']?.comments).toEqual([comment('1'), comment('9')]);
    expect(state().ticketDetails['HIVE-7']?.total).toBe(4);
  });

  it('starts from nothing when no comments were read', () => {
    useHiveStore.setState({ ticketDetails: { 'HIVE-7': { key: 'HIVE-7', problems: {} } } });
    state().appendTicketComment('HIVE-7', comment('9'));

    expect(state().ticketDetails['HIVE-7']).toMatchObject({ comments: [comment('9')], total: 1 });
  });

  it('ignores another key', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    const before = state().ticketDetails['HIVE-7'];
    state().appendTicketComment('HIVE-8', comment('9'));

    expect(state().ticketDetails['HIVE-7']).toBe(before);
  });
});

describe('reloadTicketTransitions (HIVE-203)', () => {
  it('replaces the transitions of the open ticket', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    const back: JiraTransition = { id: '11', name: 'Reopen', to: { name: 'To Do', statusCategory: 'todo' } };
    readJiraTransitions.mockResolvedValue(ok([back]));

    await state().reloadTicketTransitions('HIVE-7');

    expect(state().ticketDetails['HIVE-7']?.transitions).toEqual([back]);
  });

  it('drops the answer for a key evicted while the read was in flight', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    const late = deferred<ReturnType<typeof ok<JiraTransition[]>>>();
    readJiraTransitions.mockReturnValueOnce(late.promise);

    const pending = state().reloadTicketTransitions('HIVE-7');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok([transition]));
    await pending;

    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('does nothing for a key that is not open', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    vi.clearAllMocks();

    await state().reloadTicketTransitions('HIVE-8');

    expect(readJiraTransitions).not.toHaveBeenCalled();
  });
});

describe('setTicketDetailIssue (HIVE-203)', () => {
  it('replaces the issue the slice read for itself', async () => {
    await state().loadTicketDetail('HIVE-8', 'page');
    state().setTicketDetailIssue({ ...issue, status: 'Done', statusCategory: 'done' });

    expect(state().ticketDetails['HIVE-8']?.issue).toMatchObject({ key: 'HIVE-8', status: 'Done', statusCategory: 'done' });
  });

  it('leaves a listed ticket to the list, and ignores another key', async () => {
    await state().loadTicketDetail('HIVE-7', 'page');
    const before = state().ticketDetails['HIVE-7'];

    state().setTicketDetailIssue({ ...issue, key: 'HIVE-7' });
    state().setTicketDetailIssue(issue);

    expect(state().ticketDetails['HIVE-7']).toBe(before);
  });
});

const issueLink = (
  key: string,
  linkType: string,
  direction: 'inward' | 'outward',
  statusCategory: 'todo' | 'done' = 'todo',
): JiraLink => ({
  kind: 'issue',
  title: key,
  url: `https://x/browse/${key}`,
  key,
  summary: key,
  status: 'S',
  statusCategory,
  linkType,
  direction,
});
const epicDetail: JiraIssueDetail = { description: [], parent: { key: 'HIVE-161', summary: 'Workflow', issueType: 'Epic' } };

describe("loadTicketDetail(key, 'tab') (HIVE-202)", () => {
  it('reads the links, then each blocked ticket for the second hop, keeping its outward Blocks links', async () => {
    readJiraLinks.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve(
        key === 'HIVE-7'
          ? ok([issueLink('HIVE-194', 'Blocks', 'outward'), issueLink('HIVE-188', 'Blocks', 'inward', 'done')])
          : ok([
              issueLink('HIVE-196', 'Blocks', 'outward'),
              issueLink('HIVE-7', 'Blocks', 'inward'),
              issueLink('HIVE-1', 'Relates', 'outward'),
            ]),
      ),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    await vi.waitFor(() => expect(state().ticketDetails['HIVE-7']?.secondHop).toBeDefined());
    expect(readJiraLinks).toHaveBeenCalledWith({ key: 'HIVE-194' });
    expect(readJiraLinks).not.toHaveBeenCalledWith({ key: 'HIVE-188' });
    expect(state().ticketDetails['HIVE-7']?.links).toHaveLength(2);
    expect(state().ticketDetails['HIVE-7']?.secondHop).toEqual({ 'HIVE-194': [issueLink('HIVE-196', 'Blocks', 'outward')] });
  });

  it('a second-hop read that fails leaves that ticket with no onward links', async () => {
    readJiraLinks.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve(key === 'HIVE-7' ? ok([issueLink('HIVE-194', 'Blocks', 'outward')]) : fail('nope')),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.secondHop).toEqual({ 'HIVE-194': [] });
  });

  it('no second hop when nothing is blocked', async () => {
    readJiraLinks.mockResolvedValue(
      ok([issueLink('HIVE-188', 'Blocks', 'inward'), { kind: 'web', title: 'Doc', url: 'https://x/doc' }]),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(readJiraLinks).toHaveBeenCalledTimes(1);
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeUndefined();
  });

  it(`skips the second hop past ${String(SECOND_HOP_MAX_LINKS)} issue links`, async () => {
    readJiraLinks.mockResolvedValue(
      ok(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'].map((k) => issueLink(k, 'Blocks', 'outward'))),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(readJiraLinks).toHaveBeenCalledTimes(1);
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeUndefined();
  });

  it('a links failure is a problem beside whatever else read', async () => {
    readJiraLinks.mockResolvedValue(fail('no links'));
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.problems.links).toBe('no links');
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(detail);
  });

  it('no bridge for the links is the bridge problem, cleared by the next good read', async () => {
    readJiraLinks.mockResolvedValueOnce(null);
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.problems.links).toBe(BRIDGE_ERROR);
    await state().refreshTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.problems.links).toBeUndefined();
    expect(state().ticketDetails['HIVE-7']?.links).toEqual([]);
  });

  it("counts the epic's children done of total, capped carried", async () => {
    readJiraDetail.mockResolvedValue(ok(epicDetail));
    searchJiraIssues.mockResolvedValue(
      ok({ issues: [{ ...issue, statusCategory: 'done' }, issue, issue], capped: true }),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    await vi.waitFor(() =>
      expect(state().ticketDetails['HIVE-7']?.epicProgress).toEqual({ done: 1, total: 3, capped: true }),
    );
    expect(searchJiraIssues).toHaveBeenCalledWith({ jql: 'parent = HIVE-161' });
  });

  it('a failed progress read leaves no progress', async () => {
    readJiraDetail.mockResolvedValue(ok(epicDetail));
    searchJiraIssues.mockResolvedValue(fail('no search'));
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.epicProgress).toBeUndefined();
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(epicDetail);
  });

  it('no progress read for a non-epic parent, an invalid key, or the page', async () => {
    readJiraDetail.mockResolvedValue(ok({ description: [], parent: { key: 'HIVE-1', summary: 'S', issueType: 'Story' } }));
    await state().loadTicketDetail('HIVE-7', 'tab');
    readJiraDetail.mockResolvedValue(ok({ description: [], parent: { key: 'x) OR 1=1', summary: 'S', issueType: 'Epic' } }));
    await state().loadTicketDetail('HIVE-8', 'tab');
    readJiraDetail.mockResolvedValue(ok(epicDetail));
    await state().loadTicketDetail('HIVE-9', 'page');
    expect(searchJiraIssues).not.toHaveBeenCalled();
    expect(readJiraLinks).not.toHaveBeenCalledWith({ key: 'HIVE-9' });
  });

  it('a refresh past the cap clears the earlier second hop', async () => {
    let mine = [issueLink('HIVE-194', 'Blocks', 'outward')];
    readJiraLinks.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve(key === 'HIVE-7' ? ok(mine) : ok([issueLink('HIVE-196', 'Blocks', 'outward')])),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeDefined();
    mine = [mine[0]!, ...['A-1', 'A-2', 'A-3', 'A-4', 'A-5'].map((k) => issueLink(k, 'Blocks', 'outward'))];
    await state().refreshTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeUndefined();
    const model = renderHook(() => useTicketLinks('HIVE-7')).result.current;
    expect(model?.blocks).toHaveLength(6);
    expect(model?.blocks.some((one) => one.next !== undefined)).toBe(false);
  });

  it('a refresh where nothing is blocked any more clears the earlier second hop', async () => {
    let mine = [issueLink('HIVE-194', 'Blocks', 'outward')];
    readJiraLinks.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve(key === 'HIVE-7' ? ok(mine) : ok([issueLink('HIVE-196', 'Blocks', 'outward')])),
    );
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeDefined();
    mine = [issueLink('HIVE-188', 'Blocks', 'inward')];
    await state().refreshTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.secondHop).toBeUndefined();
  });

  it('a failed progress read on refresh clears the earlier count', async () => {
    readJiraDetail.mockResolvedValue(ok(epicDetail));
    searchJiraIssues.mockResolvedValue(ok({ issues: [issue], capped: false }));
    await state().loadTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.epicProgress).toEqual({ done: 0, total: 1, capped: false });
    searchJiraIssues.mockResolvedValue(fail('no search'));
    await state().refreshTicketDetail('HIVE-7', 'tab');
    expect(state().ticketDetails['HIVE-7']?.epicProgress).toBeUndefined();
  });

  it('no progress read for a key evicted before its detail landed', async () => {
    const late = deferred<ReturnType<typeof ok<JiraIssueDetail>>>();
    readJiraDetail.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'tab');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok(epicDetail));
    await pending;
    expect(searchJiraIssues).not.toHaveBeenCalled();
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('drops a links answer for a key evicted while it was in flight', async () => {
    const late = deferred<ReturnType<typeof ok<JiraLink[]>>>();
    readJiraLinks.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'tab');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok([issueLink('HIVE-194', 'Blocks', 'outward')]));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('drops a failed links answer for a key evicted while it was in flight', async () => {
    const late = deferred<ReturnType<typeof fail>>();
    readJiraLinks.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'tab');
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(fail('late'));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it('drops a second-hop answer for a key evicted while it was in flight', async () => {
    const late = deferred<ReturnType<typeof ok<JiraLink[]>>>();
    readJiraLinks
      .mockResolvedValueOnce(ok([issueLink('HIVE-194', 'Blocks', 'outward')]))
      .mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'tab');
    await vi.waitFor(() => expect(readJiraLinks).toHaveBeenCalledWith({ key: 'HIVE-194' }));
    expect(state().ticketDetails['HIVE-7']?.links).toBeDefined();
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok([issueLink('HIVE-196', 'Blocks', 'outward')]));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });

  it("drops the epic's progress for a key evicted while it was in flight", async () => {
    const late = deferred<ReturnType<typeof ok<{ issues: JiraIssue[]; capped: boolean }>>>();
    readJiraDetail.mockResolvedValue(ok(epicDetail));
    searchJiraIssues.mockReturnValueOnce(late.promise);
    const pending = state().loadTicketDetail('HIVE-7', 'tab');
    await vi.waitFor(() => expect(searchJiraIssues).toHaveBeenCalled());
    expect(state().ticketDetails['HIVE-7']?.detail).toEqual(epicDetail);
    useHiveStore.setState({ ticketDetails: {} });
    late.resolve(ok({ issues: [issue], capped: false }));
    await pending;
    expect(state().ticketDetails['HIVE-7']).toBeUndefined();
  });
});
