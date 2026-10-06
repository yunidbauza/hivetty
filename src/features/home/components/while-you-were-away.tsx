import { Check, CheckCircle, GitPullRequest, Kanban, Robot, XCircle } from '@phosphor-icons/react';

import { hhmm } from '@features/home/components/coming-up';
import { StripHead, StripRow } from '@features/home/components/strip-row';
import { useWhileAway } from '@stores/hive-store';
import { useAwaySince } from '@stores/ui-store';

export function hatchedLine(numbers: number[]): string {
  if (numbers.length === 1) return `#${numbers[0]} hatched`;
  if (numbers.length === 2) return `#${numbers[0]} and #${numbers[1]} hatched`;
  return `${numbers.length} PRs hatched`;
}

/** The column caps at six rows (HIVE-217); the rest are counted on a "N more" line. */
export const AWAY_MAX = 6;

const RUNS_TIP = 'Counted from the last 500 ledger entries; can undercount on a busy day.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `merged it`, `merged both`, `merged them`. */
const mergedWhat = (n: number) => (n === 1 ? 'it' : n === 2 ? 'both' : 'them');

/** Home's While you were away (HIVE-200): column 1 when nothing needs you, with the Echoes (HIVE-217). */
export function WhileYouWereAway() {
  const since = useAwaySince();
  const { hatched, goals, runs, ready, checksFailed, approved, clones } = useWhileAway(since);
  const unnamed = ready.total - ready.keys.length;
  const rows = [
    hatched.numbers.length > 0 && (
      <StripRow
        key="hatched"
        icon={<GitPullRequest size={15} className="text-green" aria-hidden="true" />}
        name={hatchedLine(hatched.numbers)}
        detail={hatched.by === undefined ? '' : `${hatched.by} merged ${mergedWhat(hatched.numbers.length)}`}
      />
    ),
    ...goals.map((title, i) => (
      <StripRow
        key={`goal-${i}`}
        icon={<CheckCircle size={15} className="text-green" aria-hidden="true" />}
        name={title}
        detail=""
      />
    )),
    runs.total > 0 && (
      <StripRow
        key="runs"
        icon={<Robot size={15} className="text-brand" aria-hidden="true" />}
        name={plural(runs.total, 'agent run')}
        detail={runs.failed > 0 ? `${runs.failed} failed` : ''}
        title={RUNS_TIP}
      />
    ),
    ready.total > 0 && (
      <StripRow
        key="ready"
        icon={<Kanban size={15} className="text-subtle" aria-hidden="true" />}
        name={`${plural(ready.total, 'ticket')} ready to start`}
        detail={`${ready.keys.join(', ')}${unnamed > 0 ? ` and ${unnamed} more` : ''} ${ready.total === 1 ? 'has' : 'have'} no session`}
      />
    ),
    checksFailed.total > 0 && (
      <StripRow
        key="checks"
        icon={<XCircle size={15} className="text-red" aria-hidden="true" />}
        name={`${plural(checksFailed.total, 'check')} failed`}
        detail={checksFailed.first ?? ''}
      />
    ),
    approved.total > 0 && (
      <StripRow
        key="approved"
        icon={<Check size={15} className="text-green" aria-hidden="true" />}
        name={`${plural(approved.total, 'PR')} approved`}
        detail={approved.first ?? ''}
      />
    ),
    ...clones.map((clone, i) => (
      <StripRow
        key={`clone-${i}`}
        icon={
          clone.failed ? (
            <XCircle size={15} className="text-red" aria-hidden="true" />
          ) : (
            <CheckCircle size={15} className="text-green" aria-hidden="true" />
          )
        }
        name={clone.failed ? 'Clone failed' : 'Clone finished'}
        detail={clone.detail}
      />
    )),
  ].filter((row) => row !== false);
  const more = rows.length - AWAY_MAX;
  return (
    <section aria-labelledby="away-head" className="grid min-w-0 content-start gap-px">
      <StripHead
        aside={
          <span className="ml-auto tabular-nums font-normal tracking-normal text-muted normal-case">
            since {hhmm(since)}
          </span>
        }
      >
        <span id="away-head">While you were away</span>
      </StripHead>
      {rows.length === 0 && (
        <p className="px-1 py-[5px] text-control text-muted">Nothing happened while you were away.</p>
      )}
      {rows.slice(0, AWAY_MAX)}
      {more > 0 && <p className="px-1 py-[5px] text-control text-muted">{more} more</p>}
    </section>
  );
}
