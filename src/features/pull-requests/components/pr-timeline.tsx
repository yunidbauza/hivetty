import { useCallback, useState } from 'react';

import { createPoller } from '@/hooks/create-poller';
import { fraction, ticks, type CiBar, type TimelineModel } from '@/lib/pr-timeline';
import type { FlapTone, Pr } from '@/types/pull-request';

import { dur, TimeBuckets } from '@features/pull-requests/components/time-buckets';
import { axisLeft, GUTTER, TimelineLane, useMeasuredWidth, type LaneMark } from '@features/pull-requests/components/timeline-lane';
import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import { SourceProblem } from '@features/shared/components/source-problem';
import { prKey, useLoadPrTimeline, usePrTimelineEntry, useTimelineModel } from '@stores/hive-store';
import { usePrPageActions } from '@stores/ui-store';

/** The Timeline re-reads once a minute, and only while this tab is mounted (HIVE-208, D10). */
const usePollTimeline = createPoller({ intervalMs: 60_000 });

const pad = (n: number) => String(n).padStart(2, '0');
/** `HH:MM`, local. */
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const between = (from: number, to: number) => `${clock(from)}–${clock(to)} · ${dur(to - from)}`;

const FLAP: Record<FlapTone, string> = {
  muted: 'bg-[color-mix(in_srgb,var(--cc-subtle)_16%,transparent)] text-muted',
  green: 'bg-green-strong text-green',
  amber: 'bg-amber-strong text-amber-text',
  brand: 'bg-brand-strong text-brand',
};
/** MUTATING's stripes (D1), over its green. */
const STRIPES =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--cc-green)_24%,transparent)_0_6px,color-mix(in_srgb,var(--cc-green)_10%,transparent)_6px_12px)]';
const CI: Record<CiBar['state'], string> = {
  // tint-exempt: data-viz bar fills, not status tints
  passed: 'bg-green/60',
  // tint-exempt: data-viz bar fills, not status tints
  failed: 'bg-red/65',
  // tint-exempt: data-viz bar fills, not status tints
  running: 'bg-green/30',
  other: 'bg-subtle/40',
};
const HOLD =
  'border-[color-mix(in_srgb,var(--cc-chitin)_45%,transparent)] bg-[color-mix(in_srgb,var(--cc-chitin)_16%,transparent)] text-ink';

type Actions = ReturnType<typeof usePrPageActions>;

/** Every lane's marks, with the tooltip lines and where each click goes. */
function lanes(model: TimelineModel, act: Actions): { label: string; marks: LaneMark[]; height?: 40 }[] {
  const f = (t: number) => fraction(t, model.start, model.end);
  const ledger = (id: string | null, fallback: () => void) => () => {
    if (id === null) fallback();
    else act.focusPrEvent(`e-${id}`, true);
  };
  return [
    {
      label: 'Flap',
      height: 40,
      marks: model.flaps.map((span, i) => ({
        key: `f-${String(span.from)}`,
        from: f(span.from),
        to: f(span.to),
        shape: 'flap',
        tone: `${FLAP[span.tone]} ${span.flap === 'MUTATING' ? STRIPES : ''}`,
        word: span.flap,
        tip: [span.flap, between(span.from, span.to)],
        onOpen: ledger(model.flapEvents[i] ?? null, () => act.setPrTab('conversation')),
      })),
    },
    {
      label: 'Commits',
      marks: model.commits.map((commit) => ({
        key: `k-${commit.oid}`,
        from: f(commit.at),
        shape: 'commit',
        tone: '',
        tip: [`Commit ${commit.oid.slice(0, 7)}`, clock(commit.at)],
        /* The mapping falls back to '' when GitHub gave no URL: nothing to open. */
        onOpen: () => {
          if (commit.url !== '') window.open(commit.url, '_blank', 'noopener,noreferrer');
        },
      })),
    },
    {
      label: 'CI',
      marks: model.bars.map((bar) => ({
        key: `b-${String(bar.id)}`,
        from: f(bar.from),
        to: f(bar.to),
        shape: 'ci',
        tone: CI[bar.state],
        tip: [
          `Run #${String(bar.number)} · ${bar.state}`,
          ...(bar.failedJobs.length > 0 ? [bar.failedJobs.join(', ')] : []),
          `${dur(bar.to - bar.from)}${bar.state === 'running' ? ' so far' : ''} · on ${bar.sha.slice(0, 7)}`,
        ],
        onOpen: () => {
          act.setPrTab('checks');
          act.showPrRun(bar.sha);
        },
      })),
    },
    {
      label: 'Reviews',
      marks: model.reviews.map((review) => ({
        key: `r-${review.target.kind === 'github' ? review.target.url : review.target.id}`,
        from: f(review.at),
        shape: 'review',
        tone: review.amber ? 'bg-amber' : 'bg-subtle',
        word: review.label,
        tip: [review.label, clock(review.at)],
        onOpen: () => {
          if (review.target.kind === 'github') act.focusPrEvent(`r-${review.target.url}`, false);
          else act.focusPrEvent(`e-${review.target.id}`, true);
        },
      })),
    },
    {
      label: 'Comments',
      marks: model.comments.map((comment) => ({
        key: `c-${comment.url}`,
        from: f(comment.at),
        shape: 'comment',
        tone: 'bg-brand',
        word: comment.author,
        tip: [`Comment · ${comment.author}`, clock(comment.at)],
        onOpen: () => act.focusPrEvent(`c-${comment.url}`, false),
      })),
    },
    {
      label: 'Agents',
      marks: model.holds.map((hold) => ({
        key: `h-${hold.who}-${String(hold.from)}`,
        from: f(hold.from),
        to: f(hold.to),
        shape: 'hold',
        tone: HOLD,
        word: hold.who,
        tip: [`${hold.who} held it`, between(hold.from, hold.to)],
        onOpen: ledger(hold.firstEventId, () => {
          act.setPrConversation('everything');
          act.setPrTab('conversation');
        }),
      })),
    },
  ];
}

/**
 * The PR page's Timeline tab (HIVE-208): the flap band and the lanes on one
 * time axis, the now line while the PR is open, and where the time went.
 * Every mark opens its event: Checks for a run, GitHub for a commit, else the
 * Conversation scrolled to it.
 */
export function PrTimeline({ pr }: { pr: Pr }) {
  const entry = usePrTimelineEntry(prKey(pr.owner, pr.repo, pr.n));
  const load = useLoadPrTimeline();
  const actions = usePrPageActions();
  /* Captured per poll, so the model's memo holds between ticks. */
  const [now, setNow] = useState(Date.now);
  const model = useTimelineModel(pr, now);
  const [axisRef, width] = useMeasuredWidth();

  usePollTimeline(
    useCallback(() => load(pr.owner, pr.repo, pr.n).then(() => setNow(Date.now())), [load, pr.owner, pr.repo, pr.n]),
  );
  const retry = () => void load(pr.owner, pr.repo, pr.n);

  if (model === null) {
    if (entry?.state === 'failed') {
      return (
        <section aria-label="Timeline" className="px-6 pt-4">
          <SourceProblem message={entry.problem ?? 'Could not read the timeline.'} onRetry={retry} />
        </section>
      );
    }
    return (
      <section aria-label="Timeline" className="px-6 pt-4">
        <div role="status" aria-label="Loading timeline" aria-busy className="flex animate-pulse flex-col gap-2">
          <SkeletonBar className="w-[92%]" />
          <SkeletonBar className="w-[74%]" />
          <SkeletonBar className="w-[58%]" />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Timeline" className="flex flex-col gap-6 px-6 pt-4 pb-6">
      {entry?.problem === undefined ? null : <SourceProblem message={entry.problem} onRetry={retry} />}
      <div ref={axisRef} className="relative">
        {lanes(model, actions).map((lane) => (
          <TimelineLane key={lane.label} label={lane.label} marks={lane.marks} height={lane.height} />
        ))}
        <div aria-hidden className="relative h-6">
          {ticks(model.start, model.end, width - GUTTER).map((tick) => (
            <span
              key={tick.at}
              className="absolute top-1.5 -translate-x-1/2 tabular-nums text-micro whitespace-nowrap text-subtle"
              style={{ left: axisLeft(tick.f) }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        {model.merged ? null : (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 border-l-[1.5px] border-green"
            style={{ left: axisLeft(fraction(now, model.start, model.end)) }}
          >
            <span className="absolute -bottom-5 -translate-x-1/2 tabular-nums text-micro text-green">now</span>
          </div>
        )}
      </div>
      <TimeBuckets age={model.end - model.start} buckets={model.buckets} sentence={model.sentence} />
    </section>
  );
}
