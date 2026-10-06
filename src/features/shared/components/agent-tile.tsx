import { cn } from '@/lib/utils';

import { Icon } from '@components/ui/icon';

/** What the tile says about its agent; `resting` is sleeping and paused alike. */
export type TileTone = 'asking' | 'failed' | 'working' | 'resting' | 'invalid';

interface AgentTileProps {
  icon: string;
  tone: TileTone;
  /** Runs in flight. The badge shows only past one: a single run is what working already says. */
  live: number;
  /** `sm` is a card header's glyph (HIVE-198): 24×26, an 11px icon, no glow. */
  size?: 'md' | 'sm';
}

/*
  Fills and the glow go through `color-mix` on the token rather than an opacity
  modifier, so they follow the theme's own value and no hex is written down.
*/
const TONE: Record<TileTone, string> = {
  asking:
    'text-amber-text [&_polygon]:fill-[color-mix(in_srgb,var(--cc-amber)_22%,transparent)]',
  failed: 'text-red [&_polygon]:fill-[color-mix(in_srgb,var(--cc-red)_14%,transparent)]',
  working: 'text-green',
  resting: 'text-subtle',
  invalid: 'text-amber-text',
};

/** Asking glows, at the panel's size only: a small tile in a card header stays flat. */
const GLOW: Partial<Record<TileTone, string>> = {
  asking: 'drop-shadow-[0_0_5px_var(--cc-amber)]',
};

/**
 * The agent's tile in the panel (HIVE-204), and at `sm` in an ask card's header (HIVE-198): a hexagon outlined in its state's
 * colour, the agent's glyph inside it, and a live-run count when more than one
 * run is in flight.
 *
 * Decoration, so `aria-hidden`: the row's accessible name says the state and
 * the run count in words, and the colour is never the only carrier.
 */
export function AgentTile({ icon, tone, live, size = 'md' }: AgentTileProps) {
  const small = size === 'sm';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center',
        small ? 'h-[26px] w-6' : 'h-10 w-[38px]',
        TONE[tone],
        !small && GLOW[tone],
      )}
    >
      <svg
        viewBox="0 0 38 40"
        className="absolute inset-0 size-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
      >
        <polygon points="19,1.5 36,10.75 36,29.25 19,38.5 2,29.25 2,10.75" />
      </svg>
      <Icon name={icon} size={small ? 11 : 15} className="relative" />
      {live > 1 ? (
        <b
          // tint-exempt: a solid count badge, past the tint scale
          className="absolute -top-1 -right-1.5 grid size-[17px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--cc-green)_45%,transparent)] tabular-nums text-micro text-ink">
          {live}
        </b>
      ) : null}
    </span>
  );
}
