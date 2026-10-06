import { useCallback, useEffect, useState } from 'react';

import { createPoller } from '@/hooks/create-poller';
import { jobState } from '@/lib/checks-graph';
import type { Pr } from '@/types/pull-request';

import { ChecksGraphView } from '@features/pull-requests/components/checks-graph-view';
import { JobLog } from '@features/pull-requests/components/job-log';
import { JobSteps } from '@features/pull-requests/components/job-steps';
import { RunBar } from '@features/pull-requests/components/run-bar';
import { StateIcon } from '@features/pull-requests/components/state-icon';
import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import { SourceProblem } from '@features/shared/components/source-problem';
import type { PrCheck, PrDetail } from '@shared/github-contract';
import { prKey, useChecksGraph, usePrChecks, usePrChecksActions, usePushes, useShipTrack, useShownJob } from '@stores/hive-store';
import { usePrJob, usePrPageActions, usePrRun } from '@stores/ui-store';

/**
 * Runs and jobs re-read once a minute, and only while this tab is mounted:
 * the visibility rule (HIVE-206, D6). Its own poller, like the PR page's.
 */
const useChecksPoller = createPoller({ intervalMs: 60_000 });

const CHECK_STATE: Record<PrCheck['status'], 'passed' | 'failed' | 'running' | 'waiting' | 'skipped'> = {
  success: 'passed', failure: 'failed', running: 'running', queued: 'waiting', neutral: 'skipped',
};

/**
 * The PR page's Checks tab (HIVE-206): the run bar, the job graph, the
 * non-Actions checks, and under them the shown job's steps beside its log.
 */
export function PrChecks({ pr, detail }: { pr: Pr; detail: PrDetail }) {
  const key = prKey(pr.owner, pr.repo, pr.n);
  const branch = detail.headRef ?? pr.branch;
  const entry = usePrChecks(key);
  const sha = usePrRun();
  const clicked = usePrJob();
  const { showPrRun, showPrJob } = usePrPageActions();
  const { loadPrChecks, loadJobLog, rerunFailed } = usePrChecksActions();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const pushes = usePushes(key);
  const graph = useChecksGraph(key, sha, expanded);
  const job = useShownJob(key, sha, clicked);
  const track = useShipTrack(`${pr.owner}/${pr.repo}`, pr.n);
  const holder = pr.state !== 'merged' && track.held ? (track.current?.holder ?? null) : null;

  useChecksPoller(
    useCallback(() => loadPrChecks(pr.owner, pr.repo, pr.n, branch, sha ?? undefined), [loadPrChecks, pr.owner, pr.repo, pr.n, branch, sha]),
  );

  const failedJob = job !== null && jobState(job.status, job.conclusion) === 'failed' ? job.id : null;
  useEffect(() => {
    if (failedJob !== null) void loadJobLog(pr.owner, pr.repo, pr.n, failedJob);
  }, [failedJob, loadJobLog, pr.owner, pr.repo, pr.n]);

  const others = detail.checks.filter((check) => check.app !== 'github-actions');
  const push = pushes.find((p) => p.sha === sha) ?? pushes.at(-1);
  const retry = () => void loadPrChecks(pr.owner, pr.repo, pr.n, branch, sha ?? undefined);

  if (entry?.runs === undefined) {
    if (entry?.state === 'failed') return <div className="px-6 pt-4"><SourceProblem message={entry.problem ?? 'Could not read the checks.'} onRetry={retry} /></div>;
    return (
      <div role="status" aria-label="Loading checks" aria-busy className="flex animate-pulse flex-col gap-2 px-6 pt-4">
        <SkeletonBar className="w-[92%]" />
        <SkeletonBar className="w-[58%]" />
      </div>
    );
  }

  if (push === undefined && others.length === 0) {
    return <p className="px-6 pt-4 text-ui text-muted">{`No checks on ${(detail.headSha ?? '').slice(0, 7)}`}</p>;
  }

  const inFlight = push?.runs.some((r) => ['running', 'waiting'].includes(jobState(r.status, r.conclusion))) ?? false;
  const failedRun = push?.runs.find((r) => jobState(r.status, r.conclusion) === 'failed');
  const rerunRun = failedJob !== null && job !== null ? job.runId : failedRun?.id;

  return (
    <div className="flex flex-col">
      {entry.problem === undefined ? null : <div className="px-6 pt-3"><SourceProblem message={entry.problem} onRetry={retry} /></div>}
      {push === undefined || graph === null ? null : (
        <>
          <RunBar pushes={pushes} shown={push} files={graph.files} onShow={showPrRun} />
          <ChecksGraphView graph={graph} onJob={showPrJob} onExpand={(id) => setExpanded((prev) => new Set(prev).add(id))} />
        </>
      )}
      {others.length === 0 ? null : (
        <ul aria-label="Checks outside Actions" className="mx-6 mt-2 flex flex-wrap gap-1.5">
          {others.map((check) => (
            <li key={check.name}>
              {check.url === null ? (
                <span className="flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-control"><StateIcon state={CHECK_STATE[check.status]} />{check.name}</span>
              ) : (
                <a href={check.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-control hover:bg-hover">
                  <StateIcon state={CHECK_STATE[check.status]} />
                  {check.name}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {job === null ? null : (
        <div className="mt-2 grid grid-cols-1 gap-5 @min-[640px]:grid-cols-[300px_minmax(0,1fr)] border-t border-border-soft px-6 pt-1.5 pb-4">
          <JobSteps
            // Keyed by job, so a refusal shown under one job does not linger under the next.
            key={job.id}
            job={job}
            holder={holder}
            canRerun={!inFlight && rerunRun !== undefined}
            onRerun={async () => {
              if (rerunRun === undefined) return null;
              const result = await rerunFailed(pr.owner, pr.repo, pr.n, rerunRun, branch, sha ?? undefined);
              return result.ok ? null : result.error.message;
            }}
          />
          {failedJob === null ? <div /> : <JobLog entry={entry.logs[failedJob]} onRetry={() => void loadJobLog(pr.owner, pr.repo, pr.n, failedJob)} />}
        </div>
      )}
    </div>
  );
}
