import { GithubLogo, GitPullRequest } from '@phosphor-icons/react';
import { useCallback } from 'react';

import { createPoller } from '@/hooks/create-poller';
import { useDetailsDrawer } from '@/hooks/use-details-drawer';
import { useOpenFileAt } from '@/hooks/use-open-file-at';
import { useProjectConfig } from '@/hooks/use-project-config';
import { useRelativeTime } from '@/hooks/use-relative-time';
import { cn } from '@/lib/utils';
import { isSession } from '@/types/entity';
import type { HatcheryRow, Pr } from '@/types/pull-request';

import { SegmentedControl, type SegmentedOption } from '@components/ui/segmented-control';
import { Flap } from '@features/pull-requests/components/flap';
import { PrChecks } from '@features/pull-requests/components/pr-checks';
import { PrCommentBox } from '@features/pull-requests/components/pr-comment-box';
import { PrConversation } from '@features/pull-requests/components/pr-conversation';
import { PrFiles } from '@features/pull-requests/components/pr-files';
import { PrActions, PrProperties } from '@features/pull-requests/components/pr-properties';
import { PrTimeline } from '@features/pull-requests/components/pr-timeline';
import { ShipTrack } from '@features/pull-requests/components/ship-track';
import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import { SourceProblem } from '@features/shared/components/source-problem';
import { FLAP_TEXT } from '@features/shared/flap-tone';
import type { PrDetail } from '@shared/github-contract';
import {
  prKey,
  repoDirName,
  useDisplayName,
  useEntity,
  useIsAgentId,
  useLoadPrDetail,
  usePrDetail,
  usePrOpener,
  useShipTrack,
} from '@stores/hive-store';
import { usePrPageActions, usePrTab, type PrTab } from '@stores/ui-store';

/** The tab strip; Files is HIVE-207's, Checks is HIVE-206's, Timeline is HIVE-208's. */
export const PR_TABS = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'files', label: 'Files' },
  { value: 'checks', label: 'Checks' },
  { value: 'timeline', label: 'Timeline' },
] as const satisfies readonly SegmentedOption<PrTab>[];

/** The open PR's detail re-reads once a minute while it is on stage; the first sweep is the open's read. */
const usePagePoller = createPoller({ intervalMs: 60_000 });

/** `repo · head → base · +a −d · n files · opened by …, when`. Before the first read, what the sweep knows. */
function Facts({ pr, detail }: { pr: Pr; detail: PrDetail | undefined }) {
  const opener = usePrOpener(`${pr.owner}/${pr.repo}`, pr.n);
  const agent = useIsAgentId(opener ?? '');
  const sessionName = useDisplayName(opener ?? '');
  const age = useRelativeTime(detail === undefined ? Date.now() : Date.parse(detail.createdAt));

  if (detail === undefined) {
    return <span className="truncate tabular-nums text-ui-sm text-muted">{`${pr.repo} · ${pr.branch}`}</span>;
  }

  /* D12: an agent opened it ("builder for you" when it is yours), a session by its name, else GitHub's author. */
  const by =
    opener !== null && agent
      ? `${opener}${pr.mine ? ' for you' : ''}`
      : opener !== null
        ? sessionName
        : (detail.author ?? 'someone');

  return (
    <span data-testid="pr-facts" className="truncate text-ui-sm whitespace-nowrap text-muted">
      <span className="tabular-nums">{`${pr.repo} · ${detail.headRef} → ${detail.baseRef}`}</span>
      {' · '}
      <span className="tabular-nums text-green">{`+${String(detail.additions)}`}</span>{' '}
      <span className="tabular-nums text-red">{`−${String(detail.deletions)}`}</span>
      {` · ${String(detail.changedFiles)} files · opened by ${by}, ${age}`}
    </span>
  );
}

/**
 * One PR's page (HIVE-205): the header, the slim ship track, and the tab's
 * body beside the properties column. A merged PR is read-only. Keyed on the
 * PR by its parent, so a new PR is a new mount and the poller's first sweep
 * is its read.
 */
export function PrPage({ row }: { row: HatcheryRow }) {
  const { pr, hatch } = row;
  const entry = usePrDetail(prKey(pr.owner, pr.repo, pr.n));
  const load = useLoadPrDetail();
  const chosen = usePrTab();
  const { setPrTab } = usePrPageActions();
  const track = useShipTrack(`${pr.owner}/${pr.repo}`, pr.n);
  const merged = pr.state === 'merged';
  const detail = entry?.detail;
  /* A tab this PR does not have falls back here, not in the store, so the choice survives the next PR (D14). */
  const tab: PrTab = PR_TABS.some((t) => t.value === chosen) ? chosen : 'conversation';
  /* Files carries the changed-file count once the detail is read (HIVE-207). */
  const tabs: SegmentedOption<PrTab>[] = PR_TABS.map((t) =>
    t.value === 'files' && detail !== undefined
      ? { ...t, label: `Files ${String(detail.changedFiles)}` }
      : t.value === 'checks'
        ? /* The Checks tab carries a red dot while a check fails (HIVE-206). */ { ...t, alert: pr.checks === 'failing' }
        : t,
  );
  const fixerOnIt = !merged && track.held && track.current?.holder === 'fixer';

  usePagePoller(useCallback(() => load(pr.owner, pr.repo, pr.n), [load, pr.owner, pr.repo, pr.n]));

  /* Open the file (D19): the PR's live session (its worktree), else the project whose folder is the repo, else nowhere. */
  const { openPath } = useOpenFileAt();
  const config = useProjectConfig();
  const owner = useEntity(pr.session ?? '');
  const session = owner !== undefined && isSession(owner) ? owner : null;
  const projectId =
    session?.project ??
    config?.projects.find((project) => repoDirName(project.path) === pr.repo.toLowerCase())?.id ??
    null;
  const onOpenFile =
    projectId === null
      ? undefined
      : (path: string, line: number) => void openPath(projectId, session?.id, path, { line });

  const retry = () => void load(pr.owner, pr.repo, pr.n);

  // The properties sidebar folds into this below a 760px page (HIVE-223); above it the state is moot.
  const drawer = useDetailsDrawer();

  return (
    <section aria-label={`Pull request #${String(pr.n)}`} className="@container flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border-soft px-5 pt-3.5 pb-3">
        <GitPullRequest size={20} aria-hidden className={cn('shrink-0', FLAP_TEXT[hatch.tone])} />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex items-center gap-2.5">
            <span className="tabular-nums text-ui-lg font-bold text-ink">{`#${String(pr.n)}`}</span>
            <h1 className="truncate text-ui-lg text-ink">{pr.title}</h1>
            <Flap hatch={hatch} />
          </div>
          <Facts pr={pr} detail={detail} />
        </div>
        <span className="flex-1" />
        <SegmentedControl label="Tab" options={tabs} value={tab} onChange={setPrTab} />
        <button
          ref={drawer.button}
          type="button"
          aria-expanded={drawer.open}
          aria-controls="pr-details"
          onClick={drawer.toggle}
          className="flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-control font-semibold text-ink hover:bg-hover @min-[760px]:hidden"
        >
          Details
        </button>
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-control font-semibold text-ink hover:bg-hover"
        >
          <GithubLogo size={13} aria-hidden />
          GitHub
        </a>
      </header>
      <ShipTrack pr={pr} />
      <div className="relative flex min-h-0 flex-1">
        {/* Each tab column is its own size container, so the 640px Files and Checks thresholds exclude the 260px sidebar beside it. */}
        {/* The Files tab scrolls its tree and its diff on its own, so it sits outside the padded column. */}
        {detail !== undefined && tab === 'files' ? (
          <div className="@container flex min-w-0 flex-1 flex-col">
            {entry?.problem === undefined ? null : (
              <div className="px-8 pt-3">
                <SourceProblem message={entry.problem} onRetry={retry} />
              </div>
            )}
            <PrFiles pr={pr} detail={detail} fixerOnIt={fixerOnIt} onOpenFile={onOpenFile} />
          </div>
        ) : (
          <div className="@container min-w-0 flex-1 overflow-y-auto px-8 pb-6">
            {detail === undefined ? (
              entry?.state === 'failed' ? (
                <div className="pt-4">
                  <SourceProblem message={entry.problem ?? 'Could not read this pull request.'} onRetry={retry} />
                </div>
              ) : (
                <div
                  role="status"
                  aria-label="Loading pull request"
                  aria-busy
                  className="flex animate-pulse flex-col gap-2 pt-4"
                >
                  <SkeletonBar className="w-[92%]" />
                  <SkeletonBar className="w-[84%]" />
                  <SkeletonBar className="w-[58%]" />
                </div>
              )
            ) : (
              <>
                {entry?.problem === undefined ? null : (
                  <div className="pt-3">
                    <SourceProblem message={entry.problem} onRetry={retry} />
                  </div>
                )}
                {tab === 'checks' ? (
                  /* -mx-8 cancels the column's px-8: the Checks layout carries its own 24px gutters. */
                  <div className="-mx-8">
                    <PrChecks pr={pr} detail={detail} />
                  </div>
                ) : tab === 'timeline' ? (
                  /* -mx-8 cancels the column's px-8: the Timeline carries its own 24px gutters (HIVE-208). */
                  <div className="-mx-8">
                    <PrTimeline pr={pr} />
                  </div>
                ) : (
                  <>
                    <PrConversation pr={pr} detail={detail} fixerOnIt={fixerOnIt} onOpenFile={onOpenFile} />
                    {merged ? null : <PrCommentBox pr={pr} />}
                  </>
                )}
              </>
            )}
          </div>
        )}
        <aside
          aria-label="Pull request properties"
          className="hidden w-[260px] shrink-0 overflow-y-auto border-l border-border-soft px-4 py-[18px] @min-[760px]:block"
        >
          <PrProperties row={row} detail={detail} actions={<PrActions row={row} />} />
        </aside>
        {drawer.open ? (
          <>
            <div
              data-testid="pr-details-veil"
              aria-hidden
              className="absolute inset-0 z-10 @min-[760px]:hidden"
              onClick={drawer.close}
            />
            <div
              ref={drawer.panel}
              id="pr-details"
              role="dialog"
              aria-label="Pull request details"
              tabIndex={-1}
              className="absolute inset-y-0 right-0 z-20 w-[260px] overflow-y-auto border-l border-border bg-panel px-4 py-[18px] shadow-lg outline-none @min-[760px]:hidden"
            >
              <PrProperties row={row} detail={detail} actions={<PrActions row={row} />} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
