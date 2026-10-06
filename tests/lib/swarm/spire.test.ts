import { describe, expect, it } from 'vitest';

import { growSpire, SPIRE, spireAnatomy } from '@lib/swarm/spire';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext, type Recorded } from '@tests/support/canvas-2d';

const DARK = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));
const LIGHT = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.light.ui));

function record(t: number, s: number, T = DARK): Recorded[] {
  const { ctx, calls } = recordingContext();
  SPIRE.draw(ctx, t, s, T);
  return calls;
}

const ops = (calls: Recorded[]): string[] => calls.map((c) => c.op);

describe('the spire', () => {
  it('ports the artifact’s loop, still frame and box', () => {
    expect(SPIRE.dur).toBe(9);
    expect(SPIRE.rest).toBe(5.2);
    expect(SPIRE.box).toEqual([-118, -140, 236, 218]);
  });

  it.each([
    [0, 0.5],
    [4.5, 0.5],
    [5.2, 0.5],
    [0, 2.4],
    [4.5, 2.4],
    [5.2, 2.4],
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
    for (const t of [0, 3.5, 5.2, 6, 8]) {
      const colours = coloursUsed(record(t, 2.4));
      expect(colours.length).toBeGreaterThan(0);
      for (const c of colours) expect(c).toMatch(/^rgba\(\d+,\d+,\d+,[-\d.e]+\)$/);
    }
  });

  it('glows additively on dark and tints on light', () => {
    const modes = (T = DARK): unknown[] =>
      record(5.2, 2.4, T)
        .filter((c) => c.op === 'set:globalCompositeOperation')
        .map((c) => c.args[0]);
    expect(modes(DARK)).toContain('lighter');
    expect(modes(LIGHT)).not.toContain('lighter');
  });

  it.each([0, 1.3, 5.2, 6.1])('closes its loop: t = %s and t + dur record the same op stream', (t) => {
    expect(ops(record(t + SPIRE.dur, 2.4))).toEqual(ops(record(t, 2.4)));
  });

  it('grows its anatomy once, seeded', () => {
    const a = spireAnatomy();
    expect(spireAnatomy()).toBe(a);
    expect(growSpire()).toEqual(a);
    expect(a.petals).toHaveLength(7);
    expect(a.roots).toHaveLength(10);
    expect(a.fibers).toHaveLength(34);
  });
});
