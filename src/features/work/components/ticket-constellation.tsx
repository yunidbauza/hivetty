import { type KeyboardEvent, type ReactNode, useId, useMemo } from 'react';

import type { LinkArcs, LinkedTicket } from '@/lib/ticket-links';
import { cn } from '@/lib/utils';

import { type CellState, type Edge, layoutConstellation, type Point, VIEW } from '@features/work/constellation';

/** A pointy-top hexagon's points around (x, y). */
const hex = (x: number, y: number, r: number) =>
  [30, 90, 150, 210, 270, 330]
    .map((a) => `${(x + r * Math.cos((a * Math.PI) / 180)).toFixed(1)},${(y + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`)
    .join(' ');

/** Colour by state, through tokens (D9): fill and stroke are currentColor. */
const TONE: Record<CellState | 'rest', string> = {
  done: 'text-green',
  prog: 'text-green',
  todo: 'text-subtle',
  rest: 'text-subtle',
};

const BEAD_TONE: Record<CellState, string> = {
  done: 'text-brand',
  prog: 'text-green',
  todo: 'text-subtle',
};

/** An edge's tone, which its arrowhead shares: amber only into an open blocker. */
const edgeTone = (kind: Edge['kind']) => (kind === 'in-open' ? 'text-amber-text' : 'text-subtle');
const ARROW_TONES = ['text-amber-text', 'text-subtle'] as const;

/** The spec draws beads at radius 5; the layout carries only their centres. */
const BEAD_R = 5;

const describe = (ticket: LinkedTicket) => `${ticket.key} — ${ticket.summary} · ${ticket.status}`;

/** Enter or Space, the keys a `role="button"` answers. */
const pressed = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

function Node({
  ticket,
  onOpen,
  className,
  children,
}: {
  ticket: LinkedTicket;
  onOpen: (key: string) => void;
  className: string;
  children: ReactNode;
}) {
  const open = () => onOpen(ticket.key);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={describe(ticket)}
      onClick={open}
      onKeyDown={(event) => {
        if (pressed(event)) open();
      }}
      className={cn('cursor-pointer', className)}
    >
      <title>{describe(ticket)}</title>
      {children}
    </g>
  );
}

const Label = ({ at, text, className }: { at: Point; text: string; className?: string }) => (
  <text x={at.x} y={at.y} textAnchor="middle" className={cn('fill-current tabular-nums text-micro', className)}>
    {text}
  </text>
);

/**
 * The Ticket tab's links as a constellation (HIVE-202). Draws exactly what
 * `layoutConstellation` answers; every cell, hop and bead opens its ticket on
 * Work, the rest cell opens its arc's list (D7).
 */
export function TicketConstellation({
  me,
  arcs,
  epicLabel,
  pr,
  onOpenTicket,
  onOpenArc,
}: {
  me: string;
  arcs: LinkArcs;
  epicLabel: string | null;
  pr: number | null;
  onOpenTicket: (key: string) => void;
  onOpenArc: (arc: 'waitsOn' | 'blocks') => void;
}) {
  const layout = useMemo(() => layoutConstellation({ me, arcs, epicLabel, pr }), [me, arcs, epicLabel, pr]);
  // Two constellations on one screen must not share marker ids.
  const arrowId = `cc-arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${String(VIEW.width)} ${String(VIEW.height)}`}
      className="h-[272px] w-full"
      aria-label={`Links of ${me}`}
      role="group"
    >
      <defs>
        {/* One marker per tone: Chromium does not paint fill="context-stroke", and a marker's
            currentColor is its own, not the edge's. */}
        {ARROW_TONES.map((tone) => (
          <marker
            key={tone}
            id={`${arrowId}-${tone}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
            className={tone}
          >
            <path d="M0 0L8 4L0 8z" fill="currentColor" />
          </marker>
        ))}
      </defs>
      <circle
        cx={layout.ring.x}
        cy={layout.ring.y}
        r={layout.ring.r}
        fill="none"
        stroke="currentColor"
        strokeDasharray="3 5"
        className="text-subtle"
        opacity={0.6}
      />
      {layout.epicLabel ? (
        <text
          x={layout.epicLabel.x}
          y={layout.epicLabel.y}
          textAnchor="middle"
          className="fill-current text-micro text-brand"
        >
          {layout.epicLabel.text}
        </text>
      ) : null}
      {layout.edges.map((edge, i) => (
        <line
          // Edges have no identity of their own; their order is the layout's.
          key={i}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="currentColor"
          strokeWidth={1.2}
          strokeDasharray={edge.kind === 'pr' ? '1 3' : undefined}
          opacity={edge.kind === 'far' ? 0.45 : 1}
          markerEnd={edge.kind === 'pr' ? undefined : `url(#${arrowId}-${edgeTone(edge.kind)})`}
          className={edgeTone(edge.kind)}
          data-edge={edge.kind}
        />
      ))}
      {layout.cells.map((cell) =>
        cell.ticket === undefined ? (
          <g
            key={`rest-${cell.arc}`}
            role="button"
            tabIndex={0}
            aria-label={`${String(cell.rest)} more`}
            onClick={() => onOpenArc(cell.arc)}
            onKeyDown={(event) => {
              if (pressed(event)) onOpenArc(cell.arc);
            }}
            className="cursor-pointer text-subtle"
          >
            <polygon points={hex(cell.x, cell.y, cell.r)} fill="none" stroke="currentColor" strokeDasharray="2 2" />
            <Label at={cell.labelAt} text={cell.label} className="font-semibold text-ink" />
          </g>
        ) : (
          <Node
            key={cell.ticket.key}
            ticket={cell.ticket}
            onOpen={onOpenTicket}
            className={cell.open ? 'text-amber-text' : TONE[cell.state]}
          >
            <polygon
              points={hex(cell.x, cell.y, cell.r)}
              stroke="currentColor"
              fill="currentColor"
              fillOpacity={cell.open ? 0.16 : cell.state === 'prog' ? 0.3 : 0}
              strokeDasharray={cell.state === 'todo' && !cell.open ? '2 2' : undefined}
            />
            {cell.state === 'done' ? (
              <path
                d={`M${String(cell.x - 4)} ${String(cell.y)}l3 3 5-6`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              />
            ) : null}
            <Label at={cell.labelAt} text={cell.label} className={cell.open ? undefined : 'text-muted'} />
          </Node>
        ),
      )}
      {layout.hops.map((hop) => (
        <Node
          key={`hop-${hop.ticket.key}`}
          ticket={hop.ticket}
          onOpen={onOpenTicket}
          className={cn(TONE[hop.state], 'opacity-60')}
        >
          <polygon
            points={hex(hop.x, hop.y, hop.r)}
            stroke="currentColor"
            fill="none"
            strokeDasharray={hop.state === 'todo' ? '2 2' : undefined}
          />
          <text x={hop.labelAt.x} y={hop.labelAt.y} className="fill-current tabular-nums text-micro text-muted">
            {hop.label}
          </text>
        </Node>
      ))}
      {layout.beads.map((bead) => (
        <Node key={`bead-${bead.ticket.key}`} ticket={bead.ticket} onOpen={onOpenTicket} className={BEAD_TONE[bead.state]}>
          <circle
            cx={bead.x}
            cy={bead.y}
            r={BEAD_R}
            stroke="currentColor"
            strokeWidth={1.3}
            fill="currentColor"
            fillOpacity={bead.state === 'prog' ? 0.3 : 0}
            strokeDasharray={bead.state === 'todo' ? '2 2' : undefined}
          />
          {bead.label && bead.labelAt ? (
            <text x={bead.labelAt.x} y={bead.labelAt.y} className="fill-current tabular-nums text-micro text-muted">
              {bead.label}
            </text>
          ) : null}
        </Node>
      ))}
      {layout.relatesLabel ? (
        <text x={layout.relatesLabel.x} y={layout.relatesLabel.y} className="fill-current text-micro text-subtle">
          {layout.relatesLabel.text}
        </text>
      ) : null}
      {layout.pr ? (
        <g className="text-subtle">
          <circle cx={layout.pr.x} cy={layout.pr.y} r={layout.pr.r} fill="none" stroke="currentColor" strokeWidth={1.3} />
          <Label at={layout.pr.labelAt} text={layout.pr.label} className="text-muted" />
        </g>
      ) : null}
      <g
        data-blocked={layout.centre.blocked}
        className={layout.centre.blocked ? 'text-amber-text drop-shadow-[0_0_8px_currentColor]' : 'text-green'}
      >
        <polygon
          points={hex(layout.centre.x, layout.centre.y, layout.centre.r)}
          stroke="currentColor"
          fill="currentColor"
          fillOpacity={0.16}
        />
        <Label
          at={{ x: layout.centre.x, y: layout.centre.y + 4 }}
          text={layout.centre.label}
          className="text-micro font-semibold text-ink"
        />
      </g>
    </svg>
  );
}
