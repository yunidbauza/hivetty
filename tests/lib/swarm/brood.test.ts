import { describe, expect, it, vi } from 'vitest';

import { BLEED, paintCreature, type BroodCreature } from '@lib/swarm/brood';
import { toneOf } from '@lib/swarm/tone';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { swarmPaletteOf } from '@lib/theme/colour';
import { recordingContext } from '@tests/support/canvas-2d';

const T = toneOf(swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui));

const fake = (draw = vi.fn()): BroodCreature & { draw: typeof draw } => ({
  dur: 4,
  rest: 2,
  box: [-50, -20, 100, 40],
  draw,
});

describe('paintCreature', () => {
  it('clears the backing store, then fits the box centred at s = min(w/bw, h/bh)', () => {
    const { ctx, calls } = recordingContext();
    const c = fake();
    // 300×60 css px: s = min(3, 1.5) = 1.5, so the box is 150 wide, 75 px of air either side.
    paintCreature(ctx, c, 1.25, 300, 60, 2, T);

    const ops = calls.map((call) => call.op);
    expect(ops.slice(0, 3)).toEqual(['setTransform', 'clearRect', 'setTransform']);
    expect(calls[0]!.args).toEqual([1, 0, 0, 1, 0, 0]);
    expect(calls[1]!.args).toEqual([0, 0, 600, 120]);
    const s = 1.5;
    const ex = 2 * ((300 - 100 * s) / 2 + 50 * s);
    const ey = 2 * ((60 - 40 * s) / 2 + 20 * s);
    expect(calls[2]!.args).toEqual([2 * s, 0, 0, 2 * s, ex, ey]);
    // The box's centre lands on the canvas's centre, in device pixels.
    expect(2 * s * 0 + ex).toBe(300);
    expect(2 * s * 0 + ey).toBe(60);
    const [drawnOn, ...rest] = c.draw.mock.calls[0]!;
    expect(drawnOn).toBe(ctx);
    expect(rest).toEqual([1.25, s, T, {}]);
  });

  it('takes the narrower fit when the canvas is tall', () => {
    const { ctx } = recordingContext();
    const c = fake();
    paintCreature(ctx, c, 0, 50, 200, 1, T);
    expect(c.draw.mock.calls[0]![2]).toBe(0.5);
  });

  it('leaves room on every side when asked to, at the scale of the box alone (HIVE-222)', () => {
    const { ctx, calls } = recordingContext();
    const c = fake();
    // The box gets 1/(1 + 2 * pad) of the canvas, centred: glow and creep drawn past it have air to fade in.
    paintCreature(ctx, c, 0, 160, 64, 1, T, BLEED);
    const s = Math.min(160 / (100 * (1 + 2 * BLEED)), 64 / (40 * (1 + 2 * BLEED)));
    expect(c.draw.mock.calls[0]![2]).toBeCloseTo(s);
    const [, , , , ex, ey] = calls[2]!.args as number[];
    expect(ex).toBeCloseTo(80);
    expect(ey).toBeCloseTo(32);
  });

  it('draws nothing on a canvas with no size', () => {
    const { ctx, calls } = recordingContext();
    const c = fake();
    paintCreature(ctx, c, 0, 0, 40, 1, T);
    expect(calls).toHaveLength(0);
    expect(c.draw).not.toHaveBeenCalled();
  });
});
