import { spRgb, spTone, type Rgb, type Tone } from '@lib/swarm/tone';

/**
 * The Brood's shared math and drawing helpers (HIVE-221).
 *
 * Ported number for number from the artifact (`brood-v15.html`, lines 253–288,
 * 322–342 and 659). Where it read the global `C` or called `spT()`, the
 * helper takes the `Tone` as its last argument instead.
 */

export type V3 = readonly [number, number, number];
export type Keyframes = readonly (readonly [number, number])[];

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
export const ease = (x: number): number => x * x * (3 - 2 * x);
export const sm = (a: number, b: number, t: number): number => ease(seg(t, a, b));
export const gauss = (x: number): number => Math.exp(-x * x);
export const hash = (i: number): number => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** A keyframe table `[[p, v], …]`, eased between rows. */
export function kf(tab: Keyframes, p: number): number {
  for (let i = 1; i < tab.length; i++) {
    if (p <= tab[i]![0]) {
      const [p0, v0] = tab[i - 1]!;
      const [p1, v1] = tab[i]!;
      return mix(v0, v1, ease((p - p0) / (p1 - p0 || 1)));
    }
  }
  return tab[tab.length - 1]![1];
}

/** A pool of creep under a creature. */
export function creepPool(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  a: number,
  T: Tone,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, spRgb(T.creep, a));
  g.addColorStop(1, spRgb(T.creep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Line width for a drawing scale: never thinner than a device pixel. */
export const LW = (s: number): number => Math.max(0.9 / s, 1.1);

/** 1D value noise in [-1, 1]. */
export const spN = (x: number, sd = 0): number => {
  const i = Math.floor(x);
  const f = x - i;
  return mix(hash(i + sd * 57.31), hash(i + 1 + sd * 57.31), ease(f)) * 2 - 1;
};

/** A seeded generator in [0, 1) (mulberry32). */
export function spRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let q = Math.imul(s ^ (s >>> 15), 1 | s);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ease-out with a small overshoot. */
export const spBack = (x: number): number => {
  const c1 = 0.9;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
export const spNorm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const spDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const spSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const spCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const SP_LIGHT = spNorm([-0.55, -0.65, 0.55]);

/** A soft radial blob of `col`, fading out from `a`. */
export const spBlob = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  col: Rgb,
  a: number,
  mid = 0,
): void => {
  if (a <= 0.002) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, spRgb(col, a));
  if (mid) g.addColorStop(mid, spRgb(col, a * 0.55));
  g.addColorStop(1, spRgb(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
};

/** A curved thorn at angle `a`, toned at `k`. */
export const spThorn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  len: number,
  w: number,
  T: Tone,
  k: number,
): void => {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const px = -sn;
  const py = c;
  ctx.beginPath();
  ctx.moveTo(x + px * w, y + py * w);
  ctx.quadraticCurveTo(x + c * len * 0.5 + px * w * 0.55, y + sn * len * 0.5 + py * w * 0.55, x + c * len, y + sn * len);
  ctx.quadraticCurveTo(x + c * len * 0.4 - px * w * 0.35, y + sn * len * 0.4 - py * w * 0.35, x - px * w, y - py * w);
  ctx.closePath();
  ctx.fillStyle = spRgb(spTone(T, k));
  ctx.fill();
  ctx.strokeStyle = spRgb(T.lo, 0.65);
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + px * w * 0.6, y + py * w * 0.6);
  ctx.quadraticCurveTo(x + c * len * 0.5 + px * w * 0.4, y + sn * len * 0.5 + py * w * 0.4, x + c * len, y + sn * len);
  ctx.strokeStyle = spRgb(T.hi, 0.3);
  ctx.lineWidth = 0.35;
  ctx.stroke();
};

/** Begin a polyline through `pts`. */
export const spPath = (ctx: CanvasRenderingContext2D, pts: readonly (readonly number[])[]): void => {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i) ctx.lineTo(p[0]!, p[1]!);
    else ctx.moveTo(p[0]!, p[1]!);
  });
};

/** 2D value noise in [-1, 1]. */
export const spN2 = (x: number, y: number, sd = 0): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = ease(x - xi);
  const yf = ease(y - yi);
  const h = (a: number, b: number): number => hash(a * 157.3 + b * 311.9 + sd * 71.7);
  return mix(mix(h(xi, yi), h(xi + 1, yi), xf), mix(h(xi, yi + 1), h(xi + 1, yi + 1), xf), yf) * 2 - 1;
};
