import type { PlanOp, PlanTask, PlanTaskStatus, SessionPlan } from '@shared/plan-contract';

/** At least one task, and none left unfinished. */
export const isAllDone = (tasks: readonly PlanTask[]): boolean =>
  tasks.length > 0 && tasks.every((task) => task.status === 'completed');

const withTasks = (entityId: string, tasks: PlanTask[]): SessionPlan => ({
  entityId,
  source: 'task-tools',
  tasks,
  allDone: isAllDone(tasks),
});

/** The times a status change earns. `startedAt` is never re-stamped. */
const stamped = (task: PlanTask, status: PlanTaskStatus, now: number): PlanTask => ({
  ...task,
  status,
  ...(status === 'in_progress' && task.startedAt === undefined ? { startedAt: now } : {}),
  ...(status === 'completed' && task.status !== 'completed' ? { endedAt: now } : {}),
});

export type TaskOp = Extract<PlanOp, { kind: 'task-created' | 'task-updated' | 'task-deleted' | 'tasks-replaced' }>;

export const isTaskOp = (op: PlanOp): op is TaskOp =>
  op.kind === 'task-created' || op.kind === 'task-updated' || op.kind === 'task-deleted' || op.kind === 'tasks-replaced';

/**
 * One task op folded into the session's plan (HIVE-179, HIVE-238).
 *
 * Returns the same object when the op changes nothing, so the store can skip
 * a publish by identity. An id the plan does not hold is ignored, which is how
 * a subagent's task (same id space) stays out if one ever slips through.
 *
 * `now` stamps `startedAt` / `endedAt` (HIVE-201); the store passes its injected clock.
 */
export function reduceTaskOp(plan: SessionPlan | undefined, entityId: string, op: TaskOp, now = 0): SessionPlan | undefined {
  switch (op.kind) {
    case 'task-created': {
      // A task-tools plan is the base only while it is live; anything else starts fresh.
      const base = plan?.source === 'task-tools' && !plan.allDone ? plan.tasks : [];
      return withTasks(entityId, [
        ...base,
        { id: op.id, title: op.title, status: 'pending', ...(op.activeForm === undefined ? {} : { activeForm: op.activeForm }) },
      ]);
    }
    case 'task-deleted':
    case 'task-updated': {
      if (plan?.source !== 'task-tools') return plan;
      const current = plan.tasks.find((task) => task.id === op.id);
      if (current === undefined) return plan;
      if (op.kind === 'task-deleted') return withTasks(entityId, plan.tasks.filter((task) => task !== current));
      const status = op.status ?? current.status;
      const title = op.title ?? current.title;
      const activeForm = op.activeForm ?? current.activeForm;
      if (status === current.status && title === current.title && activeForm === current.activeForm) return plan;
      const next = stamped({ ...current, title, ...(activeForm === undefined ? {} : { activeForm }) }, status, now);
      return withTasks(entityId, plan.tasks.map((task) => (task === current ? next : task)));
    }
    case 'tasks-replaced': {
      // A whole-list rewrite: times survive by title, the only identity a todo has.
      const previous = new Map(plan?.source === 'task-tools' ? plan.tasks.map((task) => [task.title, task]) : []);
      const tasks = op.tasks.map((todo): PlanTask => {
        const before = previous.get(todo.title);
        const base: PlanTask = {
          id: todo.id,
          title: todo.title,
          status: before?.status ?? 'pending',
          ...(todo.activeForm === undefined ? {} : { activeForm: todo.activeForm }),
          ...(before?.startedAt === undefined ? {} : { startedAt: before.startedAt }),
          ...(before?.endedAt === undefined ? {} : { endedAt: before.endedAt }),
        };
        return stamped(base, todo.status, now);
      });
      return withTasks(entityId, tasks);
    }
  }
}
