import { Bell } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import { useReducedMotion } from '@hooks/use-reduced-motion';
import { useSummons } from '@stores/hive-store';
import { useArrivalPulse, useInboxActions, useInboxDrawer } from '@stores/ui-store';

interface InboxPillProps {
  /** The terminal on this window's stage, left out of the count. */
  onStage: string | null;
}

/**
 * What needs you, as a count in the stage's corner (HIVE-198). Nothing
 * waiting draws nothing; the drawer open hides it, since the drawer is the
 * same queue whole.
 *
 * A quiet arrival (the keyboard was in a terminal) never rises as a card; the
 * pill pulses once for it instead, and only when the row is one it counts, so
 * the session you are typing into never pulses it.
 */
export function InboxPill({ onStage }: InboxPillProps) {
  const { asks, sessions } = useSummons(onStage);
  const pulse = useArrivalPulse();
  const { open } = useInboxDrawer();
  const { openInboxDrawer } = useInboxActions();
  const reduced = useReducedMotion();

  const count = asks.length + sessions.length;
  if (count === 0 || open) return null;

  const counted = pulse !== null && [...asks, ...sessions].some((row) => row.id === pulse);

  return (
    <button
      // Keyed by the pulsing id, so each quiet arrival plays the pulse once.
      key={counted ? pulse : 'still'}
      type="button"
      // The exact number, singular-aware, even when the face says 99+ (HIVE-211).
      aria-label={`Inbox, ${String(count)} ${count === 1 ? 'needs' : 'need'} you`}
      onClick={() => openInboxDrawer()}
      className={cn(
        'flex items-center gap-[7px] rounded-full border border-amber-edge bg-panel-2 py-1.5 pr-3 pl-2.5 text-control text-muted shadow-lg',
        counted && !reduced && 'motion-safe:animate-ccpulse motion-safe:[animation-iteration-count:1]',
      )}
    >
      <Bell size={14} className="text-amber-text" aria-hidden />
      <b className="tabular-nums font-semibold text-amber-text">{count > 99 ? '99+' : count}</b>
      <span>need you</span>
    </button>
  );
}
