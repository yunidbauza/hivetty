import { Check } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import type { PlanTask, PlanTaskStatus, SessionPlan } from '@shared/plan-contract';

const LABEL: Record<PlanTaskStatus, string> = {
  pending: 'pending',
  in_progress: 'in progress',
  completed: 'done',
};

/**
 * The ring's index for a task. A plan file's task is numbered by its heading,
 * which is the number a builder ticks by: a task added out of order (`Task 22`
 * above `Task 21`) must not read as its neighbour. Every other source by position.
 */
export const ringIndex = (plan: SessionPlan, task: PlanTask, index: number): number =>
  plan.source === 'plan-file' ? Number(task.id) - 1 : index;

interface PlanGlyphProps {
  /** 0-based position in the plan; the ring shows `index + 1`. */
  index: number;
  status: PlanTaskStatus;
  /** A plan-mode plan: nothing has started, so a pending task reads "proposed". */
  proposed?: boolean;
}

/**
 * One task's ring (HIVE-181): numbered on the track colour while pending,
 * green and pulsing while current, a filled green check once done.
 *
 * Status is never colour alone — the label carries it — so the pulse is
 * decoration and collapses under reduced motion.
 */
export function PlanGlyph({ index, status, proposed = false }: PlanGlyphProps) {
  const done = status === 'completed';
  const label = proposed && status === 'pending' ? 'proposed' : LABEL[status];
  return (
    <span
      role="img"
      aria-label={`Task ${String(index + 1)}, ${label}`}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full border-[1.5px] tabular-nums text-micro leading-none font-semibold',
        // A number grows the ring into a pill past nine (HIVE-226); the check keeps today's circle.
        done ? 'size-4' : 'h-4 min-w-4 px-0.5',
        done && 'border-green bg-green text-panel',
        status === 'in_progress' && 'border-green text-green motion-safe:animate-ccpulse',
        status === 'pending' && 'border-term-track text-subtle',
      )}
    >
      {done ? <Check size={10} weight="bold" aria-hidden /> : index + 1}
    </span>
  );
}
