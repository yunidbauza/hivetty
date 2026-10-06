import type { SwarmPalette } from '@lib/swarm/palette';
import { accentsOf, clearColour, mixColour } from '@lib/theme/colour';

import { drawGlobe, GLOBE_STILL_T } from './globe';

/**
 * Where the globe is drawn, and when (HIVE-212).
 *
 * Shared by the splash and the About panel, which differ only in the numbers:
 * the splash draws on the document's own clock, so the globe's lights land with
 * the log lines; About opens long after any of that, so it starts its own clock
 * at the formed globe.
 */

const TOKENS = {
  bg: '--cc-bg',
  panel2: '--cc-panel-2',
  ink: '--cc-ink',
  muted: '--cc-muted',
  subtle: '--cc-subtle',
  brand: '--cc-brand',
  green: '--cc-green',
  amber: '--cc-amber',
  red: '--cc-red',
  creep: '--cc-creep',
  chitin: '--cc-chitin',
  tissueDeep: '--cc-tissue-deep',
  tissue: '--cc-tissue',
  tissueLit: '--cc-tissue-lit',
  glowCore: '--cc-glow-core',
  ground: '--cc-ground',
  onBrand: '--cc-on-brand',
} as const;

/**
 * A SwarmPalette from the document's tokens (`splash-tokens.css`). The
 * derived colours are `swarmPaletteOf`'s rules, applied to the same values, so
 * the creature here is the creature on Home.
 */
export function paletteFrom(read: (token: string) => string): SwarmPalette {
  const { onBrand, ...c } = Object.fromEntries(
    Object.entries(TOKENS).map(([key, token]) => [key, read(token).trim()]),
  ) as Record<keyof typeof TOKENS, string>;
  return {
    ...c,
    creepClear: clearColour(c.creep),
    carapace: mixColour(c.bg, c.chitin, 0.18),
    ...accentsOf({ ...c, onBrand }, c),
  };
}

export interface GlobeStage {
  /** The canvas's size in CSS pixels. */
  width: number;
  height: number;
  /** The globe's centre, in CSS pixels. */
  cx: number;
  cy: number;
  scale: number;
  /** Start a clock of its own at this many seconds; without it, the document's clock. */
  from?: number;
}

/**
 * Size the canvas, then draw: once at the still under reduced motion, else
 * every animation frame for as long as the window lives.
 */
export function startGlobe(canvas: HTMLCanvasElement, palette: SwarmPalette, stage: GlobeStage): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = stage.width * dpr;
  canvas.height = stage.height * dpr;

  const paint = (t: number): void => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.translate(stage.cx, stage.cy);
    ctx.scale(stage.scale, stage.scale);
    drawGlobe(ctx, t, palette, dpr * stage.scale);
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // One frame, held: the formed globe, the orbit and every flyer, nothing moving.
    paint(GLOBE_STILL_T);
    return;
  }

  let first: number | null = null;
  const loop = (now: number): void => {
    first ??= now;
    paint(stage.from === undefined ? now / 1000 : stage.from + (now - first) / 1000);
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
}
