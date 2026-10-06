import { describe, expect, it } from 'vitest';

import { HOVER, hoverSim } from '@lib/swarm/hover';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext, type Recorded } from '@tests/support/canvas-2d';

const DARK = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));
const LIGHT = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.light.ui));

function record(t: number, s: number, T = DARK, o?: { field?: boolean }): Recorded[] {
  const { ctx, calls } = recordingContext();
  HOVER.draw(ctx, t, s, T, o);
  return calls;
}

const ops = (calls: Recorded[]): string[] => calls.map((c) => c.op);

describe('the hover mutalisk', () => {
  it('ports the artifact’s loop, still frame and box', () => {
    expect(HOVER.dur).toBe(4);
    expect(HOVER.rest).toBe(3.9);
    expect(HOVER.box).toEqual([-110, -86, 220, 184]);
  });

  it.each([
    [0, 0.5],
    [2, 0.5],
    [3.9, 0.5],
    [0, 2.4],
    [2, 2.4],
    [3.9, 2.4],
  ])('draws at t = %s, s = %s with save and restore balanced', (t, s) => {
    for (const T of [DARK, LIGHT]) {
      const o = ops(record(t, s, T));
      expect(o.length).toBeGreaterThan(100);
      expect(o.filter((op) => op === 'save')).toHaveLength(o.filter((op) => op === 'restore').length);
    }
  });

  it('paints every colour from the tone, as rgba strings', () => {
    for (const T of [DARK, LIGHT]) {
      for (const t of [0.5, 2.8, 3.9]) {
        const colours = coloursUsed(record(t, 2.4, T));
        expect(colours.length).toBeGreaterThan(0);
        for (const c of colours) expect(c).toMatch(/^rgba\(\d+,\d+,\d+,[-\d.e]+\)$/);
      }
    }
  });

  it.each([0, 1.3, 2.8, 3.9])('closes its loop: t = %s and t + dur record the same op stream', (t) => {
    expect(ops(record(t + HOVER.dur, 2.4))).toEqual(ops(record(t, 2.4)));
  });

  it('opens its beam at t = 2.8 and not at t = 1', () => {
    const beamOps = (t: number): number => record(t, 2.4).length;
    const strokes = (t: number): Recorded[] =>
      record(t, 2.4).filter((c) => c.op === 'ellipse' && c.args[5] === Math.PI && c.args[6] === 0);
    expect(strokes(2.8)).toHaveLength(1);
    expect(strokes(1)).toHaveLength(0);
    expect(beamOps(2.8)).not.toBe(beamOps(1));
  });

  it('leaves out its creep pool over a field', () => {
    const gradients = (o?: { field?: boolean }): number =>
      record(1, 2.4, DARK, o).filter((c) => c.op === 'createRadialGradient').length;
    expect(gradients({ field: true })).toBe(gradients() - 1);
  });

  it('glows additively on dark and tints on light', () => {
    const modes = (T = DARK): unknown[] =>
      record(2.8, 2.4, T)
        .filter((c) => c.op === 'set:globalCompositeOperation')
        .map((c) => c.args[0]);
    expect(modes(DARK)).toContain('lighter');
    expect(modes(LIGHT)).not.toContain('lighter');
  });
});

const dist = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('the hover mutalisk’s simulation', () => {
  it('records once and memoises it', () => {
    expect(hoverSim()).toBe(hoverSim());
  });

  it('closes its loop: frame(0) and frame(3.9999) agree within 0.5 units on every node', () => {
    const { frame, N } = hoverSim();
    const a = frame(0).ns;
    const b = frame(3.9999).ns;
    expect(a).toHaveLength(N);
    for (let i = 0; i < N; i++) expect(dist(a[i]!, b[i]!)).toBeLessThan(0.5);
  });

  it('wraps time onto the loop', () => {
    const { frame } = hoverSim();
    expect(frame(5.25)).toEqual(frame(1.25));
    expect(frame(-0.75)).toEqual(frame(3.25));
  });

  it('holds every simulated vertebra at L from its parent, with no NaN', () => {
    const { frame, L, CH } = hoverSim();
    for (const t of [0, 0.7, 1.9, 2.8, 3.5]) {
      const { ns, st } = frame(t);
      for (const v of [...ns.flat(), ...st]) expect(Number.isFinite(v)).toBe(true);
      // Head, neck and chest (up to CH + 1) are carried by the torso, not constrained.
      for (let i = CH + 2; i < ns.length; i++) expect(dist(ns[i]!, ns[i - 1]!)).toBeCloseTo(L, 1);
    }
  });

  /** Version 15's fix: the last vertebrae carry no momentum, so the tip trails and cannot swirl. */
  it('keeps the tail tip from swirling: its speed relative to node N-8 averages under 20 units/s', () => {
    const { frame, N, TP } = hoverSim();
    const dt = 1 / 120;
    const rel = (t: number): number[] => {
      const { ns } = frame(t);
      const tip = ns[N - 1]!;
      const anchor = ns[N - 8]!;
      return [tip[0] - anchor[0], tip[1] - anchor[1], tip[2] - anchor[2]];
    };
    let sum = 0;
    const steps = TP / dt;
    for (let k = 0; k < steps; k++) sum += dist(rel((k + 1) * dt), rel(k * dt)) / dt;
    expect(sum / steps).toBeLessThan(20);
  });

  it('grows its anatomy seeded, once', () => {
    const sim = hoverSim();
    expect(sim.wings).toHaveLength(2);
    expect(sim.teeth).toHaveLength(18);
    expect(sim.lump).toHaveLength(sim.N);
    expect(sim.skin).toHaveLength(sim.N);
    expect(sim.dust).toHaveLength(26);
    expect(sim.hblots).toHaveLength(9);
  });

  it('beats in phase: the stroke angle, pressure and fold read the artifact’s curves', () => {
    const { thOf, press, foldOf, bv, uOf, ampOf, headYaw } = hoverSim();
    expect(thOf(0)).toBeCloseTo(0.84);
    expect(thOf(0.5, 1)).toBeLessThan(0);
    expect(press(0.2)).toBeGreaterThan(0);
    expect(foldOf(0.4)).toBeGreaterThan(0);
    expect(foldOf(0)).toBe(0);
    expect(bv(0, 0)).toBe(1);
    expect(bv(2.5, 0)).toBeCloseTo(1.13);
    expect(uOf(1, 1)).toBe(0.5);
    expect(uOf(1, -1)).toBeCloseTo(0.48);
    expect(ampOf(2.5, -1)).toBeCloseTo(0.97);
    expect(Number.isFinite(headYaw(1))).toBe(true);
  });
});
