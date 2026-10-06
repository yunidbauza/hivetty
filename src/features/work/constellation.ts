import { type BlockedTicket, type LinkArcs, type LinkedTicket, SECOND_HOP_MAX_LINKS } from '@/lib/ticket-links';

import type { JiraStatusCategory } from '@shared/jira-contract';

/**
 * The Ticket tab's constellation, as numbers (HIVE-202). A port of the design
 * artifact's `constellation()` (round 8, v18): the ticket at the centre of its
 * epic's ring, what it waits on on the upper arc, what waits on it on the
 * lower, related tickets as beads on the ring's left, its PR to the right.
 * The component draws exactly this; nothing here knows about the DOM.
 */

export const VIEW = { width: 296, height: 300 } as const;
export const CENTRE = { x: 148, y: 150 } as const;

const ARC_R = 80;
const RING_R = 128;
const CENTRE_R = 26;
const HOP_R = 114;
const HOP_CELL_R = 9;
const STEP = 26;
const BEAD_STEP = 16;
const BEAD_SPAN = 130;
const BEAD_LABEL_MAX = 3;
const PR_R = 102;
const PR_CELL_R = 10;
const PR_ANGLE = -12;
const ARC_MAX = 6;
const UPPER: [number, number] = [-150, -30];
const LOWER: [number, number] = [30, 150];

export interface Point {
  x: number;
  y: number;
}

export type CellState = 'done' | 'prog' | 'todo';

export interface Cell extends Point {
  arc: 'waitsOn' | 'blocks';
  angle: number;
  r: number;
  state: CellState | 'rest';
  /** A waits-on ticket not done: amber. */
  open: boolean;
  label: string;
  labelAt: Point;
  ticket?: LinkedTicket;
  /** The rest cell's hidden count. */
  rest?: number;
}

export interface HopCell extends Point {
  angle: number;
  r: number;
  state: CellState;
  label: string;
  labelAt: Point;
  ticket: LinkedTicket;
}

export interface Bead extends Point {
  angle: number;
  state: CellState;
  ticket: LinkedTicket;
  /** Only while there are BEAD_LABEL_MAX beads or fewer. */
  label?: string;
  labelAt?: Point;
}

export interface Edge {
  from: Point;
  to: Point;
  kind: 'in' | 'in-open' | 'out' | 'far' | 'pr';
}

export interface ConstellationInput {
  /** The ticket's own key. */
  me: string;
  arcs: LinkArcs;
  epicLabel: string | null;
  /** The session's PR number, or null. */
  pr: number | null;
}

export interface ConstellationLayout {
  ring: Point & { r: number };
  epicLabel: (Point & { text: string }) | null;
  centre: Point & { r: number; label: string; blocked: boolean };
  cells: Cell[];
  hops: HopCell[];
  edges: Edge[];
  beads: Bead[];
  relatesLabel: (Point & { text: string }) | null;
  pr: (Point & { r: number; label: string; labelAt: Point }) | null;
}

export const STATE: Record<JiraStatusCategory, CellState> = { done: 'done', 'in-progress': 'prog', todo: 'todo' };

const rad = (degrees: number) => (degrees * Math.PI) / 180;

export const polar = (angle: number, r: number): Point => ({
  x: CENTRE.x + r * Math.cos(rad(angle)),
  y: CENTRE.y + r * Math.sin(rad(angle)),
});

/** Keys in the ticket's own project drop the prefix: 188, not HIVE-188. */
export function shortKey(key: string, me: string): string {
  const project = me.split('-')[0] ?? '';
  return key.startsWith(`${project}-`) ? key.slice(project.length + 1) : key;
}

/** An arc's angles: centred, STEP apart, never wider than the arc; past six, five and a rest. */
export function spread<T>(items: readonly T[], from: number, to: number): { item: T | { rest: number }; angle: number }[] {
  if (items.length === 0) return [];
  const shown: (T | { rest: number })[] =
    items.length > ARC_MAX ? [...items.slice(0, ARC_MAX - 1), { rest: items.length - (ARC_MAX - 1) }] : [...items];
  const n = shown.length;
  const mid = (from + to) / 2;
  const span = Math.min(to - from, (n - 1) * STEP);
  return shown.map((item, i) => ({ item, angle: n === 1 ? mid : mid - span / 2 + (span / (n - 1)) * i }));
}

const isRest = (item: unknown): item is { rest: number } =>
  typeof item === 'object' && item !== null && 'rest' in item;

export function layoutConstellation(input: ConstellationInput): ConstellationLayout {
  const { me, arcs } = input;
  const r = arcs.total > 7 ? 9 : 11;
  const cells: Cell[] = [];
  const hops: HopCell[] = [];
  const edges: Edge[] = [];

  const cell = (item: LinkedTicket | { rest: number }, angle: number, arc: Cell['arc']): Cell => {
    const at = polar(angle, ARC_R);
    const up = arc === 'waitsOn';
    if (isRest(item)) {
      return { ...at, arc, angle, r, state: 'rest', open: false, label: `+${String(item.rest)}`, labelAt: { x: at.x, y: at.y + 4 }, rest: item.rest };
    }
    const state = STATE[item.statusCategory];
    return {
      ...at,
      arc,
      angle,
      r,
      state,
      open: up && state !== 'done',
      label: shortKey(item.key, me),
      labelAt: { x: at.x, y: up ? at.y - r - 6 : at.y + r + 13 },
      ticket: item,
    };
  };

  for (const { item, angle } of spread(arcs.waitsOn, ...UPPER)) {
    const one = cell(item, angle, 'waitsOn');
    cells.push(one);
    edges.push({ from: { x: one.x, y: one.y + r }, to: polar(angle, 30), kind: one.open ? 'in-open' : 'in' });
  }

  for (const { item, angle } of spread<BlockedTicket>(arcs.blocks, ...LOWER)) {
    const one = cell(item, angle, 'blocks');
    cells.push(one);
    edges.push({ from: polar(angle, 28), to: { x: one.x, y: one.y - r - 1 }, kind: 'out' });
    const next = isRest(item) ? undefined : item.next;
    if (next !== undefined && arcs.total <= SECOND_HOP_MAX_LINKS) {
      const hop = polar(angle + STEP, HOP_R);
      hops.push({
        ...hop,
        angle: angle + STEP,
        r: HOP_CELL_R,
        state: STATE[next.statusCategory],
        label: shortKey(next.key, me),
        labelAt: { x: hop.x + 14, y: hop.y + 4 },
        ticket: next,
      });
      edges.push({ from: { x: one.x + 8, y: one.y + 4 }, to: { x: hop.x - 8, y: hop.y - 3 }, kind: 'far' });
    }
  }

  const beads: Bead[] = [];
  const count = arcs.relates.length;
  const beadSpan = Math.min(BEAD_SPAN, (count - 1) * BEAD_STEP);
  arcs.relates.forEach((ticket, i) => {
    const angle = count === 1 ? 180 : 180 - beadSpan / 2 + (beadSpan / (count - 1)) * i;
    const at = polar(angle, RING_R);
    beads.push({
      ...at,
      angle,
      state: STATE[ticket.statusCategory],
      ticket,
      ...(count <= BEAD_LABEL_MAX ? { label: shortKey(ticket.key, me), labelAt: { x: at.x + 10, y: at.y + 4 } } : {}),
    });
  });
  const left = polar(180, RING_R);
  const relatesLabel =
    count === 0
      ? null
      : count <= BEAD_LABEL_MAX
        ? // Under the lowest key: two or three beads put a key where one bead's caption would sit.
          { x: left.x + 10, y: Math.max(...beads.map((bead) => bead.labelAt?.y ?? left.y)) + 18, text: 'relates' }
        : { x: left.x + 12, y: left.y + 4, text: `relates · ${String(count)}` };

  let pr: ConstellationLayout['pr'] = null;
  if (input.pr !== null) {
    const at = polar(PR_ANGLE, PR_R);
    pr = { ...at, r: PR_CELL_R, label: `#${String(input.pr)}`, labelAt: { x: at.x, y: at.y - 15 } };
    edges.push({ from: { x: CENTRE.x + 27, y: CENTRE.y - 5 }, to: { x: at.x - 10, y: at.y + 3 }, kind: 'pr' });
  }

  return {
    ring: { ...CENTRE, r: RING_R },
    epicLabel: input.epicLabel === null ? null : { x: CENTRE.x, y: 14, text: input.epicLabel },
    centre: { ...CENTRE, r: CENTRE_R, label: shortKey(me, me), blocked: cells.some((one) => one.open) },
    cells,
    hops,
    edges,
    beads,
    relatesLabel,
    pr,
  };
}
