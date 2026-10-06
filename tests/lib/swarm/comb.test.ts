import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CellState,
  type CombInput,
  type CombLayout,
  COMB_W,
  drawComb,
  type Flyer,
  flyerCount,
  hitTest,
  isCalm,
  layoutComb,
  newFlyer,
  seededRng,
  stepFlyers,
  stillFlyers,
  SWARM,
  syncFlyers,
} from '@lib/swarm/comb';
import { createSpine, drawMuta, spineNodes } from '@lib/swarm/muta';
import type { SwarmPalette } from '@lib/swarm/palette';
import { coloursUsed, recordingContext } from '@tests/support/canvas-2d';

vi.mock('@lib/swarm/muta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/swarm/muta')>();
  return { ...actual, drawMuta: vi.fn(actual.drawMuta) };
});

const agent = (id: string, state: CellState): CombInput => ({ id, name: id, project: SWARM, state });
const cell = (id: string, project: string, state: CellState): CombInput => ({ id, name: id, project, state });

/** The design's busy afternoon: 3 projects, 6 agents. */
const BUSY: CombInput[] = [
  agent('shipper', 'summons'), agent('fixer', 'failed'), agent('builder', 'summons'),
  agent('slack', 'summons'), agent('pr-patrol', 'summons'), agent('acr', 'morphing'),
  cell('hive-193-history-spec', 'the-hive', 'morphing'), cell('inbox-redesign', 'the-hive', 'summons'),
  cell('explorer-tree', 'the-hive', 'burrowed'), cell('INCORP-598', 'incorpx-server', 'morphing'),
  cell('INCORP-589', 'incorpx-server', 'morphing'), cell('INCORP-586', 'incorpx-server', 'burrowed'),
  cell('term-5', 'ai-sdk', 'terminal'),
];
const PROJECTS = [
  { id: 'the-hive', name: 'the-hive' }, { id: 'incorpx-server', name: 'incorpx-server' },
  { id: 'ai-sdk', name: 'ai-sdk' }, { id: 'legacy-api', name: 'legacy-api' },
];

const R = 36;
const w = Math.sqrt(3) * R;

describe('layoutComb — normal', () => {
  const layout = layoutComb(BUSY, PROJECTS);

  it('stays normal for the busy fixture, at R 36', () => {
    expect(layout.mode).toBe('normal');
    expect(layout.R).toBe(36);
  });

  it('draws one cell per entity', () => {
    expect(layout.cells.map((c) => c.id).sort()).toEqual(BUSY.map((e) => e.id).sort());
  });

  it('puts the swarm on odd row 3, centred, one empty cell between agents', () => {
    const swarm = layout.cells.filter((c) => c.project === SWARM);
    swarm.forEach((c, i) => {
      expect(c.x).toBeCloseTo((6 + 2 * i) * w + w / 2);
      expect(c.y).toBeCloseTo(3 * 1.5 * R + 14);
    });
  });

  it('lays patches on row 7 in config order, three columns apart', () => {
    const xs = (project: string) => layout.cells.filter((c) => c.project === project).map((c) => (c.x - w / 2) / w);
    expect(xs('the-hive').map(Math.round)).toEqual([2, 4, 6]);
    expect(xs('incorpx-server').map(Math.round)).toEqual([9, 11, 13]);
    expect(xs('ai-sdk').map(Math.round)).toEqual([16]);
    expect(layout.cells.find((c) => c.id === 'term-5')!.y).toBeCloseTo(7 * 1.5 * R + 14);
  });

  it('gives a project with nothing live no patch', () => {
    expect(layout.patches.map((p) => p.project)).toEqual([SWARM, 'the-hive', 'incorpx-server', 'ai-sdk']);
  });

  it('labels the swarm and each patch above its top cell', () => {
    const swarm = layout.patches[0]!;
    expect(swarm.label).toBe('THE SWARM');
    expect(swarm.y).toBeCloseTo(3 * 1.5 * R + 14 - R - 9);
    expect(layout.patches[1]!.label).toBe('THE-HIVE');
  });

  it('fills the canvas with a background grid', () => {
    expect(layout.grid.length).toBeGreaterThan(200);
  });

  it("keeps a cell's phase across a relayout", () => {
    const again = layoutComb([...BUSY].reverse(), PROJECTS);
    const phase = (l: typeof layout) => l.cells.find((c) => c.id === 'acr')!.phase;
    expect(phase(again)).toBe(phase(layout));
    expect(phase(layout)).toBeGreaterThanOrEqual(0);
    expect(phase(layout)).toBeLessThan(6);
  });

  it('caps a normal patch at seven, the seventh a "+N" rest cell', () => {
    const many = Array.from({ length: 9 }, (_, i) => cell(`s${i}`, 'the-hive', 'burrowed'));
    const l = layoutComb(many, PROJECTS);
    const rest = l.cells.find((c) => c.kind === 'rest')!;
    expect(l.cells).toHaveLength(7);
    expect(rest).toMatchObject({ id: 'rest:the-hive', name: '+3', more: 3, project: 'the-hive' });
  });

  it('fits inside the canvas', () => {
    for (const c of layout.cells) expect(c.x + R).toBeLessThanOrEqual(COMB_W);
  });
});

/** The design's heavy day: 12 projects, 14 agents. */
const HEAVY_COUNTS: [string, number][] = [
  ['the-hive', 5], ['incorpx-server', 6], ['incorpx', 4], ['ai-sdk', 2], ['apfm-provider-scraper', 3], ['aps', 3],
  ['incorpx-customer-onboarding-portal', 2], ['legacy-api', 1], ['billing-svc', 3], ['docs-site', 1], ['infra', 2], ['mobile-app', 4],
];
const HEAVY_STATES: CellState[] = ['morphing', 'burrowed', 'summons', 'morphing', 'terminal', 'burrowed'];
const heavy = (counts: [string, number][], agents = 14): { entities: CombInput[]; projects: { id: string; name: string }[] } => ({
  entities: [
    ...Array.from({ length: agents }, (_, i) => agent(`agent-${i}`, i % 4 === 0 ? 'summons' : i % 4 === 1 ? 'failed' : 'morphing')),
    ...counts.flatMap(([p, n]) => Array.from({ length: n }, (_, k) => cell(`${p}-${k}`, p, HEAVY_STATES[k % HEAVY_STATES.length]!))),
  ],
  projects: counts.map(([id]) => ({ id, name: id })),
});

describe('layoutComb — at scale', () => {
  const { entities, projects } = heavy(HEAVY_COUNTS);
  const layout = layoutComb(entities, projects);
  const r = 21;
  const ws = Math.sqrt(3) * r;
  const at = (c: number, row: number) => ({ x: c * ws + (row & 1 ? ws / 2 : 0), y: row * 1.5 * r + 14 });

  it('switches to scale for the heavy fixture, at R 21', () => {
    expect(layout.mode).toBe('scale');
    expect(layout.R).toBe(21);
  });

  it('switches when there are more than seven agents, even with room', () => {
    expect(layoutComb([...Array.from({ length: 8 }, (_, i) => agent(`a${i}`, 'morphing'))], []).mode).toBe('scale');
  });

  it('switches when the normal layout does not fit the canvas', () => {
    const wide = heavy([['p1', 7], ['p2', 7], ['p3', 7]], 0);
    expect(layoutComb(wide.entities, wide.projects).mode).toBe('scale');
  });

  it('stacks the swarm as two staggered rows of seven', () => {
    const swarm = layout.cells.filter((c) => c.project === SWARM);
    expect(swarm).toHaveLength(14);
    expect(swarm[0]).toMatchObject(at(12, 4));
    expect(swarm[6]).toMatchObject(at(24, 4));
    expect(swarm[7]).toMatchObject(at(13, 6));
  });

  it('nests each project as a 2×2 patch, six per row', () => {
    const first = layout.cells.filter((c) => c.project === 'the-hive');
    expect(first.map(({ x, y }) => ({ x, y }))).toEqual([at(2, 9), at(3, 9), at(2, 10), at(3, 10)]);
    expect(layout.cells.find((c) => c.project === 'incorpx-customer-onboarding-portal')).toMatchObject(at(2, 13));
  });

  it('caps a patch at four, the fourth "+N" (N = count − 3), the most urgent first', () => {
    const cells = layout.cells.filter((c) => c.project === 'incorpx-server');
    expect(cells).toHaveLength(4);
    expect(cells[3]).toMatchObject({ kind: 'rest', name: '+3', more: 3 });
    expect(cells.slice(0, 3).map((c) => c.state)).toEqual(['summons', 'morphing', 'morphing']);
  });

  it('truncates patch names to 18 characters', () => {
    expect(layout.patches.find((p) => p.project === 'incorpx-customer-onboarding-portal')!.label).toBe('INCORPX-CUSTOMER-…');
  });

  it('folds projects past twelve into one "+N projects" cell, keeping the urgent ones', () => {
    const counts: [string, number][] = [...HEAVY_COUNTS, ['zz-urgent', 1]];
    const many = heavy(counts);
    many.entities = many.entities.map((e) => (e.project === 'zz-urgent' ? { ...e, state: 'summons' } : e));
    const l = layoutComb(many.entities, many.projects);
    expect(l.cells.find((c) => c.id === 'rest:*')).toMatchObject({ project: '*', name: '+2', more: 2, ...at(32, 13) });
    expect(l.cells.some((c) => c.project === 'zz-urgent')).toBe(true);
  });

  it('turns a fifteenth agent into a "+N" swarm cell', () => {
    const l = layoutComb(heavy([['p', 1]], 16).entities, [{ id: 'p', name: 'p' }]);
    expect(l.cells.find((c) => c.id === 'rest:swarm')).toMatchObject({ name: '+3', more: 3 });
  });
});

const fixed = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
const flyer = (over: Partial<Flyer> = {}): Flyer => ({
  x: 100, y: 100, a: 0, k: 0, leg: 1, target: null, turn: 0, spine: createSpine(100, 100, 0), ...over,
});

describe('flyers', () => {
  const busy = layoutComb(BUSY, PROJECTS);
  const swarmTarget = busy.cells.find((c) => c.id === 'acr')!; // morphing, in the swarm
  const projectTargets = busy.cells.filter((c) => c.project !== SWARM && (c.state === 'morphing' || c.state === 'summons'));

  it('counts 9 normally, 14 at scale, 5 when nothing needs you', () => {
    expect(flyerCount(busy, 5)).toBe(9);
    expect(flyerCount(busy, 0)).toBe(5);
    expect(flyerCount({ ...busy, mode: 'scale' }, 5)).toBe(14);
  });

  it('alternates legs: arriving at a swarm cell sends it to a project', () => {
    const f = flyer({ x: swarmTarget.x, y: swarmTarget.y - 18, leg: 1, target: swarmTarget.id });
    const [next] = stepFlyers([f], busy, 1 / 60, fixed(0), false);
    expect(next!.leg).toBe(0);
    expect(projectTargets.map((c) => c.id)).toContain(next!.target);
  });

  it('retargets when its target cell is gone', () => {
    const [next] = stepFlyers([flyer({ target: 'gone', leg: 0 })], busy, 1 / 60, fixed(0), false);
    expect(next).toMatchObject({ leg: 1, target: 'shipper' }); // the first summoning agent
  });

  it('wanders to random points when no cell is working or summoning (D9)', () => {
    const resting = layoutComb([cell('a', 'the-hive', 'burrowed')], PROJECTS);
    expect(isCalm(resting, 3)).toBe(true);
    expect(flyerCount(resting, 3)).toBe(5);
    const [next] = stepFlyers([flyer()], resting, 1 / 60, fixed(0.5), true);
    expect(next!.target).toEqual({ x: COMB_W * 0.5, y: 60 + 0.5 * (520 - 120) });
  });

  it('flies at 108 px/s, 66 when calm, and clamps a long frame', () => {
    // One target cell straight ahead (18 px above it is the flyer's own height).
    const straight = { ...busy, cells: [{ ...swarmTarget, x: 10_000, y: 118 }] };
    const go = (dt: number, calm: boolean) =>
      stepFlyers([flyer({ target: swarmTarget.id, leg: 1 })], straight, dt, fixed(0), calm)[0]!;
    expect(go(1 / 60, false).x - 100).toBeCloseTo(1.8);
    expect(go(1 / 60, true).x - 100).toBeCloseTo(1.1);
    expect(go(1, false).x - 100).toBeCloseTo(108 / 15);
  });

  it('is frame-rate independent: one 1/30 step steers like two 1/60 steps would at a fixed bearing', () => {
    const target = { ...swarmTarget, x: 100, y: 10_000 + 18 }; // straight down: bearing π/2
    const l = { ...busy, cells: [target] };
    const [once] = stepFlyers([flyer({ target: target.id, leg: 1 })], l, 1 / 30, fixed(0), false);
    expect(once!.a).toBeCloseTo((Math.PI / 2) * (1 - 0.965 ** 2), 5);
    expect(once!.turn).toBeCloseTo(once!.a / (1 / 30), 5);
  });

  it('syncs the flock to a new count, keeping the flyers it has', () => {
    const rng = seededRng(1);
    const three = syncFlyers([], 3, rng);
    expect(syncFlyers(three, 5, rng).slice(0, 3)).toEqual(three);
    expect(syncFlyers(three, 2, rng)).toEqual(three.slice(0, 2));
    expect(newFlyer(2, fixed(0)).k).toBeCloseTo(3.4);
  });

  it('carries each spine along: after 0.5s its head is the flyer', () => {
    let flock = syncFlyers([], 3, seededRng(2));
    for (let i = 0; i < 30; i++) flock = stepFlyers(flock, busy, 1 / 60, seededRng(i), false);
    for (const f of flock) {
      const [hx, hy] = spineNodes(f.spine)[0]!;
      expect(hx).toBeCloseTo(f.x, 6);
      expect(hy).toBeCloseTo(f.y, 6);
    }
  });

  it('warms each still spine straight in behind its flyer', () => {
    for (const f of stillFlyers(busy, 5)) {
      const nodes = spineNodes(f.spine);
      expect(nodes[0]![0]).toBeCloseTo(f.x, 6);
      expect(nodes[0]![1]).toBeCloseTo(f.y, 6);
      const back = Math.atan2(nodes[0]![1] - nodes[10]![1], nodes[0]![0] - nodes[10]![0]);
      expect(Math.abs(Math.atan2(Math.sin(back - f.a), Math.cos(back - f.a)))).toBeLessThan(0.05);
    }
  });

  it('places a still frame deterministically', () => {
    expect(stillFlyers(busy, 5)).toEqual(stillFlyers(busy, 5));
    expect(stillFlyers(busy, 5)).toHaveLength(9);
  });

  it('hit-tests within 24 logical px of a cell centre', () => {
    expect(hitTest(busy, swarmTarget.x + 20, swarmTarget.y)?.id).toBe('acr');
    expect(hitTest(busy, swarmTarget.x + 30, swarmTarget.y)).toBeNull();
  });
});

const PALETTE: SwarmPalette = {
  bg: 'c-bg', panel2: 'c-panel2', ink: 'c-ink', muted: 'c-muted', subtle: 'c-subtle',
  brand: 'c-brand', green: 'c-green', amber: 'c-amber', red: 'c-red', creep: 'c-creep',
  creepClear: 'c-creep-clear', chitin: 'c-chitin', carapace: 'c-carapace',
  tissueDeep: 'c-tissue-deep', tissue: 'c-tissue', tissueLit: 'c-tissue-lit',
  glowCore: 'c-glow-core', ground: 'c-ground', membrane: 'c-membrane', maw: 'c-maw',
  gum: 'c-gum', stain: 'c-stain', glint: 'c-glint',
};

describe('drawComb', () => {
  const draw = (layout: CombLayout, flyers: Flyer[] = []) => {
    const { ctx, calls } = recordingContext();
    drawComb(ctx, layout, flyers, 2.5, PALETTE);
    return { ctx, calls, texts: calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]) };
  };

  it('clears to bg first and leaves alpha at 1', () => {
    const { calls, ctx } = draw(layoutComb(BUSY, PROJECTS));
    expect(calls.find((c) => c.op === 'fillRect')?.args).toEqual([0, 0, COMB_W, 520]);
    expect(calls.find((c) => c.op === 'set:fillStyle')?.args).toEqual(['c-bg']);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('paints only with palette colours, or the tone formatted from them', () => {
    const allowed = new Set(Object.values(PALETTE));
    const { calls } = draw(layoutComb(BUSY, PROJECTS), stillFlyers(layoutComb(BUSY, PROJECTS), 5));
    for (const colour of coloursUsed(calls)) {
      expect(allowed.has(colour as string) || /^rgba\(/.test(colour as string), String(colour)).toBe(true);
    }
  });

  it('names every cell under it, truncated to 14, in the normal layout', () => {
    const { texts } = draw(layoutComb(BUSY, PROJECTS));
    expect(texts).toContain('hive-193-hist…');
    expect(texts).toContain('THE SWARM');
  });

  it('tags only Summons and Failed cells at scale', () => {
    const l = layoutComb(heavy(HEAVY_COUNTS).entities, heavy(HEAVY_COUNTS).projects);
    const { texts } = draw(l);
    expect(texts).toContain('agent-0'); // summons
    expect(texts).toContain('agent-1'); // failed
    expect(texts).not.toContain('agent-2'); // morphing
  });

  it('rings the focused cell in brand, and nothing without one (HIVE-223)', () => {
    const layout = layoutComb([agent('s1', 'morphing')], []);
    const ringed = (focusedId: string | null) => {
      const { ctx, calls } = recordingContext();
      drawComb(ctx, layout, [], 0, PALETTE, 1, focusedId);
      // The recorder keeps no per-call state, so replay the style setters up to each stroke.
      let lineWidth: unknown = 1;
      let strokeStyle: unknown;
      let count = 0;
      for (const c of calls) {
        if (c.op === 'set:lineWidth') lineWidth = c.args[0];
        if (c.op === 'set:strokeStyle') strokeStyle = c.args[0];
        if (c.op === 'stroke' && lineWidth === 2 && strokeStyle === PALETTE.brand) count += 1;
      }
      return count;
    };
    expect(ringed(null)).toBe(0);
    expect(ringed('s1')).toBe(1);
  });

  describe('the flyers', () => {
    beforeEach(() => {
      vi.mocked(drawMuta).mockClear();
    });

    it('draws one Brood mutalisk per flyer, on its own spine and clock', () => {
      const l = layoutComb(BUSY, PROJECTS);
      const flyers = stillFlyers(l, 5);
      draw(l, flyers);
      const placed = vi.mocked(drawMuta).mock.calls;
      expect(placed).toHaveLength(9);
      placed.forEach(([, spine, t, k, turn, scale], i) => {
        expect(spine).toBe(flyers[i]!.spine);
        expect(t).toBe(2.5);
        expect(k).toBeCloseTo(flyers[i]!.k * 3.7);
        expect(turn).toBe(flyers[i]!.turn);
        expect(scale).toBeCloseTo(0.108);
      });
    });

    it('keeps the small-screen ratio at scale, and passes the device scale through', () => {
      const l = layoutComb(heavy(HEAVY_COUNTS).entities, heavy(HEAVY_COUNTS).projects);
      const { ctx } = recordingContext();
      drawComb(ctx, l, stillFlyers(l, 5), 1, PALETTE, 2);
      const [, , , , , scale, ps] = vi.mocked(drawMuta).mock.calls[0]!;
      expect(scale).toBeCloseTo(0.108 * 0.7);
      expect(ps).toBe(2);
    });
  });
});
