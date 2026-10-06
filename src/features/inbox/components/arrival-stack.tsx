import { useEffect, useMemo, useState } from 'react';


import { cn } from '@/lib/utils';
import type { HiveNotification } from '@/types/notification';

import { useLeavingAsks } from '@features/inbox/hooks/use-leaving-asks';
import { useReducedMotion } from '@hooks/use-reduced-motion';
import { isSessionSummons } from '@shared/notification-lanes';
import { useSummons } from '@stores/hive-store';
import { useArrivals, useInboxActions, useSettingsOpen } from '@stores/ui-store';

import { AskCard } from './ask-card';
import { AskLeaving, useLeaveReason } from './ask-leaving';
import { NotificationCard } from './notification-card';
import { SessionNote } from './session-note';

/** How long an arrival stays up untouched before it folds into the pill. */
export const ARRIVAL_FOLD_MS = 5000;

/** What the corner's polite live region says for the newest arrival. */
export const announcement = (row: HiveNotification, asker: string): string =>
  isSessionSummons(row)
    ? `${asker} ${row.title}`
    : `${asker} ${row.kind === 'agent.permission' ? 'wants to run a command' : 'asks'}: ${row.title}`;

/**
 * Arrivals still in the queue, newest first (HIVE-198).
 *
 * Filtered here rather than when pushed: the on-stage session, an answered
 * ask, a dismissed row all drop out of `useSummons`, and so out of this.
 */
export function useVisibleArrivals(onStage: string | null): HiveNotification[] {
  const arrivals = useArrivals();
  const { asks, sessions } = useSummons(onStage);
  return useMemo(() => {
    const byId = new Map([...asks, ...sessions].map((row) => [row.id, row]));
    return arrivals.flatMap((id) => byId.get(id) ?? []);
  }, [arrivals, asks, sessions]);
}

interface ArrivalStackProps {
  /** The terminal on this window's stage, never drawn. */
  onStage: string | null;
}

/**
 * What just arrived, over the pill (HIVE-198): the newest as an answerable
 * card, or a note for a session off stage, with up to two slivers under it
 * for the rest of a burst. It never takes focus.
 *
 * Not drawn while Settings is open: the queue waits, and rises when it closes,
 * and its 5 seconds start then, since the fold timer runs only while it is up.
 * Every arrival restarts the clock (the burst); the pointer over it, or focus
 * in it (a reply being typed, a button pressed), holds it up.
 */
export function ArrivalStack({ onStage }: ArrivalStackProps) {
  const visible = useVisibleArrivals(onStage);
  const settings = useSettingsOpen();
  const { foldArrivals } = useInboxActions();
  const reduced = useReducedMotion();
  const arrivals = useArrivals();
  const [held, setHeld] = useState({ hover: false, focus: false });
  const up = !settings && visible.length > 0;
  /*
    The slot's content (HIVE-218): the newest live arrival, or an ask that just
    closed, held one beat with its reason. `up`, the fold timer and the burst
    count stay on live rows only.
  */
  const placed = useLeavingAsks(visible);

  /*
    A hold belongs to the stack it was taken on. Folded under the pointer (✕,
    Later), the stack unmounts before any pointerleave or blur can fire, and a
    hold left set would keep every later arrival up for good.
  */
  useEffect(() => {
    if (!up) setHeld({ hover: false, focus: false });
  }, [up]);

  // The burst rule: every arrival restarts the clock, so `arrivals` is a dependency.
  useEffect(() => {
    if (!up || held.hover || held.focus) return;
    const timer = setTimeout(foldArrivals, ARRIVAL_FOLD_MS);
    return () => clearTimeout(timer);
  }, [up, held.hover, held.focus, arrivals, foldArrivals]);

  const [shown] = placed;
  // A row folded or dismissed by hand left without closing: nothing to say, so no box either.
  const leftClosed =
    useLeaveReason(shown?.leaving === true && shown.row.action.type === 'ask' ? shown.row.action.thread : '') !== null;
  if (settings || shown === undefined || (shown.leaving && !leftClosed)) return null;
  const newest = shown.row;

  const slivers = Math.max(0, Math.min(visible.length - 1, 2));

  return (
    <div
      data-testid="arrival-stack"
      className="flex flex-col items-end gap-1.5"
      onPointerEnter={() => setHeld((h) => ({ ...h, hover: true }))}
      onPointerLeave={() => setHeld((h) => ({ ...h, hover: false }))}
      onFocus={() => setHeld((h) => ({ ...h, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHeld((h) => ({ ...h, focus: false }));
        }
      }}
    >
      {visible.length > 1 ? (
        <span className="rounded-full border border-border bg-panel-2 px-2.5 py-1 text-ui-sm text-muted">
          {`${String(visible.length)} arrived just now · newest first`}
        </span>
      ) : null}
      <div className={cn('relative w-[380px] max-w-full', !reduced && 'motion-safe:animate-ccslidein')}>
        <div className="relative z-[2] rounded-xl shadow-xl [&>article]:border-amber-edge">
          {shown.leaving && newest.action.type === 'ask' ? (
            <AskLeaving notif={newest} thread={newest.action.thread} />
          ) : isSessionSummons(newest) ? (
            <SessionNote notif={newest} variant="note" onFold={foldArrivals} />
          ) : newest.action.type === 'ask' ? (
            <AskCard key={newest.id} notif={newest} thread={newest.action.thread} onClose={foldArrivals} />
          ) : (
            <NotificationCard notif={newest} />
          )}
        </div>
        {slivers >= 1 ? (
          <span
            data-sliver
            aria-hidden
            className="absolute inset-x-3 -bottom-[7px] z-[1] h-3 rounded-b-xl border border-t-0 border-border bg-panel-2"
          />
        ) : null}
        {slivers >= 2 ? (
          <span
            data-sliver
            aria-hidden
            className="absolute inset-x-6 -bottom-[13px] z-0 h-3 rounded-b-xl border border-t-0 border-border bg-panel-2 opacity-70"
          />
        ) : null}
      </div>
    </div>
  );
}
