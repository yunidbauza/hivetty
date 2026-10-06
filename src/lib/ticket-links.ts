import type { EpicProgress } from '@/types/ticket';

import type { AdfBlock, AdfRun, JiraLink, JiraParentRef, JiraStatusCategory } from '@shared/jira-contract';

/** One linked ticket, as the Ticket tab draws it (HIVE-202). */
export interface LinkedTicket {
  key: string;
  summary: string;
  status: string;
  statusCategory: JiraStatusCategory;
}

/** A ticket this one blocks, with the first ticket it blocks in turn (the second hop). */
export interface BlockedTicket extends LinkedTicket {
  next?: LinkedTicket;
}

export interface LinkArcs {
  /** "is blocked by": the upper arc. */
  waitsOn: LinkedTicket[];
  /** "blocks": the lower arc. */
  blocks: BlockedTicket[];
  /** Every other link type: beads. */
  relates: LinkedTicket[];
  /** Linked tickets; remote links and the PR are not counted. */
  total: number;
}

export type ArcCounts = Record<JiraStatusCategory, number>;

/** The line above the drawing; `lead` is drawn bold. */
export interface Verdict {
  tone: 'amber' | 'green';
  lead: string;
  rest: string;
}

export interface TicketLinksModel extends LinkArcs {
  openBlockers: LinkedTicket[];
  verdict: Verdict;
  counts: Record<'waitsOn' | 'blocks' | 'relates', ArcCounts>;
}

/** The second hop is read, and drawn, only at this many links or fewer. */
export const SECOND_HOP_MAX_LINKS = 5;

/** D5: Jira's link type named "Blocks", whatever its wording. */
export const isBlocks = (link: JiraLink): boolean => link.linkType?.toLowerCase() === 'blocks';

const linked = (link: JiraLink): LinkedTicket | null =>
  link.kind === 'issue' && link.key !== undefined
    ? {
        key: link.key,
        summary: link.summary ?? '',
        status: link.status ?? '',
        statusCategory: link.statusCategory ?? 'todo',
      }
    : null;

const isTicket = (ticket: LinkedTicket | null): ticket is LinkedTicket => ticket !== null;

/** Sort a ticket's links onto the three arcs, in Jira's order. */
export function linkArcs(
  links: readonly JiraLink[],
  secondHop: Readonly<Record<string, readonly JiraLink[]>> = {},
): LinkArcs {
  const arcs: LinkArcs = { waitsOn: [], blocks: [], relates: [], total: 0 };
  for (const link of links) {
    const ticket = linked(link);
    if (ticket === null) continue;
    arcs.total += 1;
    if (!isBlocks(link)) arcs.relates.push(ticket);
    else if (link.direction === 'inward') arcs.waitsOn.push(ticket);
    else {
      const next = (secondHop[ticket.key] ?? []).map(linked).find(isTicket);
      arcs.blocks.push(next === undefined ? ticket : { ...ticket, next });
    }
  }
  return arcs;
}

export function arcCounts(tickets: readonly LinkedTicket[]): ArcCounts {
  const counts: ArcCounts = { todo: 0, 'in-progress': 0, done: 0 };
  for (const ticket of tickets) counts[ticket.statusCategory] += 1;
  return counts;
}

/** The spec's exact copy, every branch singular and plural. */
export function verdict(arcs: LinkArcs): Verdict {
  const open = arcs.waitsOn.filter((ticket) => ticket.statusCategory !== 'done');
  if (open.length > 0) {
    return {
      tone: 'amber',
      lead: `Blocked by ${String(open.length)} open:`,
      rest: ` ${open.map((ticket) => ticket.key).join(', ')}.`,
    };
  }
  const by = arcs.waitsOn.length;
  const head = by === 0 ? 'Nothing blocks it' : by === 1 ? 'Its one blocker is done' : `All ${String(by)} blockers are done`;
  const waiting = arcs.blocks.length;
  const tail =
    waiting === 0 ? '' : waiting === 1 ? '; 1 ticket waits on it' : `; ${String(waiting)} tickets wait on it`;
  return { tone: 'green', lead: 'Clear to go.', rest: ` ${head}${tail}.` };
}

export function ticketLinksModel(
  links: readonly JiraLink[],
  secondHop?: Readonly<Record<string, readonly JiraLink[]>>,
): TicketLinksModel {
  const arcs = linkArcs(links, secondHop);
  return {
    ...arcs,
    openBlockers: arcs.waitsOn.filter((ticket) => ticket.statusCategory !== 'done'),
    verdict: verdict(arcs),
    counts: { waitsOn: arcCounts(arcs.waitsOn), blocks: arcCounts(arcs.blocks), relates: arcCounts(arcs.relates) },
  };
}

/** The acceptance list, else the description, else nothing (HIVE-202). */
export type Criteria =
  | { kind: 'criteria'; items: AdfRun[][] }
  | { kind: 'description'; blocks: AdfBlock[] }
  | null;

const ACCEPTANCE = /^acceptance( criteria)?:?$/i;
const plain = (runs: readonly AdfRun[]) => runs.map((one) => one.text).join('').trim();

/**
 * The list items under the first "Acceptance criteria" / "Acceptance" heading,
 * until a heading of the same or a higher level. No such heading, or one with
 * no list under it: the description itself.
 */
export function parseCriteria(description: readonly AdfBlock[] | undefined): Criteria {
  if (description === undefined || description.length === 0) return null;
  const at = description.findIndex((block) => block.kind === 'heading' && ACCEPTANCE.test(plain(block.runs)));
  if (at !== -1) {
    const level = description[at]?.level ?? 1;
    const items: AdfRun[][] = [];
    for (const block of description.slice(at + 1)) {
      if (block.kind === 'heading' && (block.level ?? 1) <= level) break;
      if (block.kind === 'bullet' || block.kind === 'ordered') items.push(block.runs);
    }
    if (items.length > 0) return { kind: 'criteria', items };
  }
  return { kind: 'description', blocks: [...description] };
}

/** The ring's label: only an epic gets one (D6). */
export function epicLabel(parent: JiraParentRef | null | undefined, progress?: EpicProgress): string | null {
  if (!parent || parent.issueType?.toLowerCase() !== 'epic') return null;
  const head = `${parent.key} · ${parent.summary}`;
  if (progress === undefined) return head;
  return `${head} · ${String(progress.done)}/${String(progress.total)}${progress.capped ? '+' : ''}`;
}
