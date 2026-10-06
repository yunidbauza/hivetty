import { CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useCallback, type ReactNode } from 'react';

import { usePrRefresh } from '@/hooks/use-pr-refresh';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';
import { isSession } from '@/types/entity';
import type { HatcheryRow } from '@/types/pull-request';

import { EmptyState } from '@components/ui/empty-state';
import { PullIndicator } from '@components/ui/pull-indicator';
import { PrRow } from '@features/pull-requests/components/pr-row';
import { PrListSkeleton } from '@features/pull-requests/components/pr-row-skeleton';
import { PrSearchRow } from '@features/pull-requests/components/pr-search-row';
import { useOpenPr } from '@features/pull-requests/open-pr';
import { SourceProblem } from '@features/shared/components/source-problem';
import { StaleLine } from '@features/shared/components/stale-line';
import {
  prKey,
  useActiveEntity,
  useHatchery,
  useHatcherySearch,
  usePrNeedsYouCount,
  usePrSearch,
  usePrSource,
  usePrsReadAt,
  useRefreshPrs,
  type PrSource,
} from '@stores/hive-store';
import { useClearPrSearch, usePrPageActions, usePrSearchOpen, usePrSearchTerm, usePrsFolded } from '@stores/ui-store';

/**
 * The Hatchery (HIVE-205): every PR the fleet has open, in draft or merged in
 * the last 24 hours, one two-line row each with HIVE-215's flap.
 *
 * ## Where they come from
 *
 * A `gh api graphql` sweep of the configured project repositories, in the main
 * process, polled once a minute by a shared timer (`hooks/use-pr-refresh.ts`).
 * This panel used to read four seeded rows naming repositories the user did not
 * have; those are gone, and with them the last reason the PR list and the WORK
 * tab could disagree about the same number.
 *
 * The list is still the single source of truth both surfaces resolve against —
 * `usePrs()` here, `useTicketPrs()` on a ticket card — so a PR approved while
 * only one of them is open updates both.
 */

/** The stale line reads its own time, so only it re-renders on a sweep (HIVE-211, D5). */
function PrsStaleLine({ failedAt, onRetry }: { failedAt: number | undefined; onRetry: () => void }) {
  const readAt = usePrsReadAt();
  return <StaleLine service="GitHub" failedAt={failedAt} readAt={readAt} onRetry={onRetry} />;
}

/** The line above the list. `null` when there is nothing worth saying. */
function SourceNotice({
  source,
  onRetry,
}: {
  source: PrSource;
  onRetry: () => void;
}) {
  // The skeleton below is the whole message while the first sweep is out.
  if (source.kind === 'loading') return null;

  /*
    Not an error, and it must not read as one. Three different setups land
    here — no `gh`, a `gh` that is not logged in, and no project that is a
    GitHub repository — and main writes the sentence for each, because it is
    the side that knows which one happened.
  */
  /*
    Through `EmptyState`, so it looks like the other empty PR state (HIVE-93).

    This branch was a bare `<p>` while the *no open PRs* state a few dozen lines
    down already had `phrase` + `creature="spire"`. Both are "this panel has
    nothing to show you", so the panel contradicted itself depending on *why* —
    an unconfigured setup got a plain sentence on a blank column, and a
    configured one with no PRs got the full treatment.

    `source.message` is passed through untouched: main writes it because main is
    the side that knows which of the three setups happened — no `gh`, a `gh` that
    is not logged in, or no project that is a GitHub repository. This adds the
    frame around that sentence and does not second-guess it.
  */
  if (source.kind === 'unconfigured') {
    return (
      <EmptyState phrase="empty.pullRequests" creature="spire">
        {source.message}
      </EmptyState>
    );
  }

  if (source.kind === 'failed') {
    return <SourceProblem message={source.message} onRetry={onRetry} />;
  }

  if (source.stale) {
    return <PrsStaleLine failedAt={source.failedAt} onRetry={onRetry} />;
  }

  return null;
}

/**
 * The panel's own scroll boundary.
 *
 * The list panel's wrapper scrolls whatever panel it holds, which for this one
 * meant the search row and its repo scope travelling upward with the results —
 * controls that describe the list scrolling out of reach of the list they
 * describe.
 *
 * Filling the panel's height exactly is what fixes it: the outer scroller then
 * has nothing to scroll and never engages, and the region below the pinned
 * header becomes the only thing that moves. That is preferable to `sticky`,
 * which keeps the row in view but leaves it inside the scrolling flow — so it
 * still needs an opaque fill to hide the cards passing under it, and the
 * scrollbar still spans the whole panel including the part that never moves.
 */
function PrsLayout({
  header,
  listRef,
  children,
}: {
  header: ReactNode;
  /** Goes *inside* the scroller, so `usePullToRefresh` finds it walking up. */
  listRef?: (node: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-panel="prs"
      className="flex h-full min-h-0 flex-col gap-[var(--cc-list-gap-sm)]"
    >
      <div className="shrink-0">{header}</div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={listRef}
          className="flex flex-col gap-[var(--cc-list-gap-sm)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** "Pull requests", "7 open · 2 need you", and the search icon while the sweep is live. */
function Header({
  open,
  needYou,
  canSearch,
  searching,
  onSearch,
}: {
  open: number;
  needYou: number;
  /** A search needs `gh`, so the icon shows only while the sweep is live (R3). */
  canSearch: boolean;
  searching: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2.5 px-2 pt-2.5 pb-2">
      <h2 className="text-ui-lg font-semibold text-ink">Pull requests</h2>
      <span className="text-ui-sm text-muted">
        {`${String(open)} open`}
        {needYou > 0 ? (
          <>
            {' · '}
            <span className="text-amber-text">{`${String(needYou)} need you`}</span>
          </>
        ) : null}
      </span>
      <span className="flex-1" />
      {canSearch ? (
        <button
          type="button"
          aria-label="Search pull requests"
          aria-pressed={searching}
          onClick={onSearch}
          className={cn(
            'grid size-7 place-items-center self-center rounded-full hover:bg-hover',
            searching ? 'text-ink' : 'text-muted',
          )}
        >
          <MagnifyingGlass size={15} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** A row's identity: `owner/repo#n`, unique where the short repo name is not (HIVE-171). */
const rowKey = (row: HatcheryRow) => prKey(row.pr.owner, row.pr.repo, row.pr.n);

export function PrsPanel() {
  const rows = useHatchery();
  const results = useHatcherySearch();
  const needYou = usePrNeedsYouCount();
  const source = usePrSource();
  const refresh = useRefreshPrs();
  const search = usePrSearch();
  const term = usePrSearchTerm();
  const searchOpen = usePrSearchOpen();
  const folded = usePrsFolded();
  const { openPrPage, togglePrsFolded, setPrSearchOpen } = usePrPageActions();
  const clearSearch = useClearPrSearch();
  const openRow = useOpenPr();

  /**
   * Which project a narrow search means: the watched session's, the explorer's
   * rule. `null` when nothing is watched, which the search row renders as a
   * checked, disabled "All repos".
   */
  const entity = useActiveEntity();
  const projectId = entity && isSession(entity) ? entity.project : null;

  /** A search replaces the list rather than filtering it — see `PrSearchRow`. */
  const searching = term !== '';

  /*
    Subscribes this panel to the shared poller: reads now if nothing else was
    already polling, and keeps the timer alive while the panel is open.
  */
  usePrRefresh();

  /*
    Overscrolling the top of the list forces a sweep. Off during a search, whose
    results a sweep would not move, and during the first load.
  */
  const pull = usePullToRefresh({ onRefresh: refresh, disabled: searching || source.kind === 'loading' });

  /** A row opens its page (D17). Stable, so rows stay memoised. */
  const onOpen = useCallback(
    (row: HatcheryRow) => openPrPage({ owner: row.pr.owner, repo: row.pr.repo, n: row.pr.n, row }),
    [openPrPage],
  );

  const toggleSearch = () => {
    if (searchOpen) clearSearch();
    setPrSearchOpen(!searchOpen);
  };

  /* A string, not the row: the rows are rebuilt on every append, and `open` must stay equal for the memo. */
  const openKey = openRow !== null ? rowKey(openRow) : null;
  const live = rows.filter((row) => row.pr.state !== 'merged');
  const hatched = rows.filter((row) => row.pr.state === 'merged');
  const draw = (row: HatcheryRow) => {
    const key = rowKey(row);
    return <PrRow key={key} row={row} open={key === openKey} onOpen={onOpen} />;
  };

  const header: ReactNode = (
    <>
      <Header
        open={live.length}
        needYou={needYou}
        canSearch={source.kind === 'live'}
        searching={searchOpen}
        onSearch={toggleSearch}
      />
      {searchOpen ? <PrSearchRow projectId={projectId} focusOnMount /> : null}
    </>
  );

  /*
    The skeleton *replaces* the list rather than sitting above it, and only on
    the first sweep — `loading` is only ever set when the source is not already
    live, so a refresh with rows on screen keeps them.
  */
  if (source.kind === 'loading' && !searching) {
    return (
      <PrsLayout header={header}>
        <PrListSkeleton />
      </PrsLayout>
    );
  }

  /*
    A search takes the panel over completely: its own results, by the same
    flap rules (others' PRs never SUMMONS), and none of the sweep's notices,
    which are about the standing list.
  */
  if (searching) {
    return (
      <PrsLayout header={header}>
        {search.error !== null ? (
          <p className="px-1 pb-1 text-ui-sm leading-[1.45] text-amber-text">{search.error}</p>
        ) : null}
        {/* The skeleton stands in only for the first answer; a re-search keeps the rows it has. */}
        {results === null && search.error === null ? <PrListSkeleton /> : null}
        {results?.map(draw)}
        {search.error === null && !search.searching && results?.length === 0 ? (
          <EmptyState phrase="empty.pullRequests" creature="spire">
            Nothing matches “{term}”.
          </EmptyState>
        ) : null}
      </PrsLayout>
    );
  }

  return (
    <PrsLayout header={header} listRef={pull.ref}>
      <PullIndicator distance={pull.distance} phase={pull.phase} />
      <SourceNotice source={source} onRetry={() => void refresh()} />
      {live.map(draw)}
      {hatched.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={!folded}
            onClick={togglePrsFolded}
            className="mt-1.5 flex items-center gap-2 border-t border-border-soft px-2 pt-3 pb-1 text-ui-sm font-semibold tracking-[0.06em] text-subtle uppercase"
          >
            <CaretRight size={12} aria-hidden className={cn(!folded && 'rotate-90')} />
            {`Hatched · ${String(hatched.length)} · last 24h`}
          </button>
          {folded ? null : hatched.map(draw)}
        </>
      ) : null}
      {/*
        An empty sweep is an answer, and `repos` says which kind: none open
        across four repositories is good news; across zero, the app is looking
        in the wrong place.
      */}
      {rows.length === 0 && source.kind === 'live' ? (
        <EmptyState phrase="empty.pullRequests" creature="spire">
          No open pull requests of yours across{' '}
          {source.repos === 1 ? '1 repository' : `${String(source.repos)} repositories`}.
        </EmptyState>
      ) : null}
    </PrsLayout>
  );
}
