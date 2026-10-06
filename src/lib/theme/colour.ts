/**
 * Colour arithmetic for the canvas (HIVE-199).
 *
 * Reads exactly the forms `validate.ts` admits — `#rgb`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()` (legacy and modern) and `oklch()` — because a theme may
 * hand the canvas any of them, and the canvas needs channels to mix. Mixing is
 * in sRGB; the output is modern `rgb()`, which both CSS and a 2D context read.
 */
import type { SwarmPalette } from '@lib/swarm/palette';
import type { UiColors } from '@lib/theme/contract';

export type Rgba = [number, number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(rgb|oklch)\(([^()]*)\)$/i;

/** A channel, a percentage of `full` when it ends in `%`. */
function component(part: string, full: number): number {
  const value = Number.parseFloat(part);
  return part.trim().endsWith('%') ? (value / 100) * full : value;
}

const clamp255 = (value: number): number => Math.min(255, Math.max(0, value));

function oklchToRgb(l: number, c: number, hueDegrees: number): [number, number, number] {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  const encode = (x: number): number => {
    const v = Math.min(1, Math.max(0, x));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [encode(linear[0]!), encode(linear[1]!), encode(linear[2]!)];
}

export function parseColour(value: string): Rgba | null {
  const text = value.trim();

  const hex = HEX.exec(text);
  if (hex) {
    const raw = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d).join('') : hex[1]!;
    const byte = (at: number): number => Number.parseInt(raw.slice(at, at + 2), 16);
    return [byte(0), byte(2), byte(4), raw.length === 8 ? byte(6) / 255 : 1];
  }

  const fn = FUNC.exec(text);
  if (!fn) return null;
  const name = fn[1]!.toLowerCase();
  const body = fn[2]!.trim();

  let channels: string[];
  let alpha: string | undefined;
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim());
    if (name !== 'rgb' || parts.length < 3 || parts.length > 4) return null;
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const [main = '', after, ...extra] = body.split('/');
    if (extra.length > 0) return null;
    channels = main
      .trim()
      .split(/\s+/)
      .filter((part) => part !== '');
    alpha = after?.trim();
  }
  if (channels.length !== 3 || channels.some((part) => Number.isNaN(Number.parseFloat(part)))) {
    return null;
  }

  const a = alpha === undefined ? 1 : component(alpha, 1);
  if (name === 'rgb') {
    return [
      clamp255(component(channels[0]!, 255)),
      clamp255(component(channels[1]!, 255)),
      clamp255(component(channels[2]!, 255)),
      a,
    ];
  }
  return [
    ...oklchToRgb(
      component(channels[0]!, 1),
      component(channels[1]!, 0.4),
      Number.parseFloat(channels[2]!),
    ),
    a,
  ];
}

const rgb = ([r, g, b]: Rgba, alpha?: number): string =>
  `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${alpha === undefined ? '' : ` / ${alpha}`})`;

/** `amount` of `toward`, blended into `base`. Unreadable input hands `base` back. */
export function mixColour(base: string, toward: string, amount: number): string {
  const from = parseColour(base);
  const to = parseColour(toward);
  if (!from || !to) return base;
  return rgb([0, 1, 2, 3].map((i) => from[i]! + (to[i]! - from[i]!) * amount) as Rgba);
}

/** The same colour at alpha 0: a gradient's fade-out stop. */
export function clearColour(value: string): string {
  const parsed = parseColour(value);
  return parsed ? rgb(parsed, 0) : value;
}

/** WCAG relative luminance, 0 to 1; unreadable input reads as black. */
export function luminance(value: string): number {
  const parsed = parseColour(value);
  if (!parsed) return 0;
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(parsed[0]) + 0.7152 * linear(parsed[1]) + 0.0722 * linear(parsed[2]);
}

/**
 * The Brood creatures' accents (HIVE-221), which no theme key names: the
 * hover mutalisk's membrane, mouth and glints.
 *
 * The artifact picks different literals for its dark and light stages, so the
 * mixes do too, keyed on the luminance of `bg` as `tone.ts` keys `T.dark`.
 * Each is tuned to land within 12 per channel of the artifact on the built-in
 * theme, and is made only of the theme's own colours, so an imported theme's
 * creatures match it.
 */
export function accentsOf(
  ui: Pick<UiColors, 'bg' | 'ink' | 'red' | 'onBrand'>,
  { creep, chitin, tissueDeep, tissue }: Pick<SwarmPalette, 'creep' | 'chitin' | 'tissueDeep' | 'tissue'>,
): Pick<
  SwarmPalette,
  'membrane' | 'maw' | 'gum' | 'stain' | 'glint'
> {
  const dark = luminance(ui.bg) < 0.5;
  const [deepest, lightest] = luminance(ui.bg) < luminance(ui.ink) ? [ui.bg, ui.ink] : [ui.ink, ui.bg];
  return {
    membrane: dark
      ? mixColour(creep, ui.red, 0.3)
      : mixColour(mixColour(tissue, ui.red, 0.8), creep, 0.8),
    maw: tissueDeep,
    gum: dark
      ? mixColour(tissueDeep, ui.red, 0.1)
      : mixColour(mixColour(ui.ink, ui.red, 0.55), chitin, 0.5),
    stain: mixColour(mixColour(deepest, ui.red, 0.3), creep, 0.1),
    glint: mixColour(lightest, ui.onBrand, 0.9),
  };
}

/**
 * The swarm canvas's palette for one theme mode.
 *
 * `creep` and `chitin` are the theme's when it carries them (the built-in
 * does) and derived from its own colours when it does not, so an imported
 * theme's creatures match it. `carapace` is always derived. The Brood's
 * tissue ramp (HIVE-221) follows the same rule: the theme's when present,
 * otherwise mixed from its own colours.
 */
export function swarmPaletteOf(ui: UiColors): SwarmPalette {
  const creep = ui.creep ?? mixColour(ui.bg, ui.brand, 0.4);
  const chitin = ui.chitin ?? mixColour(ui.brand, ui.ink, 0.35);
  const tissueDeep = ui.tissueDeep ?? mixColour(ui.bg, chitin, 0.04);
  const tissue = ui.tissue ?? mixColour(ui.bg, chitin, 0.22);
  return {
    bg: ui.bg,
    panel2: ui.panel2,
    ink: ui.ink,
    muted: ui.muted,
    subtle: ui.subtle,
    brand: ui.brand,
    green: ui.green,
    amber: ui.amber,
    red: ui.red,
    creep,
    creepClear: clearColour(creep),
    chitin,
    carapace: mixColour(ui.bg, chitin, 0.18),
    tissueDeep,
    tissue,
    tissueLit: ui.tissueLit ?? mixColour(chitin, ui.ink, 0.2),
    glowCore: ui.glowCore ?? mixColour(ui.green, ui.ink, 0.7),
    ground: ui.ground ?? mixColour(ui.bg, creep, 0.15),
    ...accentsOf(ui, { creep, chitin, tissueDeep, tissue }),
  };
}
