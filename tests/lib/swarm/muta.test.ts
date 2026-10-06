import { describe, expect, it } from 'vitest';

import { spRng } from '@lib/swarm/kit';
import {
  createSpine,
  drawMuta,
  spineNodes,
  SPINE_L,
  SPINE_NODES,
  stepSpine,
  warmSpine,
  type Spine,
} from '@lib/swarm/muta';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { coloursUsed, recordingContext, type Recorded } from '@tests/support/canvas-2d';

const segments = (nodes: [number, number][]): number[] =>
  nodes.slice(1).map((n, i) => Math.hypot(n[0] - nodes[i]![0], n[1] - nodes[i]![1]));

const angle = (a: [number, number], b: [number, number]): number => Math.atan2(a[1] - b[1], a[0] - b[0]);
const angleBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('the live spine', () => {
  it('lays its nodes back along the heading', () => {
    const nodes = spineNodes(createSpine(10, 20, 0));
    expect(nodes).toHaveLength(SPINE_NODES);
    expect(nodes[0]).toEqual([10, 20]);
    expect(nodes[1]![0]).toBeCloseTo(10 - SPINE_L);
    expect(nodes[1]![1]).toBeCloseTo(20);
  });

  it('holds every segment at L after 1000 random head steps, with no NaN', () => {
    const r = spRng(3);
    const s = createSpine(0, 0, 0);
    let x = 0;
    let y = 0;
    for (let k = 0; k < 1000; k++) {
      x += (r() - 0.5) * 8;
      y += (r() - 0.5) * 8;
      stepSpine(s, x, y, 1 / 60);
    }
    const nodes = spineNodes(s);
    for (const n of nodes) expect(Number.isFinite(n[0]) && Number.isFinite(n[1])).toBe(true);
    for (const l of segments(nodes)) expect(Math.abs(l - SPINE_L)).toBeLessThan(0.01);
  });

  it('follows a straight flight straight', () => {
    const s = createSpine(0, 0, 0);
    for (let k = 1; k <= 240; k++) stepSpine(s, k * 0.5, 0, 1 / 120);
    for (const [, y] of spineNodes(s)) expect(Math.abs(y)).toBeLessThan(0.2);
  });

  it('lags through a 90° turn: the tail tip still points the old way at 0.2s', () => {
    const s = createSpine(0, 0, 0);
    let x = 0;
    for (let k = 1; k <= 240; k++) stepSpine(s, (x = k * 0.5), 0, 1 / 120);
    let y = 0;
    for (let k = 1; k <= 24; k++) stepSpine(s, x, (y = k * 0.5), 1 / 120);
    const nodes = spineNodes(s);
    const head = angle(nodes[0]!, nodes[1]!);
    const tail = angle(nodes[32]!, nodes[33]!);
    expect(head).toBeCloseTo(Math.PI / 2, 0);
    expect(angleBetween(head, tail)).toBeGreaterThan(Math.PI / 6);
    expect(y).toBe(12);
  });

  it('lands its head on the flyer when a frame spans whole substeps', () => {
    const s = createSpine(0, 0, 0);
    stepSpine(s, 5, 3, 0.5);
    expect(spineNodes(s)[0]).toEqual([5, 3]);
  });

  it('warms deterministically', () => {
    const path = (t: number): [number, number] => [40 * Math.cos(t), 30 * Math.sin(2 * t)];
    const a = createSpine(...path(0), 0);
    const b = createSpine(...path(0), 0);
    warmSpine(a, path, 2);
    warmSpine(b, path, 2);
    expect(spineNodes(a)).toEqual(spineNodes(b));
    expect(spineNodes(a)[0]![0]).toBeCloseTo(path(2)[0]);
  });
});

describe('drawMuta', () => {
  const T = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));
  const flown = (): Spine => {
    const s = createSpine(0, 0, 0);
    warmSpine(s, (t) => [60 * t, 0], 2);
    return s;
  };

  const draw = (turn: number, scale: number, ps = 1, shadow?: [number, number]) => {
    const { ctx, calls } = recordingContext();
    drawMuta(ctx, flown(), 3, 0.5, turn, scale, ps, T, shadow);
    return calls;
  };

  it('balances save and restore', () => {
    const calls = draw(0, 0.108, 1, [6, 9]);
    expect(calls.filter((c) => c.op === 'save')).toHaveLength(calls.filter((c) => c.op === 'restore').length);
  });

  it('paints only rgba() colours, gradients included', () => {
    const calls = draw(0, 1.2, 1, [6, 9]);
    const colours = [
      ...coloursUsed(calls),
      ...calls.filter((c) => c.op === 'addColorStop').map((c) => c.args[1]),
    ];
    expect(colours.length).toBeGreaterThan(10);
    for (const c of colours) expect(c).toMatch(/^rgba\(/);
  });

  it('switches detail on above ps * scale 1.1', () => {
    const strokes = (calls: Recorded[]) => calls.filter((c) => c.op === 'stroke').length;
    expect(strokes(draw(0, 1.2))).toBeGreaterThan(strokes(draw(0, 0.5)));
  });

  it('banks: a hard turn moves the wing tips', () => {
    // The wing outline's curves end at the finger tips; args[2] is the end x.
    const tips = (turn: number): number[] =>
      draw(turn, 1).filter((c) => c.op === 'quadraticCurveTo').map((c) => c.args[2] as number);
    const level = tips(0);
    const banked = tips(3);
    expect(level.length).toBeGreaterThan(0);
    expect(banked).not.toEqual(level);
  });

  it('translates to the head and scales by scale', () => {
    const s = flown();
    const [hx, hy] = spineNodes(s)[0]!;
    const { ctx, calls } = recordingContext();
    drawMuta(ctx, s, 0, 0, 0, 0.108, 2, T);
    expect(calls.find((c) => c.op === 'translate')?.args).toEqual([hx, hy]);
    expect(calls.find((c) => c.op === 'scale')?.args).toEqual([0.108, 0.108]);
  });
});
