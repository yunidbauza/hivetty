import type { PlanPart, SessionPlan } from '@shared/plan-contract';

/** Which PR of a split a plan is: `PR 2 of 3` (HIVE-359). */
export const partLabel = ({ index, of }: PlanPart): string => `PR ${String(index)} of ${String(of)}`;

/** The Plan tab's one fact: its tooltip, and the strip's rings button name. */
export function planFact(plan: SessionPlan): string {
  const part = plan.part === undefined ? '' : `${partLabel(plan.part)}, `;
  if (plan.allDone) return `Plan, ${part}all done`;
  const done = plan.tasks.filter((task) => task.status === 'completed').length;
  return `Plan, ${part}${String(done)} of ${String(plan.tasks.length)} done`;
}
