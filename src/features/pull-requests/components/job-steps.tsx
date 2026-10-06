import { ArrowSquareOut } from '@phosphor-icons/react';
import { useState } from 'react';

import { jobState, timeText } from '@/lib/checks-graph';
import { cn } from '@/lib/utils';

import { Button } from '@components/ui/button';
import { StateIcon } from '@features/pull-requests/components/state-icon';
import { holderIcon } from '@features/pull-requests/holder-icon';
import type { RunJob } from '@shared/github-contract';

const BUTTON = 'flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1 text-control leading-normal text-ink hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent';

/**
 * The shown job (HIVE-206): its name and state, its steps with their times
 * (the failing one tinted), Re-run failed, Open the log, and who has the PR
 * from the ledger. "with finding 2" waits on a source (D15).
 */
export function JobSteps({ job, canRerun, onRerun, holder }: { job: RunJob; canRerun: boolean; onRerun: () => Promise<string | null>; holder: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const state = jobState(job.status, job.conclusion);
  const Holder = holder === null ? null : holderIcon(holder);

  const rerun = async () => {
    setBusy(true);
    setError(await onRerun());
    setBusy(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 pt-3 pb-1.5 text-micro font-semibold tracking-[.06em] text-subtle">
        <span>{job.name.toUpperCase()}</span>
        <b className={cn('ml-auto tabular-nums font-semibold', state === 'failed' ? 'text-red' : 'text-muted')}>
          {timeText(state, job.startedAt, job.completedAt, now).toUpperCase()}
        </b>
      </div>
      <ol className="flex flex-col gap-px">
        {[...job.steps].sort((a, b) => a.number - b.number).map((step) => {
          const stepState = jobState(step.status, step.conclusion);
          return (
            <li
              key={step.number}
              data-state={stepState}
              className={cn('flex items-center gap-[9px] rounded-md px-1 py-[5px] text-control', stepState === 'failed' && 'bg-red-soft')}
            >
              <StateIcon state={stepState} />
              <span className="truncate text-ink">{step.name}</span>
              <span className="flex-1" />
              <span className="tabular-nums text-ui-sm text-muted">{timeText(stepState === 'failed' ? 'passed' : stepState, step.startedAt, step.completedAt, now)}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex gap-1.5">
        <Button variant="ghost" className={BUTTON} disabled={!canRerun} pending={busy} onClick={() => void rerun()}>
          Re-run failed
        </Button>
        <a href={job.url} target="_blank" rel="noreferrer" className={BUTTON}>
          <ArrowSquareOut size={13} aria-hidden />
          Open the log
        </a>
      </div>
      {error === null ? null : <p role="alert" className="mt-2 text-control text-red">{error}</p>}
      {Holder === null ? null : (
        <div className="mt-3 flex items-center gap-2 text-control text-muted">
          <Holder size={14} aria-hidden className="text-green" />
          <span><b className="text-ink">{holder}</b> has it</span>
        </div>
      )}
    </div>
  );
}
