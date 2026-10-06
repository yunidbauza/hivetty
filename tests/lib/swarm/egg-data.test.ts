import { describe, expect, it } from 'vitest';

import * as egg from '@lib/swarm/egg-data';
import {
  BLISTERS,
  CREASES,
  FOLDS,
  GROUND,
  MOTTLE,
  OCCUPANT,
  PORES,
  RIM_THICK,
  SHELL_D,
  SPECKS,
  SPORES,
  TENDRILS,
  VEIN_BAND_DELAYS,
  VEIN_BANDS,
  VEINS,
  WET,
} from '@lib/swarm/egg-data';

describe('hatchery egg data (HIVE-221)', () => {
  it('carries the design\'s counts', () => {
    expect(BLISTERS).toHaveLength(8);
    expect(SPECKS).toHaveLength(7);
    expect(SPORES).toHaveLength(5);
    expect(OCCUPANT).toHaveLength(5);
    expect(RIM_THICK).toHaveLength(3);
    expect(MOTTLE).toHaveLength(13);
    expect(CREASES).toHaveLength(16);
    expect(FOLDS).toHaveLength(6);
    expect(PORES).toHaveLength(46);
    expect(WET).toHaveLength(10);
    expect(TENDRILS).toHaveLength(9);
    expect(GROUND).toHaveLength(6);
    expect(SHELL_D.startsWith('M0 -74')).toBe(true);
  });

  it('splits every vein into exactly one of five pulse bands', () => {
    expect(VEIN_BANDS).toHaveLength(5);
    expect(VEIN_BAND_DELAYS).toEqual([0, -0.32, -0.64, -0.96, -1.28]);
    expect(VEINS.length).toBe(VEIN_BANDS.reduce((n, band) => n + band.length, 0));
    const seen = VEIN_BANDS.flat().sort((a, b) => a - b);
    expect(seen).toEqual(VEINS.map((_, i) => i));
  });

  it('staggers the spores as the design does', () => {
    expect(SPORES.map((s) => s.delay)).toEqual([0, 1.6, 3.1, 4.4, 5.5]);
  });

  it('keeps each blister\'s shadow, body, glint and catch as the design draws them', () => {
    // The design's first blister, number for number: its ellipses round
    // independently, so they are transcribed rather than derived from `r`.
    expect(BLISTERS[0]).toEqual({
      x: -18,
      y: -40,
      r: 5,
      shadow: { cx: -16.6, cy: -37.5, rx: 5.8, ry: 4.4 },
      body: { cx: -18, cy: -40, rx: 5.5, ry: 4.5 },
      glint: { cx: -20.1, cy: -42.1, rx: 0.9, ry: 0.5 },
      catch: { cx: -18, cy: -39.2, rx: 5, ry: 3.8 },
    });
    for (const b of BLISTERS) expect(b.body).toMatchObject({ cx: b.x, cy: b.y });
  });

  it('holds shapes only, never a colour', () => {
    const text = JSON.stringify(egg);
    expect(text).not.toMatch(/#|rgb/i);
  });
});
