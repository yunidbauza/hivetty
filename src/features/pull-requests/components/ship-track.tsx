import { Check } from '@phosphor-icons/react';
import { Fragment, useMemo } from 'react';

import { formatDuration } from '@/lib/format-duration';
import { cn } from '@/lib/utils';
import type { Pr } from '@/types/pull-request';

import { holderIcon } from '@features/pull-requests/holder-icon';
import { bandStops, stopTitle, type BandStop } from '@features/pull-requests/ship-band';
import { useHolderPost, useShipTrack } from '@stores/hive-store';

const DOT: Record<BandStop['state'], string> = {
  done: 'border-green-edge text-green',
  // tint-exempt: an opaque dot over the track line, not a tint
  now: 'border-green bg-[color-mix(in_srgb,var(--cc-green)_30%,var(--cc-bg))] shadow-[0_0_12px_color-mix(in_srgb,var(--cc-green)_55%,transparent)]',
  next: 'border-border',
};

/**
 * The slim ship track (HIVE-205): the shipper's stops in one line under the
 * header, on every tab. Ticked before the stop it is at, that one glowing with
 * its time, dashed after. The green line on the right is the holder, the time
 * at the stop and the holder's newest post naming the PR (D11). No flyer.
 * The note always takes its own line under the stops, and truncates there.
 */
export function ShipTrack({ pr }: { pr: Pr }) {
  const slug = `${pr.owner}/${pr.repo}`;
  const track = useShipTrack(slug, pr.n);
  const stops = useMemo(() => bandStops(pr, track), [pr, track]);
  const current = pr.state !== 'merged' && track.held ? track.current : null;
  const holder = current?.holder ?? null;
  const post = useHolderPost(slug, pr.n, holder);
  const HolderIcon = holder === null ? null : holderIcon(holder);
  const nowIndex = stops.findIndex((s) => s.state === 'now');
  const note = current === null ? '' : [holder, formatDuration(current.spentMs), post?.body.split('\n')[0]].filter(Boolean).join(' · ');

  return (
    <div
      role="group"
      aria-label="Ship track"
      className="@container flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-border-soft bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--cc-green)_5%,transparent)_70%,transparent)] px-5 py-[9px] text-control"
    >
      <span className="text-micro font-semibold tracking-[0.06em] whitespace-nowrap text-subtle uppercase">Ship track</span>
      <ol className="flex min-w-0 flex-1 items-center">
        {stops.map((stop, i) => (
          <Fragment key={stop.key}>
            {i === 0 ? null : (
              <li
                aria-hidden
                className={cn(
                  'mx-[5px] h-0.5 min-w-1.5 flex-1',
                  nowIndex !== -1 && i > nowIndex
                    ? 'bg-[repeating-linear-gradient(90deg,var(--cc-border)_0_4px,transparent_4px_8px)]'
                    : 'bg-green-edge',
                )}
              />
            )}
            <li
              data-state={stop.state}
              title={stopTitle(stop)}
              className={cn(
                'flex items-center gap-[5px] whitespace-nowrap',
                stop.state === 'now' ? 'font-semibold text-green' : stop.state === 'done' ? 'text-muted' : 'text-subtle',
              )}
            >
              <span className={cn('grid size-3.5 place-items-center rounded-full border-[1.5px]', DOT[stop.state])}>
                {stop.state === 'done' ? <Check size={9} weight="bold" aria-hidden /> : null}
              </span>
              <span className={cn(stop.state !== 'now' && '@max-[760px]:sr-only')}>{stop.label}</span>
              {stop.state === 'now' && stop.spentMs !== null ? (
                <span className="tabular-nums text-micro font-normal text-muted">{formatDuration(stop.spentMs)}</span>
              ) : null}
            </li>
          </Fragment>
        ))}
      </ol>
      {current !== null && holder !== null && HolderIcon !== null ? (
        <span data-note className="flex min-w-0 basis-full items-center gap-1.5 text-green">
          <HolderIcon size={13} aria-hidden className="shrink-0" />
          <span className="truncate" title={note}>
            {note}
          </span>
        </span>
      ) : null}
    </div>
  );
}
