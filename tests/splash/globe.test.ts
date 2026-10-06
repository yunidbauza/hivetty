import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { drawMuta, spineNodes } from '@lib/swarm/muta';
import type { SwarmPalette } from '@lib/swarm/palette';
import { coloursUsed, recordingContext } from '@tests/support/canvas-2d';

import { LOG_SCHEDULE } from '@/splash/chamber';
import {
  beatsNear,
  chamberAt,
  drawGlobe,
  FLYER_COUNT,
  flyerAt,
  flyerStart,
  GLOBE_CHAMBERS,
  GLOBE_STILL_T,
  lightAt,
  ORBIT_AT,
  orbitPoint,
  pulseAt,
  seedAt,
} from '@/splash/globe';

vi.mock('@lib/swarm/muta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/swarm/muta')>()),
  drawMuta: vi.fn(),
}));

const gap = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('the chambers', () => {
  it('are a hundred, spread through a shell of the volume rather than laid on a sphere', () => {
    expect(GLOBE_CHAMBERS).toHaveLength(100);
    const depths = GLOBE_CHAMBERS.map((c) => Math.hypot(...c.p));
    for (const d of depths) {
      expect(d).toBeGreaterThanOrEqual(0.62);
      expect(d).toBeLessThanOrEqual(0.98);
    }
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.25);
  });

  it('keep a gap between every two, so the volume reads through empty space', () => {
    GLOBE_CHAMBERS.forEach((a, i) =>
      GLOBE_CHAMBERS.slice(i + 1).forEach((b) => expect(gap(a.p, b.p)).toBeGreaterThanOrEqual(0.25)),
    );
  });

  it('turn at more than one pace, the inner layers faster', () => {
    const inner = GLOBE_CHAMBERS.filter((c) => Math.hypot(...c.p) < 0.74).map((c) => c.w);
    const outer = GLOBE_CHAMBERS.filter((c) => Math.hypot(...c.p) >= 0.86).map((c) => c.w);
    expect(Math.min(...inner)).toBeGreaterThan(Math.max(...outer));
    const c = GLOBE_CHAMBERS[20]!;
    expect(chamberAt(c, 4).v[0]).not.toBeCloseTo(chamberAt(c, 5).v[0], 3);
  });

  it('light 4 green and 2 amber, as the log lines say, each on its line or once grown', () => {
    const of = (kind: string) => GLOBE_CHAMBERS.filter((c) => c.kind === kind);
    expect(of('green')).toHaveLength(4);
    expect(of('amber')).toHaveLength(2);
    for (const c of of('green')) expect(c.lit).toBeGreaterThanOrEqual(LOG_SCHEDULE[0]!);
    for (const c of of('amber')) expect(c.lit).toBeGreaterThanOrEqual(LOG_SCHEDULE[3]!);
    for (const c of [...of('green'), ...of('amber')]) expect(c.sealed && c.lit > c.grow).toBe(true);
  });

  it('give each flyer its own sealed chamber, none of them a log line’s', () => {
    const hatcheries = GLOBE_CHAMBERS.filter((c) => c.hatch !== null);
    expect(hatcheries).toHaveLength(FLYER_COUNT);
    for (const c of hatcheries) expect(c.kind === null && c.sealed).toBe(true);
  });

  it('all grow out of the seed by 2.2s, and the heartbeat reaches every one', () => {
    for (const c of GLOBE_CHAMBERS) {
      expect(c.grow).toBeGreaterThanOrEqual(0.5);
      expect(c.grow + 0.55).toBeLessThanOrEqual(2.4);
      expect(Number.isFinite(c.arrives)).toBe(true);
    }
  });
});

describe('the seed', () => {
  it('rises out of the creep to the centre, swells, and is used up', () => {
    expect(seedAt(0).alpha).toBe(0);
    expect(seedAt(0.35).y).toBeGreaterThan(1);
    expect(seedAt(1.1).y).toBeCloseTo(0, 9);
    expect(seedAt(1.4).r).toBeGreaterThan(seedAt(0.5).r);
    expect(seedAt(2.6).alpha).toBe(0);
  });
});

describe('the heartbeat', () => {
  it('first beats when the cluster comes online, strongest then', () => {
    expect(pulseAt(ORBIT_AT - 0.3)).toBeLessThan(0.01);
    expect(pulseAt(ORBIT_AT + 0.02)).toBeGreaterThan(0.9);
    expect(lightAt(ORBIT_AT - 0.1, 0)).toBe(0);
    expect(lightAt(ORBIT_AT + 0.14, 0)).toBeGreaterThan(lightAt(ORBIT_AT + 0.14 + 0.5, 0.5));
  });

  it('keeps beating softly for as long as About stays open', () => {
    const late = 4.75 + 2.45 * 200;
    expect(beatsNear(late).some(([tb]) => tb === late)).toBe(true);
    expect(pulseAt(late)).toBeCloseTo(0.45, 2);
    expect(pulseAt(late + 1.2)).toBeLessThan(0.01);
  });

  it('reaches a chamber later the further it is from the active ones', () => {
    expect(lightAt(ORBIT_AT + 0.14, 0)).toBeGreaterThan(lightAt(ORBIT_AT + 0.14, 0.3));
  });
});

describe('the ring', () => {
  it('is in front at π/2 and behind at 3π/2', () => {
    expect(orbitPoint(Math.PI / 2)[2]).toBeGreaterThan(0);
    expect(orbitPoint((3 * Math.PI) / 2)[2]).toBeLessThan(0);
  });

  it('lights at "hive cluster online"', () => {
    expect(ORBIT_AT).toBe(LOG_SCHEDULE[4]);
  });
});

describe('the flyers', () => {
  it('are seven, one every 0.16s from 2.63s', () => {
    expect(FLYER_COUNT).toBe(7);
    for (let i = 0; i < FLYER_COUNT; i++) expect(flyerStart(i)).toBeCloseTo(2.63 + 0.16 * i, 9);
  });

  it('tear out of their own chamber and climb to their slot in 0.75s', () => {
    for (let i = 0; i < FLYER_COUNT; i++) {
      const home = GLOBE_CHAMBERS.find((c) => c.hatch === flyerStart(i))!;
      const { v } = chamberAt(home, flyerStart(i));
      const k = 1 / (1 - v[2] * 0.16);
      const born = flyerAt(i, flyerStart(i));
      expect(born.x).toBeCloseTo(v[0] * 136 * k, 6);
      expect(born.y).toBeCloseTo(v[1] * 136 * k, 6);
      expect(born.alpha).toBe(0);
      expect(born.grown).toBe(0);
      expect(born.climbing).toBe(true);

      const slot = orbitPoint(-Math.PI / 2 + (i * 2 * Math.PI) / 7);
      const landed = flyerAt(i, flyerStart(i) + 0.75);
      expect(landed.x).toBeCloseTo(slot[0], 6);
      expect(landed.y).toBeCloseTo(slot[1], 6);
      expect(landed.climbing).toBe(false);
      expect(landed.alpha).toBe(1);
    }
  });

  it('circle the ring once landed, behind the comb on its far half', () => {
    const a = flyerAt(0, 4);
    const b = flyerAt(0, 5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    const far = flyerAt(0, flyerStart(0) + 0.75);
    expect(far.z).toBeLessThan(0);
    expect(far.depth).toBeLessThan(-1);
  });

  it('are all out by the still the splash holds under reduced motion', () => {
    expect(GLOBE_STILL_T).toBeGreaterThanOrEqual(flyerStart(FLYER_COUNT - 1) + 0.75);
    for (let i = 0; i < FLYER_COUNT; i++) expect(flyerAt(i, GLOBE_STILL_T).climbing).toBe(false);
  });
});

const PALETTE: SwarmPalette = {
  bg: '#10152a',
  panel2: '#121731',
  ink: '#e9effc',
  muted: '#98a3cc',
  subtle: '#6b779f',
  brand: '#8fa7f2',
  green: '#74b79c',
  amber: '#ffac47',
  red: '#ff8d85',
  creep: '#5b3d8f',
  creepClear: '#5b3d8f00',
  chitin: '#b9a7f0',
  carapace: '#2c2347',
  tissueDeep: '#0b0816',
  tissue: '#2c2346',
  tissueLit: '#8474c0',
  glowCore: '#e2ffee',
  ground: '#141128',
  membrane: '#6b2d5c',
  maw: '#0b0816',
  gum: '#3a1b33',
  stain: '#4a3b2a',
  glint: '#ffffff',
};

describe('drawGlobe', () => {
  const draw = (t: number, palette = PALETTE) => {
    vi.mocked(drawMuta).mockClear();
    const { ctx, calls } = recordingContext();
    drawGlobe(ctx, t, palette);
    return { ctx, calls, count: (op: string) => calls.filter((c) => c.op === op).length };
  };

  it('draws no chamber and no creature before the seed has budded', () => {
    const { count } = draw(0.2);
    expect(count('closePath')).toBe(0);
    expect(drawMuta).not.toHaveBeenCalled();
  });

  it('draws every chamber once the colony has formed, and strokes nothing round the volume', () => {
    const { calls } = draw(3.2);
    expect(calls.filter((c) => c.op === 'closePath').length).toBeGreaterThanOrEqual(GLOBE_CHAMBERS.length * 2);
    // Every arc stroked is a spore or a pore; the volume itself is never outlined.
    calls.forEach((c, i) => {
      if (c.op === 'arc' && calls[i + 1]?.op === 'stroke') expect(c.args[2] as number).toBeLessThan(30);
    });
  });

  it('lights the ring of spores only once it is online', () => {
    expect(draw(2.2).count('ellipse')).toBe(0);
    expect(draw(3).count('ellipse')).toBeGreaterThan(0);
  });

  it('draws all seven flyers at the still, each on its own warmed spine', () => {
    draw(GLOBE_STILL_T);
    expect(drawMuta).toHaveBeenCalledTimes(7);
    for (const call of vi.mocked(drawMuta).mock.calls) {
      const [, spine, t, , turn, scale, , tone] = call;
      const [x, y] = spineNodes(spine)[0]!;
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(t).toBe(GLOBE_STILL_T);
      expect(scale).toBeGreaterThanOrEqual(0.08);
      expect(scale).toBeLessThanOrEqual(0.13);
      expect(Number.isFinite(turn)).toBe(true);
      expect(tone).toMatchObject({ dark: true, lo: expect.any(Array) });
    }
  });

  it('puts each spine head where its flyer is', () => {
    draw(GLOBE_STILL_T);
    const heads = vi.mocked(drawMuta).mock.calls.map(([, spine]) => spineNodes(spine)[0]!);
    const flyers = Array.from({ length: FLYER_COUNT }, (_, i) => flyerAt(i, GLOBE_STILL_T));
    for (const [x, y] of heads) {
      expect(flyers.some((f) => Math.hypot(f.x - x, f.y - y) < 1e-6)).toBe(true);
    }
  });

  it('holds the same still frame on every read', () => {
    draw(GLOBE_STILL_T);
    const first = vi.mocked(drawMuta).mock.calls.map(([, spine]) => spineNodes(spine));
    draw(3.2);
    draw(GLOBE_STILL_T);
    expect(vi.mocked(drawMuta).mock.calls.map(([, spine]) => spineNodes(spine))).toEqual(first);
  });

  it('releases the flyers one at a time, small as they leave their chamber', () => {
    draw(flyerStart(2) + 0.01);
    expect(drawMuta).toHaveBeenCalledTimes(3);
    const scales = vi.mocked(drawMuta).mock.calls.map((call) => call[5]);
    expect(Math.min(...scales)).toBeLessThan(0.03);
  });

  it('glows additively on the dark stage and lays its glow over a light one', () => {
    const modes = (palette: SwarmPalette) =>
      draw(3.2, palette).calls.filter((c) => c.op === 'set:globalCompositeOperation').map((c) => c.args[0]);
    expect(modes(PALETTE)).toContain('lighter');
    expect(modes({ ...PALETTE, bg: '#fdfdfb' })).not.toContain('lighter');
  });

  it('paints every colour from the tone, as rgba strings, and puts the context back', () => {
    for (const t of [0.8, 2.4, 3.2, GLOBE_STILL_T]) {
      const { calls, count } = draw(t);
      const colours = [...coloursUsed(calls), ...calls.filter((c) => c.op === 'addColorStop').map((c) => c.args[1])];
      expect(colours.length).toBeGreaterThan(0);
      for (const c of colours) expect(c).toMatch(/^rgba\(\d+,\d+,\d+,[-\d.e]+\)$/);
      // Every alpha and composite change is made inside a save, so the restore puts it back.
      expect(count('save')).toBe(count('restore'));
    }
  });

  it('holds no colour literal', () => {
    const source = readFileSync(join(import.meta.dirname, '../../src/splash/globe.ts'), 'utf8');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/i);
  });
});
