/**
 * Every colour the swarm canvas paints with (HIVE-199).
 *
 * The canvas reads colour from JS, as xterm does: nothing in `src/lib/swarm/`
 * holds a colour literal, so Home and the splash both draw in whatever theme
 * is active. `swarmPaletteOf` in `@lib/theme/colour` builds one from a theme's
 * ui group; `useSwarmPalette` hands Home the active one.
 */
export interface SwarmPalette {
  bg: string;
  panel2: string;
  ink: string;
  muted: string;
  subtle: string;
  brand: string;
  green: string;
  amber: string;
  red: string;
  creep: string;
  /** `creep` at alpha 0: the outer stop of the creep's radial gradient. */
  creepClear: string;
  chitin: string;
  /** The creature's body fill. Derived from chitin and bg; HIVE-210 settles it. */
  carapace: string;
  /** The Brood's tissue ramp (HIVE-221): shadowed flesh, `SP_T.lo`. */
  tissueDeep: string;
  /** Mid flesh, `SP_T.mid`. */
  tissue: string;
  /** Lit flesh, `SP_T.hi`. */
  tissueLit: string;
  /** The hot centre of the green glow, `SP_T.core`. */
  glowCore: string;
  /** The ground the creatures stand on, `SP_T.ground`. */
  ground: string;
  /** The hover mutalisk's wing membrane, a bruised magenta (`MEM`). */
  membrane: string;
  /** The inside of its mouth: the deepest tissue. */
  maw: string;
  /** Its gums. */
  gum: string;
  /** The stain on its tusks. */
  stain: string;
  /** Wet glints on eyes and teeth: the brightest colour the theme has. */
  glint: string;
}

/** Draw at `alpha` times the current alpha, then put it back. */
export function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * alpha;
  draw();
  ctx.globalAlpha = base;
}
