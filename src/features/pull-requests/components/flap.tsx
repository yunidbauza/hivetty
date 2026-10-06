import { useEffect, useState } from 'react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import type { FlapTone, HatchStatus } from '@/types/pull-request';

import { FLAP_TEXT } from '@features/shared/flap-tone';

/** The same tones as a dot: the session panel's PR tab and strip icon (HIVE-209). */
export const FLAP_DOT: Record<FlapTone, string> = {
  muted: 'bg-subtle',
  green: 'bg-green',
  amber: 'bg-amber',
  brand: 'bg-brand',
};

/** Half of `ccflap`'s 360ms: the word lands edge-on. */
const HALF_TURN_MS = 180;

/**
 * A PR's flap (HIVE-205): HIVE-215's word on a chip with the hinge notches.
 * It turns once when the word changes between two renders of the same row,
 * never on mount, so never on first render, a fold or a search. Under reduced
 * motion the word swaps in place and SUMMONS does not pulse.
 */
export function Flap({ hatch }: { hatch: HatchStatus }) {
  const reduced = useReducedMotion();
  const word = hatch.flap === 'HATCHED' && hatch.at !== undefined ? `HATCHED ${hatch.at}` : hatch.flap;
  const [shown, setShown] = useState(word);
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    if (shown === word) return;
    if (reduced) {
      setShown(word);
      return;
    }
    setTurns((n) => n + 1);
    const timer = setTimeout(() => setShown(word), HALF_TURN_MS);
    return () => clearTimeout(timer);
  }, [word, shown, reduced]);

  return (
    <span
      key={turns}
      className={cn(
        'relative inline-block shrink-0 rounded bg-chip px-[7px] py-1 tabular-nums text-micro leading-none font-bold tracking-[0.08em] whitespace-nowrap',
        FLAP_TEXT[hatch.tone],
        hatch.flap === 'SUMMONS' && !reduced && 'animate-ccpulse',
        turns > 0 && !reduced && 'animate-ccflap',
        'before:absolute before:top-1/2 before:-left-[2px] before:size-1 before:-translate-y-1/2 before:rounded-full before:bg-panel',
        'after:absolute after:top-1/2 after:-right-[2px] after:size-1 after:-translate-y-1/2 after:rounded-full after:bg-panel',
      )}
    >
      {shown}
    </span>
  );
}
