import { describe, expect, it } from 'vitest';

import type { TicketPr } from '@/types/pull-request';
import type { Ticket } from '@/types/ticket';
import { groupTickets, ticketRow, type TicketActivityInput } from '@lib/ticket-activity';

/** The Work panel row's fact and tone, one test per rule and each tie (HIVE-203). */

const t = (over: Partial<Ticket> = {}): Ticket => ({
  key: 'HIVE-1',
  status: 'In Progress',
  statusCategory: 'in-progress',
  title: 'T',
  priority: null,
  assignee: null,
  ...over,
});
const pr = (n: number, findings: number): TicketPr => ({ n, repo: 'a/b', state: 'open', findings, url: '', session: null });
const row = (over: Partial<TicketActivityInput>) =>
  ticketRow({ ticket: t(), sessions: [], prs: [], progress: undefined, ...over });

describe('ticketRow (HIVE-203)', () => {
  it('waiting beats findings', () =>
    expect(row({ sessions: ['waiting'], prs: [pr(4, 2)] })).toMatchObject({ fact: 'waiting on you', tone: 'amber' }));
  it('findings beat progress', () =>
    expect(row({ prs: [pr(412, 2)], progress: { from: 'builder', stage: 'build' } })).toMatchObject({
      fact: '2 findings on #412',
      tone: 'amber',
    }));
  it('one finding is singular', () => expect(row({ prs: [pr(412, 1)] }).fact).toBe('1 finding on #412'));
  it('a PR without findings says nothing', () => expect(row({ prs: [pr(412, 0)] })).toMatchObject({ fact: 'no session', tone: 'ring' }));
  it('progress beats a working session', () =>
    expect(row({ sessions: ['working'], progress: { from: 'fixer', stage: 'fix' } })).toMatchObject({
      fact: 'fixer · fix',
      tone: 'green',
    }));
  it('progress with a task', () =>
    expect(row({ progress: { from: 'builder', stage: 'build', task: 3 } }).fact).toBe('builder · task 3 done'));
  it('working beats idle', () =>
    expect(row({ sessions: ['idle', 'working'] })).toMatchObject({ fact: 'session working', tone: 'green' }));
  it('idle counts', () => {
    expect(row({ sessions: ['idle'] }).fact).toBe('1 idle session');
    expect(row({ sessions: ['idle', 'idle'] }).fact).toBe('2 idle sessions');
  });
  it('idle is not green', () => expect(row({ sessions: ['idle'] }).tone).toBe('ring'));
  it('no session', () => expect(row({})).toMatchObject({ fact: 'no session', tone: 'ring' }));
  it('agent progress on a done ticket is not green', () =>
    expect(
      row({ ticket: t({ statusCategory: 'done', status: 'Done' }), progress: { from: 'builder', stage: 'build' } }).tone,
    ).toBe('ring'));
  it('a status unlike its group leads the fact', () =>
    expect(row({ ticket: t({ status: 'In Review' }), prs: [pr(412, 2)] }).fact).toBe('In Review · 2 findings on #412'));
  it('a status matching its group, any case, does not', () =>
    expect(row({ ticket: t({ status: 'IN PROGRESS' }) }).fact).toBe('no session'));
  it('drops title tags', () => expect(row({ ticket: t({ title: '[BE][P4]-Drafter' }) }).title).toBe('Drafter'));
});

describe('groupTickets (HIVE-203)', () => {
  it('groups in order, drops empty groups, keeps query order, counts need-you', () => {
    const rows = [
      row({ ticket: t({ key: 'A', statusCategory: 'todo', status: 'To Do' }) }),
      row({ ticket: t({ key: 'B' }), sessions: ['waiting'] }),
      row({ ticket: t({ key: 'C' }) }),
    ];
    const out = groupTickets(rows);
    expect(out.groups.map((g) => [g.category, g.label, g.rows.map((r) => r.ticket.key)])).toEqual([
      ['in-progress', 'In progress', ['B', 'C']],
      ['todo', 'To do', ['A']],
    ]);
    expect(out).toMatchObject({ total: 3, needYou: 1 });
  });

  it('puts done last', () => {
    const out = groupTickets([
      row({ ticket: t({ key: 'D', statusCategory: 'done', status: 'Done' }) }),
      row({ ticket: t({ key: 'A', statusCategory: 'todo', status: 'To Do' }) }),
    ]);
    expect(out.groups.map((g) => g.category)).toEqual(['todo', 'done']);
  });
});
