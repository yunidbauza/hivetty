import type { SwarmPalette } from '@lib/swarm/palette';

/**
 * The Brood's colour object, `T` (HIVE-221).
 *
 * The artifact draws from numeric RGB tuples it mixes per stroke, where the
 * rest of this folder hands the context palette strings. `toneOf` parses the
 * active palette into those tuples once, and `spRgb` is the one place under
 * `src/lib/swarm/` that formats a colour string — always from numbers the
 * palette produced, never from a literal. `no-colour-literals.test.ts` holds
 * this file to exactly that.
 */

export type Rgb = readonly [number, number, number];

export interface Tone {
  /** The bg is dark: glow adds light on it; on a light bg it tints. */
  dark: boolean;
  lo: Rgb;
  mid: Rgb;
  hi: Rgb;
  green: Rgb;
  core: Rgb;
  ground: Rgb;
  membrane: Rgb;
  maw: Rgb;
  gum: Rgb;
  stain: Rgb;
  glint: Rgb;
  brand: Rgb;
  creep: Rgb;
  chitin: Rgb;
  bg: Rgb;
  panel2: Rgb;
  /** A cast shadow: bg pulled 60% toward the deepest tissue. */
  shadow: Rgb;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** A channel, a percentage of `full` when it ends in `%`. */
function channel(part: string, full: number): number {
  const value = Number.parseFloat(part);
  return part.endsWith('%') ? (value / 100) * full : value;
}

function oklchToRgb(l: number, c: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (x: number): number => {
    const v = clamp01(x);
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [
    encode(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    encode(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    encode(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
  ];
}

/**
 * The palette's strings as numbers: the forms a theme may carry (validated
 * upstream by `validate.ts`) and the modern form `mixColour` emits. Alpha is
 * dropped; the creatures set their own. Unreadable input reads as black.
 */
export function rgbOf(value: string): Rgb {
  const text = value.trim().toLowerCase();
  if (text.startsWith('#')) {
    const digits = text.slice(1);
    const raw = digits.length === 3 || digits.length === 4 ? [...digits].map((d) => d + d).join('') : digits;
    const byte = (at: number): number => Number.parseInt(raw.slice(at, at + 2), 16) || 0;
    return [byte(0), byte(2), byte(4)];
  }
  const open = text.indexOf('(');
  const parts = text
    .slice(open + 1, text.lastIndexOf(')'))
    .split('/')[0]!
    .split(/[\s,]+/)
    .filter((part) => part !== '');
  if (open < 0 || parts.length < 3) return [0, 0, 0];
  const name = text.slice(0, open);
  if (name === 'oklch') {
    return oklchToRgb(channel(parts[0]!, 1), channel(parts[1]!, 0.4), Number.parseFloat(parts[2]!));
  }
  const [r, g, b] = parts.map((part) => Math.min(255, Math.max(0, channel(part, 255) || 0)));
  return [r!, g!, b!];
}

/** WCAG relative luminance of a tuple, 0 to 1. */
function luminanceOf([r, g, b]: Rgb): number {
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/* The artifact's colour helpers, lines 317–321, number for number. */
export const spRgb = (c: Rgb, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const spMix = (a: Rgb, b: Rgb, k: number): Rgb => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
export const spTone = (T: Tone, k: number): Rgb => {
  const c = clamp01(k);
  return c < 0.5 ? spMix(T.lo, T.mid, c * 2) : spMix(T.mid, T.hi, (c - 0.5) * 2);
};
/** Green light added to tissue: additive on the dark stage, a tint on the light one. */
export const spLit = (T: Tone, c: Rgb, g: number): Rgb =>
  g <= 0.002
    ? c
    : T.dark
      ? [
          Math.min(255, c[0] + T.green[0] * g),
          Math.min(255, c[1] + T.green[1] * g),
          Math.min(255, c[2] + T.green[2] * g),
        ]
      : spMix(c, T.green, clamp01(g * 0.7));

const memo = new WeakMap<SwarmPalette, Tone>();

/** The palette as the artifact's `T`. One parse per palette object. */
export function toneOf(p: SwarmPalette): Tone {
  const known = memo.get(p);
  if (known) return known;
  const bg = rgbOf(p.bg);
  const lo = rgbOf(p.tissueDeep);
  const tone: Tone = {
    dark: luminanceOf(bg) < 0.5,
    lo,
    mid: rgbOf(p.tissue),
    hi: rgbOf(p.tissueLit),
    green: rgbOf(p.green),
    core: rgbOf(p.glowCore),
    ground: rgbOf(p.ground),
    membrane: rgbOf(p.membrane),
    maw: rgbOf(p.maw),
    gum: rgbOf(p.gum),
    stain: rgbOf(p.stain),
    glint: rgbOf(p.glint),
    brand: rgbOf(p.brand),
    creep: rgbOf(p.creep),
    chitin: rgbOf(p.chitin),
    bg,
    panel2: rgbOf(p.panel2),
    shadow: spMix(bg, lo, 0.6),
  };
  memo.set(p, tone);
  return tone;
}
