import { useCallback, useRef } from 'react';

import { BroodEgg } from '@components/ui/brood-egg';
import { type CanvasPaint, useCanvasLoop } from '@hooks/use-canvas-loop';
import { useReducedMotion } from '@hooks/use-reduced-motion';
import { BLEED, type BroodCreature, paintCreature } from '@lib/swarm/brood';
import { HOVER } from '@lib/swarm/hover';
import { OVERLORD } from '@lib/swarm/overlord';
import { SPIRE } from '@lib/swarm/spire';
import { toneOf } from '@lib/swarm/tone';
import { useSwarmPalette } from '@stores/appearance-store';

/**
 * A small breathing creature, for the surfaces that have nothing else on them.
 *
 * ## Where this is allowed, and at what size
 *
 * Two registers, and the size is what separates them:
 *
 * - **Full-stage surfaces at 72–120 px** — the picker's first run, the dormant
 *   orchestrator, the editor with no file, the settings card. Those own the
 *   whole centre and have nothing to compete with.
 * - **Rails at 44 px** — small enough to read as a mark rather than an
 *   illustration.
 *
 * The header's 40 px brand mark (HIVE-100) was a third, and the only one that
 * was never an empty state; the header went in HIVE-213 and the brand is the
 * Phosphor hexagon now.
 *
 * The rails were text-only when this shipped, on the argument that a decorative
 * empty state in a 320 px column beside a live terminal takes more attention
 * than the thing it is apologising for. That argument is about *size*, not about
 * whether a creature may appear at all: at 44 px the creature occupies less height
 * than the two lines of copy beneath it, and the copy is still what the eye
 * lands on. Anything larger in a rail is the thing the original argument
 * correctly rules out.
 *
 * ## Why a canvas
 *
 * The creatures are the Brood's (HIVE-221): drawn every frame from the theme's
 * own colours, so a light theme or an imported one gets a creature that belongs
 * to it, where the WebP sprites they replaced were painted once in one palette. Each is a pure drawing
 * in `src/lib/swarm/` on its own loop; this component only sizes the canvas to
 * the creature's box and clocks it.
 *
 * ## Motion
 *
 * The canvas animates only while it is on screen and the document is visible
 * (`useCanvasLoop`), so a creature in a hidden pane costs nothing. Under
 * `prefers-reduced-motion` it paints the creature's `rest` frame once and
 * schedules no frame at all. The creature is still there and simply holds
 * still.
 */

export type Creature = 'egg' | 'overlord' | 'spire' | 'mutalisk';

const CANVAS: Record<Exclude<Creature, 'egg'>, BroodCreature> = { overlord: OVERLORD, spire: SPIRE, mutalisk: HOVER };

/** The egg's crop of the Hatchery's viewBox: the shell and its pool, so it fills a creature's box. */
const EGG_BOX = [-80, -96, 160, 150] as const;

/** A Brood creature on its own canvas, `size` tall and as wide as its box. */
function BroodCanvas({
  creature,
  brood,
  size,
  reduced,
  className,
}: {
  creature: Exclude<Creature, 'egg'>;
  brood: BroodCreature;
  size: number;
  reduced: boolean;
  className: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = useSwarmPalette();
  const paint = useCallback<CanvasPaint>(
    (ctx, t, _dt, { w, h, dpr }) => paintCreature(ctx, brood, t % brood.dur, w, h, dpr, toneOf(palette), BLEED),
    [brood, palette],
  );
  useCanvasLoop(ref, paint, { still: reduced ? brood.rest : null });
  const [, , bw, bh] = brood.box;
  const width = (size * bw) / bh;

  return (
    <span
      /**
       * Decorative in the strict sense: the flavour line beneath it is real
       * text and says the same thing, and announcing the creature too would
       * make a screen reader read the state twice.
       */
      aria-hidden="true"
      data-creature={creature}
      style={{ display: 'inline-block', position: 'relative', height: size, width }}
      className={className}
    >
      {/*
        The layout keeps `size`; the canvas bleeds BLEED past it on every side
        (HIVE-222), so a ring, a glow or a wingtip drawn past the box fades out
        instead of ending in a hard edge. It takes no pointer events, so the air
        around the creature never covers what sits beside it.
      */}
      <canvas
        ref={ref}
        style={{
          position: 'absolute',
          left: -width * BLEED,
          top: -size * BLEED,
          width: width * (1 + 2 * BLEED),
          height: size * (1 + 2 * BLEED),
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}

export function SwarmCreature({
  creature,
  size = 96,
  className,
}: {
  /**
   * Which one. The casting is a second channel, not decoration, so it is fixed
   * per surface rather than chosen per render:
   *
   * - **Overlord** — the overmind's empty fleet and the settings projects card
   *   at 120px, the projects rail, and the explorer with no session open. It
   *   hovers and watches without acting, which is what those states are.
   * - **Spire** — work, pull requests, the editor with no file, and the settings
   *   skills card at 120px. Things with a lifecycle, caught mid-morph.
   * - **Mutalisk** — agents, and the settings agents card at 120px. The unit
   *   that does the work, holding the air until it is sent.
   * - **Egg** — an empty repository in the explorer: nothing has hatched there
   *   yet. The Hatchery's own SVG egg (`BroodEgg`), cropped to a creature's box.
   * - **Drawn, not cast**: the boot cover picks the overlord, the mutalisk or the
   *   spire once per mount, and the new-session picker picks the egg, the spire,
   *   the overlord or the mutalisk once per opening, at 120px. Neither has a
   *   neighbour in that state for a different creature to clash with.
   *
   * That is every call site; a reviewer should be able to check any one of them
   * against this list and find it here. The hive left the casting when every
   * surface it held moved to one of these four.
   *
   * A surface that picks a different creature than its neighbours in the same
   * state turns the channel back into noise, which is the whole reason this is
   * a fixed prop and not a random draw like the phrase beneath it. The boot
   * cover's and the picker's draws happen at their call sites, not here.
   */
  creature: Creature;
  /** Rendered height in px. The width follows the creature's own box. */
  size?: number;
  /** Layout classes for the creature's box, such as the room below it. */
  className?: string;
}) {
  const reduced = useReducedMotion();
  const cls = className === undefined ? 'select-none' : `select-none ${className}`;

  if (creature === 'egg') {
    // The Hatchery's own SVG egg; it handles reduced motion itself.
    return (
      <span
        aria-hidden="true"
        data-creature="egg"
        style={{ display: 'inline-block', height: size, width: (size * EGG_BOX[2]) / EGG_BOX[3] }}
        className={cls}
      >
        <BroodEgg className="block h-full w-full" viewBox={EGG_BOX.join(' ')} />
      </span>
    );
  }
  return <BroodCanvas creature={creature} brood={CANVAS[creature]} size={size} reduced={reduced} className={cls} />;
}
