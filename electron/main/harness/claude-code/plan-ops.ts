import { isPlanFilePath, type PlanOp, type PlanTaskStatus } from '@shared/plan-contract';

import { parsePlanMode } from './parse-plan-mode';

/** Claude's task tools. `TodoWrite` is not offered by 2.1.269 `-p`, but older builds send it. */
export const TASK_TOOL_NAMES: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite']);

const STATUSES: ReadonlySet<string> = new Set<PlanTaskStatus>(['pending', 'in_progress', 'completed']);

const isStatus = (value: unknown): value is PlanTaskStatus => typeof value === 'string' && STATUSES.has(value);

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const withActiveForm = (activeForm: string | undefined): { activeForm?: string } =>
  activeForm === undefined ? {} : { activeForm };

/**
 * One main-agent `PostToolUse` of a plan tool, read into a plan op (HIVE-238).
 *
 * Measured shapes: claude 2.1.269 and 2.1.270, `tests/fixtures/hooks`.
 *
 * - `TaskCreate`: its id exists only in `tool_response.task.id`.
 * - `TaskUpdate`: a status, a rename on `subject`, or a removal on `deleted`.
 * - `TodoWrite`: the whole list; ids are `"1".."n"` by position.
 * - `ExitPlanMode`: claude 2.1.270's PostToolUse sends `tool_input: {}` and
 *   the plan in `tool_response.plan`; older builds sent it in the input.
 * - `Write` / `Edit`: only to a `.hive/plans/*.md` file.
 *
 * `undefined` when the call carries nothing the plan could use.
 */
export function planOpOf(toolName: string, toolInput: unknown, toolResponse: unknown): PlanOp | undefined {
  const input = record(toolInput);
  switch (toolName) {
    case 'Write':
    case 'Edit':
      return isPlanFilePath(input.file_path) ? { kind: 'plan-file-touched', path: input.file_path } : undefined;
    case 'ExitPlanMode': {
      const plan =
        (toolResponse as { plan?: unknown } | null | undefined)?.plan ??
        (toolInput as { plan?: unknown } | null | undefined)?.plan;
      return { kind: 'plan-proposed', tasks: typeof plan === 'string' ? parsePlanMode(plan) : [] };
    }
    case 'TaskCreate': {
      const id = str(record(record(toolResponse).task).id);
      const title = str(input.subject);
      if (id === undefined || title === undefined) return undefined;
      return { kind: 'task-created', id, title, ...withActiveForm(str(input.activeForm)) };
    }
    case 'TaskUpdate': {
      const id = str(input.taskId);
      if (id === undefined) return undefined;
      if (input.status === 'deleted') return { kind: 'task-deleted', id };
      const title = str(input.subject);
      return {
        kind: 'task-updated',
        id,
        ...(isStatus(input.status) ? { status: input.status } : {}),
        ...(title === undefined ? {} : { title }),
        ...withActiveForm(str(input.activeForm)),
      };
    }
    case 'TodoWrite': {
      if (!Array.isArray(input.todos)) return undefined;
      const tasks = input.todos.flatMap((todo: unknown, index) => {
        const fields = record(todo);
        const title = str(fields.content);
        if (title === undefined) return [];
        const status: PlanTaskStatus = isStatus(fields.status) ? fields.status : 'pending';
        return [{ id: String(index + 1), title, status, ...withActiveForm(str(fields.activeForm)) }];
      });
      return { kind: 'tasks-replaced', tasks };
    }
    default:
      return undefined;
  }
}
