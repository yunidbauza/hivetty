import { Circle } from '@phosphor-icons/react';

import type { HiveNotification } from '@/types/notification';

import { waitText } from '@features/home/cell-text';
import { StripHead, StripRow } from '@features/home/components/strip-row';
import { useOnStage } from '@hooks/use-on-stage';
import { useDisplayName, useSummons } from '@stores/hive-store';
import { useInboxActions } from '@stores/ui-store';

export const NEEDS_YOU_MAX = 5;

/** Who asked: the asker named on the row, else the session the row is about. */
const askerOf = (n: HiveNotification): string =>
  n.subject ?? (n.action.type === 'session' ? n.action.entityId : '');

function NeedsYouRow({ notif, now }: { notif: HiveNotification; now: number }) {
  const who = askerOf(notif);
  const name = useDisplayName(who);
  const { openInboxDrawer } = useInboxActions();
  const { action } = notif;
  return (
    <StripRow
      icon={<Circle size={9} weight="fill" className="text-amber-text" aria-hidden="true" />}
      name={who === '' ? notif.title : name}
      detail={who === '' ? (notif.body.split('\n')[0] ?? '') : notif.title}
      value={waitText(notif.createdAt, now)}
      valueClass="text-amber-text"
      onClick={() => openInboxDrawer(action.type === 'ask' ? action.thread : undefined)}
    />
  );
}

/**
 * Home's Needs you (HIVE-200): HIVE-214's queue, the pill's count, oldest wait
 * first, at most five rows. Every row opens HIVE-198's drawer, on its thread for
 * an ask (HIVE-217); nothing is answered from Home.
 */
export function NeedsYou() {
  const { asks, sessions } = useSummons(useOnStage());
  const { openInboxDrawer } = useInboxActions();
  const queue = [...asks, ...sessions].sort((a, b) => a.createdAt - b.createdAt);
  const now = Date.now();
  const more = queue.length - NEEDS_YOU_MAX;
  return (
    <section aria-labelledby="needs-you-head" className="grid min-w-0 content-start gap-px">
      <StripHead>
        <span id="needs-you-head">
          Needs you <b className="tabular-nums text-control text-amber-text">{queue.length}</b>
        </span>
      </StripHead>
      {queue.slice(0, NEEDS_YOU_MAX).map((n) => (
        <NeedsYouRow key={n.id} notif={n} now={now} />
      ))}
      {more > 0 && (
        <button
          type="button"
          className="px-1 py-[5px] text-left text-control text-muted hover:text-ink"
          onClick={() => openInboxDrawer()}
        >
          {more} more in the Inbox ›
        </button>
      )}
    </section>
  );
}
