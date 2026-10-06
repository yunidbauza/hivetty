import { useLayoutEffect, useRef } from 'react';

import { isSession, isTerminated, type Entity } from '@/types/entity';

import { useBackToOrch } from '@stores/ui-store';

/**
 * Back to the Overmind when the session on stage ends while it is watched.
 *
 * `/exit` or `/done` typed into a live session is the user leaving it, so the
 * ended card would be one more click for a decision already made. Only the
 * live-to-ended transition leaves: a session opened after it ended keeps
 * `SessionEndedCover`, because Resume and the reason are what it came for.
 *
 * Only a clean ending leaves. A session whose process was killed or lost
 * (`lost`) keeps the card, because the reason is on it and nobody chose it.
 *
 * A layout effect, so the card never paints for the frame before the move.
 * `entity` is the session on a terminal view, or `null` for anything else, so
 * a session ending behind the editor or another tab moves nobody.
 */
export function useLeaveOnEnd(entity: Entity | null): void {
  const backToOrch = useBackToOrch();
  const liveId = useRef<string | null>(null);
  const id = entity?.id ?? null;
  const ended = entity !== null && isTerminated(entity);
  const lost = entity !== null && isSession(entity) && entity.lost !== undefined;

  useLayoutEffect(() => {
    if (ended && !lost && id === liveId.current) backToOrch();
    liveId.current = ended ? null : id;
  }, [id, ended, lost, backToOrch]);
}
