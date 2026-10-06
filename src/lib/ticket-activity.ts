import type { SessionStatus } from '@/types/entity';
import type { TicketPr } from '@/types/pull-request';
import type { Ticket } from '@/types/ticket';

import { parseTitleTags } from '@lib/ticket-tags';
import type { JiraStatusCategory } from '@shared/jira-contract';
import type { BuildProgress } from '@shared/ledger-derive';

/**
 * The Work panel's grouping and each row's one-line fact (HIVE-203).
 *
 * The fact is the ticket's own rule order, **first match wins**: someone
 * waiting on you, then review findings, then an agent's progress, then a
 * working session, then idle ones, then nothing. Each is the most urgent thing
 * a person could do about the ticket, so only the top one earns the line.
 *
 * A status that differs from its group's label leads the fact (`In Review ·
 * 2 findings on #412`): the group only says the category, and a workflow's own
 * status inside it — In Review, Blocked — is what the user would otherwise
 * have to open the ticket to learn.
 */

export type TicketTone = 'amber' | 'green' | 'ring';

export interface TicketActivityInput {
  ticket: Ticket;
  /** The statuses of the live sessions on the ticket. */
  sessions: readonly SessionStatus[];
  prs: readonly TicketPr[];
  progress: BuildProgress | undefined;
}

export interface TicketRowModel {
  ticket: Ticket;
  /** The title with its leading tags dropped. */
  title: string;
  tone: TicketTone;
  fact: string;
}

export interface TicketGroup {
  category: JiraStatusCategory;
  label: string;
  rows: TicketRowModel[];
}

export const GROUP_LABEL: Record<JiraStatusCategory, string> = {
  'in-progress': 'In progress',
  todo: 'To do',
  done: 'Done',
};

const ORDER: JiraStatusCategory[] = ['in-progress', 'todo', 'done'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function fact({ sessions, prs, progress }: TicketActivityInput): string {
  if (sessions.includes('waiting')) return 'waiting on you';
  const flagged = prs.find((p) => p.findings > 0);
  if (flagged) return `${plural(flagged.findings, 'finding', 'findings')} on #${flagged.n}`;
  if (progress) {
    return `${progress.from} · ${progress.task === undefined ? progress.stage : `task ${progress.task} done`}`;
  }
  if (sessions.includes('working')) return 'session working';
  const idle = sessions.filter((s) => s === 'idle').length;
  if (idle > 0) return plural(idle, 'idle session', 'idle sessions');
  return 'no session';
}

/** Amber needs you; green is somebody, person or agent, working it (D12); ring is quiet. */
function tone({ ticket, sessions, prs, progress }: TicketActivityInput): TicketTone {
  if (sessions.includes('waiting') || prs.some((p) => p.findings > 0)) return 'amber';
  if (sessions.includes('working') || (progress !== undefined && ticket.statusCategory !== 'done')) {
    return 'green';
  }
  return 'ring';
}

export function ticketRow(input: TicketActivityInput): TicketRowModel {
  const { ticket } = input;
  const label = GROUP_LABEL[ticket.statusCategory].toLowerCase();
  const lead = ticket.status.toLowerCase() === label ? '' : `${ticket.status} · `;
  return { ticket, title: parseTitleTags(ticket.title).title, tone: tone(input), fact: `${lead}${fact(input)}` };
}

/** In progress, To do, Done; empty groups dropped; rows keep the query's order. */
export function groupTickets(rows: readonly TicketRowModel[]): {
  groups: TicketGroup[];
  total: number;
  needYou: number;
} {
  const groups = ORDER.map((category) => ({
    category,
    label: GROUP_LABEL[category],
    rows: rows.filter((r) => r.ticket.statusCategory === category),
  })).filter((group) => group.rows.length > 0);
  return { groups, total: rows.length, needYou: rows.filter((r) => r.tone === 'amber').length };
}
