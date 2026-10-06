import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LinkArcs, LinkedTicket } from '@/lib/ticket-links';
import { TicketConstellation } from '@features/work/components/ticket-constellation';
import type { JiraStatusCategory } from '@shared/jira-contract';

/** The Ticket tab's constellation SVG (HIVE-202). */

const t = (key: string, statusCategory: JiraStatusCategory = 'todo'): LinkedTicket => ({ key, summary: `${key} title`, status: 'S', statusCategory });
const arcs = (over: Partial<LinkArcs>): LinkArcs => {
  const base = { waitsOn: [], blocks: [], relates: [], ...over };
  return { ...base, total: base.waitsOn.length + base.blocks.length + base.relates.length };
};

const normal = arcs({ waitsOn: [t('HIVE-188', 'done')], blocks: [{ ...t('HIVE-194'), next: t('HIVE-196') }], relates: [t('HIVE-179', 'done')] });

const draw = (over: { arcs?: LinkArcs; epicLabel?: string | null; pr?: number | null } = {}) => {
  const onOpenTicket = vi.fn();
  const onOpenArc = vi.fn();
  const view = render(
    <TicketConstellation
      me="HIVE-193"
      arcs={over.arcs ?? normal}
      epicLabel={over.epicLabel ?? null}
      pr={over.pr ?? null}
      onOpenTicket={onOpenTicket}
      onOpenArc={onOpenArc}
    />,
  );
  return { ...view, onOpenTicket, onOpenArc };
};

describe('TicketConstellation (HIVE-202)', () => {
  it('names every cell, hop and bead as KEY — summary · Status, with the same hover title', () => {
    draw();

    for (const key of ['HIVE-188', 'HIVE-194', 'HIVE-196', 'HIVE-179']) {
      const name = `${key} — ${key} title · S`;
      const node = screen.getByRole('button', { name });
      expect(node.querySelector('title')).toHaveTextContent(name);
    }
  });

  it("colours each arrowhead as its edge: amber into an open blocker, subtle elsewhere", () => {
    const { container } = draw({ arcs: arcs({ waitsOn: [t('HIVE-209', 'in-progress'), t('HIVE-188', 'done')], blocks: [t('HIVE-194')] }) });
    const marker = (edge: string) => {
      const ref = container.querySelector(`[data-edge="${edge}"]`)?.getAttribute('marker-end') ?? '';
      const id = /^url\(#(.+)\)$/.exec(ref)?.[1] ?? '';
      return container.querySelector(`marker[id="${id}"]`);
    };

    for (const [edge, tone] of [['in-open', 'text-amber-text'], ['in', 'text-subtle'], ['out', 'text-subtle']] as const) {
      expect(marker(edge)).toHaveClass(tone);
      expect(marker(edge)?.querySelector('path')).toHaveAttribute('fill', 'currentColor');
    }
  });

  it('opens a cell on click and a bead on Enter or Space', async () => {
    const { onOpenTicket } = draw();

    await userEvent.click(screen.getByRole('button', { name: 'HIVE-188 — HIVE-188 title · S' }));
    expect(onOpenTicket).toHaveBeenLastCalledWith('HIVE-188');

    const bead = screen.getByRole('button', { name: 'HIVE-179 — HIVE-179 title · S' });
    fireEvent.keyDown(bead, { key: 'Enter' });
    expect(onOpenTicket).toHaveBeenLastCalledWith('HIVE-179');
    fireEvent.keyDown(bead, { key: 'Tab' });
    expect(onOpenTicket).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(bead, { key: ' ' });
    expect(onOpenTicket).toHaveBeenCalledTimes(3);
  });

  it("opens the rest cell's arc", async () => {
    const by = ['HIVE-180', 'HIVE-181', 'HIVE-182', 'HIVE-183', 'HIVE-184', 'HIVE-185', 'HIVE-186'].map((key) => t(key, 'done'));
    const { onOpenArc } = draw({ arcs: arcs({ waitsOn: by }) });

    const rest = screen.getByRole('button', { name: '2 more' });
    await userEvent.click(rest);
    expect(onOpenArc).toHaveBeenCalledWith('waitsOn');
    fireEvent.keyDown(rest, { key: 'Enter' });
    fireEvent.keyDown(rest, { key: 'x' });
    expect(onOpenArc).toHaveBeenCalledTimes(2);
  });

  it('draws the centre amber while a blocker is open, green otherwise', () => {
    const { container, rerender } = draw();
    const centre = () => container.querySelector('[data-blocked]');
    expect(centre()).toHaveAttribute('data-blocked', 'false');
    expect(centre()).toHaveClass('text-green');

    rerender(
      <TicketConstellation
        me="HIVE-193"
        arcs={arcs({ waitsOn: [t('HIVE-209', 'in-progress')], blocks: [t('HIVE-214')], relates: [t('HIVE-1'), t('HIVE-2', 'in-progress')] })}
        epicLabel={null}
        pr={null}
        onOpenTicket={vi.fn()}
        onOpenArc={vi.fn()}
      />,
    );
    expect(centre()).toHaveAttribute('data-blocked', 'true');
    expect(centre()).toHaveClass('text-amber-text');
    expect(container.querySelector('[data-edge="in-open"]')).toHaveClass('text-amber-text');
  });

  it('draws the epic label and the PR only when given', () => {
    const { container, unmount } = draw();
    expect(screen.queryByText('#313')).not.toBeInTheDocument();
    expect(container.querySelector('[data-edge="pr"]')).toBeNull();
    expect(screen.queryByText(/HIVE-161/)).not.toBeInTheDocument();
    unmount();

    draw({ epicLabel: "HIVE-161 · The Hive's workflow · 9/14", pr: 313 });
    expect(screen.getByText("HIVE-161 · The Hive's workflow · 9/14")).toBeInTheDocument();
    expect(screen.getByText('#313')).toBeInTheDocument();
  });

  it('colours through currentColor, never a raw hex', () => {
    const { container } = draw({ epicLabel: 'E', pr: 313 });

    expect(container.innerHTML).not.toMatch(/(fill|stroke)="#/);
  });
});
