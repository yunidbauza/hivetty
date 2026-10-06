import { describe, expect, it } from 'vitest';

import { growOverlord, OVERLORD, overlordAnatomy, ovLoop, ovM } from '@lib/swarm/overlord';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext, type Recorded } from '@tests/support/canvas-2d';

const DARK = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));
const LIGHT = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.light.ui));

function record(t: number, s: number, T = DARK, o?: { G?: number; layer?: 'air' | 'ground' }): Recorded[] {
  const { ctx, calls } = recordingContext();
  OVERLORD.draw(ctx, t, s, T, o);
  return calls;
}

const ops = (calls: Recorded[]): string[] => calls.map((c) => c.op);

describe('the overlord', () => {
  it('ports the artifact’s loop, still frame and box', () => {
    expect(OVERLORD.dur).toBe(10);
    expect(OVERLORD.rest).toBe(5.9);
    expect(OVERLORD.box).toEqual([-118, -98, 236, 200]);
  });

  it.each([
    [0, 0.5],
    [5, 0.5],
    [5.9, 0.5],
    [0, 2.4],
    [5, 2.4],
    [5.9, 2.4],
  ])('draws at t = %s, s = %s with save and restore balanced', (t, s) => {
    for (const T of [DARK, LIGHT]) {
      const calls = record(t, s, T);
      expect(calls.length).toBeGreaterThan(100);
      const o = ops(calls);
      expect(o.filter((op) => op === 'save')).toHaveLength(o.filter((op) => op === 'restore').length);
    }
  });

  it('draws more detail above the s > 1.1 threshold', () => {
    expect(record(2, 2.4).length).toBeGreaterThan(record(2, 0.5).length);
  });

  it('paints every colour from the tone, as rgba strings', () => {
    for (const t of [0, 3, 5.9, 7, 9]) {
      const colours = coloursUsed(record(t, 2.4));
      expect(colours.length).toBeGreaterThan(0);
      for (const c of colours) expect(c).toMatch(/^rgba\(\d+,\d+,\d+,[-\d.e]+\)$/);
    }
  });

  it('throws its beam in the theme’s brand blue while it watches, and not while it drifts', () => {
    const blue = `rgba(${DARK.brand.map((c) => c | 0).join(',')},`;
    const beamed = (t: number): boolean =>
      record(t, 2.4)
        .filter((c) => c.op === 'addColorStop')
        .some((c) => String(c.args[1]).startsWith(blue));
    expect(beamed(5.9)).toBe(true);
    expect(beamed(1)).toBe(false);
  });

  it('glows additively on dark and tints on light', () => {
    const modes = (T = DARK): unknown[] =>
      record(5.9, 2.4, T)
        .filter((c) => c.op === 'set:globalCompositeOperation')
        .map((c) => c.args[0]);
    expect(modes(DARK)).toContain('lighter');
    expect(modes(LIGHT)).not.toContain('lighter');
  });

  it('keeps the artifact’s layer options: ground stops before the body, air skips the ground', () => {
    const all = record(5.9, 2.4).length;
    expect(record(5.9, 2.4, DARK, { layer: 'ground' }).length).toBeLessThan(all);
    expect(record(5.9, 2.4, DARK, { layer: 'air' }).length).toBeLessThan(all);
  });

  it.each([0, 1.3, 5.9, 8.2])('closes its loop: t = %s and t + dur record the same op stream', (t) => {
    expect(ops(record(t + OVERLORD.dur, 2.4))).toEqual(ops(record(t, 2.4)));
  });

  it('samples its noise round a circle, so the ten-second clock has no seam', () => {
    for (const t of [0, 2.5, 7.1]) expect(ovLoop(t + 10, 4, 2)).toBeCloseTo(ovLoop(t, 4, 2), 9);
    expect(ovM(-1)).toBeCloseTo(9);
    expect(ovM(23)).toBeCloseTo(3);
  });

  it('grows its anatomy once, seeded', () => {
    const a = overlordAnatomy();
    expect(overlordAnatomy()).toBe(a);
    expect(growOverlord()).toEqual(a);
    expect(a.tents).toHaveLength(8);
    expect(a.flaps).toHaveLength(2);
    expect(a.motes).toHaveLength(38);
    expect(a.comb.length).toBeGreaterThan(20);
  });
});
