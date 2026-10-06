import type { Tone } from '@lib/swarm/tone';

/**
 * A Brood creature (HIVE-221): a pure drawing on a loop, placed and clocked
 * by whoever hosts it (`SwarmCreature`).
 *
 * `dur` is the loop in seconds, `rest` the still frame reduced motion holds,
 * and `box` the `[x, y, w, h]` the drawing occupies in its own units. `draw`
 * takes the loop time, the drawing scale (the artifact's `det` threshold reads
 * it) and the active tone.
 *
 * `o` carries the artifact's per-creature options: `field` for the hover
 * mutalisk, `G` (the ground line) and `layer` for the overlord. The app
 * passes none of them.
 */
export interface BroodOptions {
  field?: boolean;
  G?: number;
  layer?: 'air' | 'ground';
}

export interface BroodCreature {
  readonly dur: number;
  readonly rest: number;
  readonly box: readonly [number, number, number, number];
  draw(ctx: CanvasRenderingContext2D, t: number, s: number, T: Tone, o?: BroodOptions): void;
}

/**
 * How far a creature's canvas reaches past its box, as a share of the box on
 * each side (HIVE-222). Rings, glow, creep and wingtips are drawn up to 15% past
 * the box; on a canvas cut to the box they ended in a hard edge and the haze
 * showed the canvas as a square. At 0.3 no creature has a pixel above 1/255
 * alpha at the canvas edge over its whole loop, so nothing is ever clipped.
 */
export const BLEED = 0.3;

/**
 * Clear the canvas and draw `c` fitted, centred, into `w`×`h` css pixels at
 * `dpr` device pixels each. The artifact's `paint()`, lines 1821–1828. With
 * `pad`, the box is fitted to the canvas less `pad` of the box on every side,
 * so the creature keeps the scale of its laid-out box and has air around it.
 */
export function paintCreature(
  ctx: CanvasRenderingContext2D,
  c: BroodCreature,
  t: number,
  w: number,
  h: number,
  dpr: number,
  T: Tone,
  pad = 0,
): void {
  if (!w || !h) return;
  const [bx, by, bw, bh] = c.box;
  const s = Math.min(w / (bw * (1 + 2 * pad)), h / (bh * (1 + 2 * pad)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, Math.round(w * dpr), Math.round(h * dpr));
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((w - bw * s) / 2 - bx * s), dpr * ((h - bh * s) / 2 - by * s));
  c.draw(ctx, t, s, T, {});
}
