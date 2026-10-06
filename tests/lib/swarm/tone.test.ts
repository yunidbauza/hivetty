import { describe, expect, it } from 'vitest';

import { rgbOf, spLit, spMix, spRgb, spTone, toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';

const dark = swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui);
const light = swarmPaletteOf(BUILT_IN_THEME.modes.light.ui);

describe('rgbOf', () => {
  it('reads hex, legacy rgb(), modern rgb() with alpha, and oklch()', () => {
    expect(rgbOf('#0b0816')).toEqual([11, 8, 22]);
    expect(rgbOf('#fff')).toEqual([255, 255, 255]);
    expect(rgbOf('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(rgbOf('rgb(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
    const white = rgbOf('oklch(1 0 0)');
    for (const c of white) expect(c).toBeCloseTo(255, 0);
  });

  it('reads anything else as black', () => {
    expect(rgbOf('not-a-colour')).toEqual([0, 0, 0]);
  });
});

describe('toneOf', () => {
  it('turns the built-in dark palette into the artifact T', () => {
    const T = toneOf(dark);
    expect(T.dark).toBe(true);
    // The derived ramp: Hive dark carries none of its own.
    expect(T.lo).toEqual([23, 27, 50]);
    expect(T.mid).toEqual([53, 53, 86]);
    expect(T.hi).toEqual([195, 181, 242]);
    expect(T.core).toEqual([226, 255, 238]);
    expect(T.ground).toEqual([20, 17, 40]);
  });

  it('marks the light palette light', () => {
    const T = toneOf(light);
    expect(T.dark).toBe(false);
    expect(T.lo).toEqual([122, 104, 182]);
  });

  it('memoises per palette object', () => {
    expect(toneOf(dark)).toBe(toneOf(dark));
    expect(toneOf({ ...dark })).not.toBe(toneOf(dark));
  });

  it('casts the shadow 60% from bg toward the deepest tissue', () => {
    const T = toneOf(dark);
    expect(T.shadow).toEqual(spMix(T.bg, T.lo, 0.6));
  });
});

describe('the artifact helpers', () => {
  const T = toneOf(dark);

  it('spTone(T, 0.5) is mid, and clamps at the ends', () => {
    expect(spTone(T, 0.5)).toEqual(T.mid);
    expect(spTone(T, -1)).toEqual(T.lo);
    expect(spTone(T, 2)).toEqual(T.hi);
  });

  it('spRgb formats an rgba() with truncated channels', () => {
    expect(spRgb([1, 2, 3], 0.5)).toBe('rgba(1,2,3,0.5)');
    expect(spRgb([1.9, 2.2, 3.7])).toBe('rgba(1,2,3,1)');
  });

  it('spLit adds green on dark, tints toward it on light, and leaves a trace alone', () => {
    expect(spLit(T, [10, 10, 10], 0.001)).toEqual([10, 10, 10]);
    expect(spLit(T, [250, 10, 10], 1)).toEqual([255, 10 + T.green[1], 10 + T.green[2]]);
    const L = toneOf(light);
    expect(spLit(L, [0, 0, 0], 1)).toEqual(spMix([0, 0, 0], L.green, 0.7));
  });
});
