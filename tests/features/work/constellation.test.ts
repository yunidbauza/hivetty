import { describe, expect, it } from 'vitest';

import type { LinkArcs, LinkedTicket } from '@/lib/ticket-links';
import { layoutConstellation, shortKey, spread } from '@features/work/constellation';
import type { JiraStatusCategory } from '@shared/jira-contract';

const t = (key: string, statusCategory: JiraStatusCategory = 'todo'): LinkedTicket => ({ key, summary: `${key} title`, status: 'S', statusCategory });
const arcs = (over: Partial<LinkArcs>): LinkArcs => {
  const base = { waitsOn: [], blocks: [], relates: [], ...over };
  return { ...base, total: base.waitsOn.length + base.blocks.length + base.relates.length };
};
const angles = (cells: { angle: number }[]) => cells.map((cell) => Math.round(cell.angle));

const normal = arcs({ waitsOn: [t('HIVE-188', 'done')], blocks: [{ ...t('HIVE-194'), next: t('HIVE-196') }], relates: [t('HIVE-179', 'done')] });

describe('spread', () => {
  it('centres, 26° apart, never wider than the arc; past six, five and a rest', () => {
    expect(spread([1], -150, -30).map((s) => s.angle)).toEqual([-90]);
    expect(spread([1, 2], 30, 150).map((s) => s.angle)).toEqual([77, 103]);
    const seven = spread([1, 2, 3, 4, 5, 6, 7], -150, -30);
    expect(seven.map((s) => s.angle)).toEqual([-150, -126, -102, -78, -54, -30]);
    expect(seven.at(-1)?.item).toEqual({ rest: 2 });
  });
});

describe('shortKey', () => {
  it("drops the ticket's own project prefix only", () => {
    expect(shortKey('HIVE-188', 'HIVE-193')).toBe('188');
    expect(shortKey('INCORP-598', 'HIVE-196')).toBe('INCORP-598');
  });
});

describe('layoutConstellation — the artifact densities', () => {
  it('normal (HIVE-193): cell radius 11, one done blocker above, one blocked below with its second hop', () => {
    const layout = layoutConstellation({ me: 'HIVE-193', arcs: normal, epicLabel: null, pr: null });
    expect(layout.centre).toMatchObject({ x: 148, y: 150, r: 26, label: '193', blocked: false });
    expect(layout.cells.map((c) => [c.label, c.arc, Math.round(c.angle), c.r, c.state])).toEqual([
      ['188', 'waitsOn', -90, 11, 'done'],
      ['194', 'blocks', 90, 11, 'todo'],
    ]);
    expect(layout.hops).toHaveLength(1);
    expect(layout.hops[0]).toMatchObject({ label: '196', r: 9, angle: 116 });
    expect(layout.edges.map((e) => e.kind)).toEqual(['in', 'out', 'far']);
  });

  it('simple (HIVE-212): an open blocker is amber, its arrow hot, the centre blocked', () => {
    const layout = layoutConstellation({ me: 'HIVE-212', arcs: arcs({ waitsOn: [t('HIVE-209', 'in-progress')], blocks: [t('HIVE-214')] }), epicLabel: null, pr: null });
    expect(layout.cells[0]).toMatchObject({ label: '209', state: 'prog', open: true });
    expect(layout.edges[0]?.kind).toBe('in-open');
    expect(layout.centre.blocked).toBe(true);
  });

  it('many blockers (HIVE-196): five cells and "+2", radius 9, other-project key whole', () => {
    const by = [t('HIVE-188', 'done'), t('HIVE-190', 'done'), t('HIVE-193', 'in-progress'), t('HIVE-194'), t('HIVE-195', 'in-progress'), t('INCORP-598', 'done'), t('HIVE-199')];
    const layout = layoutConstellation({ me: 'HIVE-196', arcs: arcs({ waitsOn: by, blocks: [t('HIVE-201')], relates: [t('HIVE-170', 'done')] }), epicLabel: null, pr: null });
    const upper = layout.cells.filter((c) => c.arc === 'waitsOn');
    expect(angles(upper)).toEqual([-150, -126, -102, -78, -54, -30]);
    expect(upper.map((c) => c.label)).toEqual(['188', '190', '193', '194', '195', '+2']);
    expect(upper.at(-1)).toMatchObject({ state: 'rest', rest: 2, open: false });
    expect(upper.every((c) => c.r === 9)).toBe(true);
  });

  it('blocks many (HIVE-140): a lower arc of six, no second hop at eight links', () => {
    const blocks = [t('HIVE-141', 'done'), t('HIVE-142', 'done'), t('HIVE-143', 'in-progress'), t('HIVE-144', 'in-progress'), t('HIVE-145'), { ...t('HIVE-146'), next: t('HIVE-147') }];
    const layout = layoutConstellation({ me: 'HIVE-140', arcs: arcs({ waitsOn: [t('HIVE-111', 'done')], blocks, relates: [t('HIVE-124', 'done')] }), epicLabel: null, pr: null });
    expect(angles(layout.cells.filter((c) => c.arc === 'blocks'))).toEqual([30, 54, 78, 102, 126, 150]);
    expect(layout.hops).toEqual([]);
  });
});

describe('beads, PR and the ring label', () => {
  it('normal: one labelled bead at 180°, "relates" under it, the PR at −12° on 102, the epic label above', () => {
    const layout = layoutConstellation({ me: 'HIVE-193', arcs: normal, epicLabel: "HIVE-161 · The Hive's workflow · 9/14", pr: 313 });
    expect(layout.beads).toHaveLength(1);
    expect(layout.beads[0]).toMatchObject({ angle: 180, label: '179', state: 'done' });
    expect(layout.relatesLabel?.text).toBe('relates');
    expect(layout.pr).toMatchObject({ label: '#313', r: 10 });
    expect(Math.round(layout.pr!.x)).toBe(Math.round(148 + 102 * Math.cos((-12 * Math.PI) / 180)));
    expect(layout.edges.at(-1)?.kind).toBe('pr');
    expect(layout.epicLabel).toMatchObject({ x: 148, y: 14, text: "HIVE-161 · The Hive's workflow · 9/14" });
  });

  it('many related (INCORP-586): eight unlabelled beads 16° apart, "relates · 8", other-project keys whole', () => {
    const relates = [t('INCORP-585'), t('INCORP-589', 'in-progress'), t('INCORP-570', 'done'), t('INCORP-571', 'done'), t('INCORP-574', 'done'), t('HIVE-193', 'in-progress'), t('INCORP-590'), t('INCORP-592')];
    const layout = layoutConstellation({ me: 'INCORP-586', arcs: arcs({ blocks: [t('INCORP-601')], relates }), epicLabel: null, pr: 412 });
    expect(layout.beads.map((b) => Math.round(b.angle))).toEqual([124, 140, 156, 172, 188, 204, 220, 236]);
    expect(layout.beads.every((b) => b.label === undefined)).toBe(true);
    expect(layout.beads[5]?.ticket.key).toBe('HIVE-193');
    expect(layout.relatesLabel?.text).toBe('relates · 8');
    expect(layout.cells[0]?.label).toBe('601');
  });

  it('two or three labelled beads: "relates" sits under the lowest key, never on one', () => {
    for (const relates of [[t('A-2'), t('A-3')], [t('A-2'), t('A-3'), t('A-4')]]) {
      const layout = layoutConstellation({ me: 'A-1', arcs: arcs({ relates }), epicLabel: null, pr: null });
      const lowest = Math.max(...layout.beads.map((b) => b.labelAt!.y));
      expect(layout.relatesLabel!.y).toBeGreaterThanOrEqual(lowest + 12);
    }
    const one = layoutConstellation({ me: 'A-1', arcs: arcs({ relates: [t('A-2')] }), epicLabel: null, pr: null });
    expect(one.relatesLabel?.x).toBeCloseTo(30);
    expect(one.relatesLabel?.y).toBeCloseTo(172);
  });

  it('no relates, no PR, no epic: none of them drawn', () => {
    const layout = layoutConstellation({ me: 'A-1', arcs: arcs({ waitsOn: [t('A-2')] }), epicLabel: null, pr: null });
    expect(layout.beads).toEqual([]);
    expect(layout.relatesLabel).toBeNull();
    expect(layout.pr).toBeNull();
    expect(layout.epicLabel).toBeNull();
  });
});
