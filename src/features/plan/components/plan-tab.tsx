import { FileText } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import { formatDuration } from '@lib/format-duration';
import type { PlanTask, SessionPlan } from '@shared/plan-contract';

import { PlanGlyph } from './plan-glyph';

/** `.hive/plans/x.md`: the path from the Hive's folder down. `PLAN_FILE_PATH` guarantees `/.hive/`. */
const planFileLabel = (file: string) => file.slice(file.lastIndexOf('/.hive/') + 1);

/** `10:04`, the read time in the user's own clock. */
const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** How long a task has run, or ran; `undefined` for one never started. */
const taskMs = (task: PlanTask, now: number): number | undefined =>
  task.startedAt === undefined ? undefined : (task.endedAt ?? now) - task.startedAt;

/**
 * The plan rail, opened (HIVE-201): where it is, what it is doing now, and
 * for how long. Props only, like the rail: the slice reads no store.
 *
 * The clock ticks once a second only while a task is in progress, and only
 * while this is mounted, which is only while the Plan tab is the one shown.
 */
export function PlanTab({
  plan,
  onOpenFile,
}: {
  plan: SessionPlan;
  onOpenFile: (file: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const live = plan.tasks.some((task) => task.status === 'in_progress');
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [live]);

  const done = plan.tasks.filter((task) => task.status === 'completed').length;
  const total = plan.tasks.length;
  const sum = plan.tasks.reduce((acc, task) => acc + (taskMs(task, now) ?? 0), 0);
  const proposed = plan.source === 'plan-mode';
  const { file } = plan;

  return (
    <section aria-label="Plan" className="flex min-h-0 flex-col">
      <p className="px-1 pb-2.5 text-control text-muted">
        <b className="font-semibold text-ink">{`${String(done)} of ${String(total)}`}</b>
        {` tasks · ${formatDuration(sum)}`}
      </p>
      <div className="mx-1 mb-2.5 h-1 rounded-sm bg-active">
        <i
          className="block h-full rounded-sm bg-green"
          style={{ width: `${String(total === 0 ? 0 : (done / total) * 100)}%` }}
        />
      </div>
      <ul className="grid gap-0.5">
        {plan.tasks.map((task, index) => {
          const ms = taskMs(task, now);
          const current = task.status === 'in_progress';
          return (
            <li
              key={task.id}
              className={cn(
                'flex items-start gap-2.5 px-1 py-2 text-ui',
                current && 'rounded-lg bg-active px-2',
              )}
            >
              <PlanGlyph index={index} status={task.status} proposed={proposed} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={task.status === 'completed' ? 'text-muted' : 'text-ink'}>
                  {task.title}
                </span>
                {current && task.activeForm !== undefined ? (
                  <span className="text-control text-green">{task.activeForm}</span>
                ) : null}
              </span>
              {ms === undefined ? null : (
                <span className=" text-control text-muted tabular-nums">
                  {formatDuration(ms)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {file === undefined ? null : (
        <>
          <h3 className="px-1 pt-3.5 pb-1 text-micro font-semibold tracking-[.06em] text-subtle uppercase">
            Where it came from
          </h3>
          <button
            type="button"
            title={file}
            onClick={() => {
              onOpenFile(file);
            }}
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left text-control text-brand hover:bg-hover"
          >
            <FileText size={14} aria-hidden className="shrink-0" />
            <span className="truncate tabular-nums">{planFileLabel(file)}</span>
          </button>
          <p className="px-1 text-control text-muted">
            {plan.fileAt === undefined ? '' : `Written by hive:plan at ${clock(plan.fileAt)} · `}
            open it in the editor
          </p>
        </>
      )}
    </section>
  );
}
