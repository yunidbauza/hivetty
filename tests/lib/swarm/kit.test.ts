import { describe, expect, it } from 'vitest';

import {
  clamp,
  creepPool,
  ease,
  gauss,
  hash,
  kf,
  LW,
  mix,
  seg,
  sm,
  SP_LIGHT,
  spBack,
  spBlob,
  spCross,
  spDot,
  spN,
  spN2,
  spNorm,
  spPath,
  spRng,
  spSub,
  spThorn,
  TAU,
} from '@lib/swarm/kit';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext } from '@tests/support/canvas-2d';

const T = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));

/** Every colour a drawing used, gradient stops included. */
const allColours = (calls: ReturnType<typeof recordingContext>['calls']): unknown[] => [
  ...coloursUsed(calls),
  ...calls.filter((c) => c.op === 'addColorStop').map((c) => c.args[1]),
];

describe('the scalar helpers', () => {
  it('match the artifact', () => {
    expect(TAU).toBe(Math.PI * 2);
    expect(clamp(2)).toBe(1);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(mix(2, 4, 0.25)).toBe(2.5);
    expect(seg(5, 0, 10)).toBe(0.5);
    expect(ease(0.5)).toBe(0.5);
    expect(sm(0, 1, 0.5)).toBe(0.5);
    expect(gauss(0)).toBe(1);
    expect(hash(3)).toBeGreaterThanOrEqual(0);
    expect(hash(3)).toBeLessThan(1);
    expect(LW(0.5)).toBe(1.8);
    expect(LW(2)).toBe(1.1);
  });

  it('kf eases between keyframes', () => {
    expect(kf([[0, 0], [1, 10]], 0.5)).toBe(5);
    expect(kf([[0, 0], [1, 10]], 2)).toBe(10);
  });

  it('spBack overshoots then settles at 1', () => {
    expect(spBack(1)).toBe(1);
    expect(spBack(0.8)).toBeGreaterThan(1);
  });
});

describe('spRng', () => {
  it('is seeded: the same five numbers twice, all in [0, 1)', () => {
    const a = spRng(7);
    const b = spRng(7);
    const first = [a(), a(), a(), a(), a()];
    expect([b(), b(), b(), b(), b()]).toEqual(first);
    for (const n of first) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('noise', () => {
  it('spN and spN2 stay in [-1, 1] and are deterministic', () => {
    for (let x = 0; x < 5; x += 0.37) {
      expect(Math.abs(spN(x, 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(spN2(x, x * 0.5, 1))).toBeLessThanOrEqual(1);
      expect(spN2(x, 1)).toBe(spN2(x, 1));
    }
  });
});

describe('vectors', () => {
  it('normalise, dot, subtract and cross', () => {
    expect(spNorm([3, 0, 4])).toEqual([0.6, 0, 0.8]);
    expect(spDot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(spSub([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(spCross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(Math.hypot(...SP_LIGHT)).toBeCloseTo(1);
  });
});

describe('the drawing helpers', () => {
  it('spBlob paints only rgba() built from the tone', () => {
    const { ctx, calls } = recordingContext();
    spBlob(ctx, 0, 0, 10, 5, T.green, 0.5, 0.4);
    const colours = allColours(calls);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(c).toMatch(/^rgba\(/);
    expect(colours).toContain(`rgba(${T.green.join(',')},0.5)`);
  });

  it('spBlob skips a near-invisible blob', () => {
    const { ctx, calls } = recordingContext();
    spBlob(ctx, 0, 0, 10, 5, T.green, 0.001);
    expect(calls).toEqual([]);
  });

  it('creepPool paints the creep from the tone, and balances save and restore', () => {
    const { ctx, calls } = recordingContext();
    creepPool(ctx, 0, 0, 20, 5, 0.5, T);
    expect(allColours(calls)).toContain(`rgba(${T.creep.join(',')},0.5)`);
    expect(calls.filter((c) => c.op === 'save')).toHaveLength(calls.filter((c) => c.op === 'restore').length);
  });

  it('spThorn and spPath draw paths in tone colours', () => {
    const { ctx, calls } = recordingContext();
    spThorn(ctx, 0, 0, 0.3, 10, 2, T, 0.5);
    spPath(ctx, [[0, 0], [1, 1], [2, 0]]);
    for (const c of allColours(calls)) expect(c).toMatch(/^rgba\(/);
    expect(calls.filter((c) => c.op === 'lineTo')).toHaveLength(2);
  });
});
