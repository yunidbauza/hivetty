import { GitPullRequest, Hexagon } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { Pr } from '@/types/pull-request';

import { SegmentedControl } from '@components/ui/segmented-control';
import { ThreadCard } from '@features/pull-requests/components/thread-card';
import { useThreadWrites } from '@features/pull-requests/use-thread-writes';
import { Markdown } from '@features/shared/components/markdown';
import type { PrComment, PrDetail, PrReview, PrThread } from '@shared/github-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import { usePrEvents, useReviewUrls } from '@stores/hive-store';
import { usePrConversation, usePrFocus, usePrPageActions } from '@stores/ui-store';

const MODES = [
  { value: 'comments', label: 'Comments' },
  { value: 'everything', label: 'Everything' },
] as const;

type Item =
  | { kind: 'comment'; at: number; key: string; comment: PrComment }
  | { kind: 'review'; at: number; key: string; review: PrReview }
  | { kind: 'thread'; at: number; key: string; thread: PrThread }
  | { kind: 'event'; at: number; key: string; entry: LedgerEntry };

const VERDICT: Record<string, [string, string]> = {
  CHANGES_REQUESTED: ['changes requested', 'text-amber-text bg-amber-strong'],
  APPROVED: ['approved', 'text-green bg-green-strong'],
  COMMENTED: ['commented', 'text-muted bg-chip'],
  DISMISSED: ['dismissed', 'text-subtle bg-chip'],
};

const AVATAR = 'grid size-[26px] shrink-0 place-items-center rounded-full bg-panel-2 text-micro font-semibold text-ink';

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
/** `Maria Ortiz` → `MO`, `acr` → `AC` (copied from the Work slice, which this one cannot import; R6). */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2)).toUpperCase();
};
const clock = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
/** Sort time; a pending review (no `submittedAt`) or an empty thread sorts last. */
const when = (iso: string | null | undefined) => {
  const at = Date.parse(iso ?? '');
  return Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at;
};
/** A review left only inline comments: its threads say it. */
const shown = (review: PrReview) =>
  review.body.trim() !== '' || review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED';

/** Who said it, and when: the line over a comment or a review. */
function Said({
  author,
  via,
  at,
  verdict,
}: {
  author: string;
  via: boolean;
  at: string | null;
  verdict?: [string, string];
}) {
  return (
    <div className="flex items-center gap-2 px-1.5 pt-[7px] text-control">
      <span aria-hidden className={AVATAR}>
        {initials(author)}
      </span>
      <span className="font-medium text-ink">{author}</span>
      {via ? <span className="text-micro text-subtle">via Hive TTY</span> : null}
      {verdict === undefined ? null : (
        <span className={cn('rounded-md px-[7px] py-0.5 tabular-nums text-micro font-semibold', verdict[1])}>
          {verdict[0]}
        </span>
      )}
      <span className="flex-1" />
      {at === null ? null : (
        <time dateTime={at} className="tabular-nums text-micro text-subtle">
          {clock(at)}
        </time>
      )}
    </div>
  );
}

function ReviewItem({ review, viaHive }: { review: PrReview; viaHive: boolean }) {
  return (
    <>
      <Said
        author={viaHive ? 'acr' : (review.author ?? 'ghost')}
        via={viaHive}
        at={review.submittedAt}
        verdict={VERDICT[review.state] ?? [review.state.toLowerCase(), 'text-muted bg-chip']}
      />
      {review.body.trim() === '' ? null : (
        <div className="pl-[46px] text-ui">
          <Markdown source={review.body} />
        </div>
      )}
    </>
  );
}

/** One ledger event: a glyph and `<from> <the body's first line>`. */
function EventItem({ entry }: { entry: LedgerEntry }) {
  const Glyph = entry.meta?.['pr'] === undefined ? Hexagon : GitPullRequest;
  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 px-1.5 py-1 text-control text-muted">
      <span className="grid place-items-center text-subtle">
        <Glyph size={13} aria-hidden />
      </span>
      <span className="min-w-0 truncate">
        <span className="text-ink">{entry.from}</span> {entry.body.split('\n')[0]}
      </span>
    </div>
  );
}

/**
 * The Conversation tab (HIVE-205): the PR body, then GitHub's comments,
 * reviews and review threads oldest first; Everything adds the Hive's events
 * naming the PR. A review whose URL an acr ledger entry carries shows as acr,
 * via the Hive (D12).
 */
export function PrConversation({
  pr,
  detail,
  fixerOnIt,
  onOpenFile,
}: {
  pr: Pr;
  detail: PrDetail;
  fixerOnIt: boolean;
  onOpenFile?: (path: string, line: number) => void;
}) {
  const events = usePrEvents(`${pr.owner}/${pr.repo}`, pr.n);
  const writes = useThreadWrites(pr);
  const viaHive = useReviewUrls();
  const mode = usePrConversation();
  const focus = usePrFocus();
  const { setPrConversation, clearPrFocus } = usePrPageActions();
  const listRef = useRef<HTMLUListElement>(null);
  const reviews = useMemo(() => detail.reviews.filter(shown), [detail.reviews]);
  const openThreads = detail.threads.filter((thread) => !thread.isResolved).length;

  const items = useMemo<Item[]>(() => {
    const github: Item[] = [
      ...detail.comments.map((comment) => ({
        kind: 'comment' as const,
        at: when(comment.createdAt),
        key: `c-${comment.url}`,
        comment,
      })),
      ...reviews.map((review) => ({
        kind: 'review' as const,
        at: when(review.submittedAt),
        key: `r-${review.url}`,
        review,
      })),
      ...detail.threads.map((thread) => ({
        kind: 'thread' as const,
        at: when(thread.comments[0]?.createdAt),
        key: `t-${thread.id}`,
        thread,
      })),
    ];
    const hive: Item[] =
      mode === 'everything'
        ? events.map((entry) => ({ kind: 'event' as const, at: entry.ts, key: `e-${entry.id}`, entry }))
        : [];
    return [...github, ...hive].sort((a, b) => a.at - b.at);
  }, [detail.comments, detail.threads, reviews, events, mode]);

  /* The Timeline clicked through (HIVE-208): scroll its item into view once it is in the list, then let go. */
  useEffect(() => {
    if (focus === null) return;
    const item = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-key]') ?? [])].find(
      (el) => el.dataset['key'] === focus,
    );
    if (item === undefined) return;
    item.scrollIntoView({ block: 'center' });
    clearPrFocus();
  }, [focus, items, clearPrFocus]);

  return (
    <div className="flex flex-col gap-3">
      <div className="pt-3 pb-1">
        {detail.body.trim() === '' ? (
          <p className="text-ui text-subtle">No description.</p>
        ) : (
          <Markdown source={detail.body} />
        )}
      </div>
      <section aria-labelledby="pr-conversation" className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 pt-2">
          <h2 id="pr-conversation" className="text-micro font-semibold tracking-[0.06em] text-subtle uppercase">
            Conversation
          </h2>
          <span className="text-control text-muted">
            {`${plural(detail.comments.length, 'comment', 'comments')} · ${plural(reviews.length, 'review', 'reviews')} · ${plural(openThreads, 'open thread', 'open threads')}`}
          </span>
          <span className="flex-1" />
          <SegmentedControl label="Show" options={MODES} value={mode} onChange={setPrConversation} />
        </div>
        <ul ref={listRef} aria-label="Conversation" className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key} data-key={item.key} data-kind={item.kind}>
              {item.kind === 'comment' ? (
                <>
                  <Said author={item.comment.author ?? 'ghost'} via={false} at={item.comment.createdAt} />
                  <div className="pl-[46px] text-ui">
                    <Markdown source={item.comment.body} />
                  </div>
                </>
              ) : item.kind === 'review' ? (
                <ReviewItem review={item.review} viaHive={viaHive.has(item.review.url)} />
              ) : item.kind === 'thread' ? (
                <div className="pl-[40px]">
                  <ThreadCard
                    thread={item.thread}
                    fixerOnIt={fixerOnIt && !item.thread.isResolved}
                    onOpenFile={onOpenFile}
                    writes={writes}
                  />
                </div>
              ) : (
                <EventItem entry={item.entry} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
