import type { SessionPlan } from '@shared/plan-contract';

import { PlanGlyph } from './plan-glyph';

/**
 * The plan at rest (HIVE-201): a `done/total` count, or ✓, over one ring per
 * task. Drawn in round two's strip.
 */
export function PlanRings({ plan }: { plan: SessionPlan }) {
  const done = plan.tasks.filter((task) => task.status === 'completed').length;
  const total = plan.tasks.length;
  const proposed = plan.source === 'plan-mode';

  return (
    <>
      <span className="flex h-[30px] items-center text-micro text-green tabular-nums">
        {plan.allDone ? '✓' : `${String(done)}/${String(total)}`}
      </span>
      <span aria-hidden className="flex flex-col items-center">
        {plan.tasks.map((task, index) => (
          <span key={task.id} className="grid h-[26px] place-items-center">
            <PlanGlyph index={index} status={task.status} proposed={proposed} />
          </span>
        ))}
      </span>
    </>
  );
}
