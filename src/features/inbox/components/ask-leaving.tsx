import type { HiveNotification } from '@/types/notification';

import type { LedgerEntry } from '@shared/ledger-contract';
import { useDisplayName, useIsAgentId, useThread } from '@stores/hive-store';
import { useAnsweredHere } from '@stores/ui-store';

export type LeaveReason = { kind: 'expired' } | { kind: 'answered'; on?: string } | null;

/** Why `thread` closed, read off its ledger entries (HIVE-218). `null`: it never closed. */
export function leaveReason(entries: readonly LedgerEntry[], thread: string, answeredHere: boolean): LeaveReason {
  const answer = entries.find((entry) => entry.kind === 'answer');
  if (answer !== undefined) {
    const on = answer.meta?.['answeredOn'];
    return typeof on === 'string' && on !== '' && !answeredHere ? { kind: 'answered', on } : { kind: 'answered' };
  }
  const expired = entries.some(
    (entry) => entry.kind === 'event' && entry.from === 'overmind' && entry.meta?.['expired'] === thread,
  );
  return expired ? { kind: 'expired' } : null;
}

/** Why `thread` closed, live from the store (HIVE-218). `''` asks nothing and answers `null`. */
export function useLeaveReason(thread: string): LeaveReason {
  const entries = useThread(thread);
  const here = useAnsweredHere(thread);
  return thread === '' ? null : leaveReason(entries, thread, here);
}

/**
 * The line a closed ask leaves behind for one beat (HIVE-218), styled as the collapsed
 * "answered" line `AskCard` draws. Nothing for a row that left without closing. It fades in
 * (`ccslidein`) rather than out: `ccslideout` would hide it long before `LEAVE_MS` is up.
 */
export function AskLeaving({ notif, thread }: { notif: HiveNotification; thread: string }) {
  const entries = useThread(thread);
  const reason = useLeaveReason(thread);
  const ask = entries.find((entry) => entry.id === thread);
  const from = ask?.from ?? entries.find((entry) => entry.kind === 'answer')?.to ?? '';
  const fromIsAgent = useIsAgentId(from);
  const sessionName = useDisplayName(fromIsAgent ? '' : from);
  if (reason === null) return null;
  const asker = (fromIsAgent ? from : sessionName) || notif.title;

  return (
    <div
      data-leaving={reason.kind}
      role="status"
      className="rounded-xl border border-dashed border-border px-3 py-[7px] text-micro text-subtle motion-safe:animate-ccslidein"
    >
      <span className="font-medium text-muted">{asker}</span>
      {' · '}
      {reason.kind === 'expired' ? (
        <span className="text-amber-text">expired</span>
      ) : (
        <>
          <span className="text-green">answered</span>
          {reason.on === undefined ? null : (
            <>
              {' on '}
              <span className="tabular-nums text-ink">{reason.on}</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
