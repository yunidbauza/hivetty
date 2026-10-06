import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { reduceTaskTool, type PlanToolCall } from '../../../../electron/main/plans/task-tools';
import type { SessionPlan } from '../../../../electron/shared/plan-contract';

/** One recorded hook body (claude 2.1.269, `.hive/specs/fixtures`). */
interface Body {
  hook_event_name: string;
  tool_name: string;
  tool_input: unknown;
  tool_response?: unknown;
  agent_id?: string;
}

const bodies: Body[] = readFileSync(
  join(__dirname, '../../../fixtures/hooks/task-tools-2.1.269.jsonl'),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as Body);

const call = (b: Body): PlanToolCall => ({
  entityId: 'sess-01',
  toolName: b.tool_name,
  toolInput: b.tool_input,
  toolResponse: b.tool_response,
});

const replay = (filter: (b: Body) => boolean): SessionPlan | undefined =>
  bodies
    .filter(filter)
    .reduce<SessionPlan | undefined>((plan, b) => reduceTaskTool(plan, call(b)), undefined);

const mainAgentPost = (b: Body): boolean =>
  b.hook_event_name === 'PostToolUse' && b.agent_id === undefined;

const update = (input: Record<string, unknown>): PlanToolCall => ({
  entityId: 'sess-01',
  toolName: 'TaskUpdate',
  toolInput: input,
  toolResponse: {},
});

describe('reduceTaskTool', () => {
  it('builds the plan from recorded TaskCreate and TaskUpdate, in order', () => {
    const plan = replay((b) => mainAgentPost(b) && b.tool_name.startsWith('Task'));

    expect(plan?.source).toBe('task-tools');
    expect(plan?.entityId).toBe('sess-01');
    expect(plan?.tasks).toEqual([
      { id: '1', title: 'Alpha', status: 'completed', startedAt: 0, endedAt: 0 },
      { id: '2', title: 'Beta', status: 'pending' },
      { id: '3', title: 'Gamma', status: 'pending' },
    ]);
    expect(plan?.allDone).toBe(false);
  });

  it('ignores a TaskCreate whose response carries no id', () => {
    expect(
      reduceTaskTool(undefined, {
        entityId: 's',
        toolName: 'TaskCreate',
        toolInput: { subject: 'A' },
        toolResponse: {},
      }),
    ).toBeUndefined();
  });

  it('ignores a TaskCreate with no subject', () => {
    expect(
      reduceTaskTool(undefined, {
        entityId: 's',
        toolName: 'TaskCreate',
        toolInput: {},
        toolResponse: { task: { id: '1' } },
      }),
    ).toBeUndefined();
  });

  it('ignores a TaskUpdate for an id the plan does not have', () => {
    const plan = replay((b) => mainAgentPost(b) && b.tool_name === 'TaskCreate');

    expect(reduceTaskTool(plan, update({ taskId: '4', status: 'completed' }))).toBe(plan);
  });

  it('ignores a TaskUpdate with no plan to update', () => {
    expect(reduceTaskTool(undefined, update({ taskId: '1', status: 'completed' }))).toBeUndefined();
  });

  it('returns the same plan when an update changes nothing', () => {
    const plan = replay((b) => mainAgentPost(b) && b.tool_name === 'TaskCreate');

    expect(reduceTaskTool(plan, update({ taskId: '2', status: 'pending' }))).toBe(plan);
    expect(reduceTaskTool(plan, update({ taskId: '2', status: 'bogus' }))).toBe(plan);
  });

  it('removes a deleted task and renames on subject', () => {
    const created = replay((b) => mainAgentPost(b) && b.tool_name === 'TaskCreate');
    const deleted = reduceTaskTool(created, update({ taskId: '2', status: 'deleted' }));

    expect(deleted?.tasks.map((t) => t.id)).toEqual(['1', '3']);

    const renamed = reduceTaskTool(deleted, update({ taskId: '3', subject: 'G' }));

    expect(renamed?.tasks).toEqual([
      { id: '1', title: 'Alpha', status: 'pending' },
      { id: '3', title: 'G', status: 'pending' },
    ]);
  });

  it('replaces the whole list in one step on TodoWrite', () => {
    const plan = reduceTaskTool(undefined, {
      entityId: 's',
      toolName: 'TodoWrite',
      toolResponse: {},
      toolInput: {
        todos: [
          { content: 'One', status: 'pending', activeForm: 'x' },
          { content: 'Two', status: 'completed', activeForm: 'y' },
          { content: '', status: 'pending', activeForm: 'z' },
          { content: 'Three', status: 'bogus', activeForm: 'w' },
        ],
      },
    });

    expect(plan?.tasks).toEqual([
      { id: '1', title: 'One', status: 'pending', activeForm: 'x' },
      { id: '2', title: 'Two', status: 'completed', activeForm: 'y', endedAt: 0 },
      { id: '4', title: 'Three', status: 'pending', activeForm: 'w' },
    ]);
  });

  it('ignores a TodoWrite with no todos array', () => {
    expect(
      reduceTaskTool(undefined, { entityId: 's', toolName: 'TodoWrite', toolInput: {}, toolResponse: {} }),
    ).toBeUndefined();
  });

  it('ignores a tool it does not know', () => {
    const plan = replay((b) => mainAgentPost(b) && b.tool_name === 'TaskCreate');

    expect(
      reduceTaskTool(plan, { entityId: 'sess-01', toolName: 'Read', toolInput: {}, toolResponse: {} }),
    ).toBe(plan);
  });

  it('marks allDone when no task is unfinished, and starts a fresh plan on the next TaskCreate', () => {
    const created = replay((b) => mainAgentPost(b) && b.tool_name === 'TaskCreate');
    const done = ['1', '2', '3'].reduce<SessionPlan | undefined>(
      (plan, taskId) => reduceTaskTool(plan, update({ taskId, status: 'completed' })),
      created,
    );

    expect(done?.allDone).toBe(true);

    const fresh = reduceTaskTool(done, {
      entityId: 'sess-01',
      toolName: 'TaskCreate',
      toolInput: { subject: 'Next' },
      toolResponse: { task: { id: '9', subject: 'Next' } },
    });

    expect(fresh?.tasks).toEqual([{ id: '9', title: 'Next', status: 'pending' }]);
    expect(fresh?.allDone).toBe(false);
  });

  it('starts a fresh task-tools plan over a plan from another source', () => {
    const modePlan: SessionPlan = {
      entityId: 'sess-01',
      source: 'plan-mode',
      tasks: [{ id: '1', title: 'P', status: 'pending' }],
      allDone: false,
    };

    expect(reduceTaskTool(modePlan, update({ taskId: '1', status: 'completed' }))).toBe(modePlan);

    const plan = reduceTaskTool(modePlan, {
      entityId: 'sess-01',
      toolName: 'TaskCreate',
      toolInput: { subject: 'A' },
      toolResponse: { task: { id: '1', subject: 'A' } },
    });

    expect(plan?.source).toBe('task-tools');
    expect(plan?.tasks).toEqual([{ id: '1', title: 'A', status: 'pending' }]);
  });
});

describe('reduceTaskTool: activeForm and times (HIVE-201)', () => {
  const create = (id: string, subject: string, activeForm?: string): PlanToolCall => ({
    entityId: 'sess-01',
    toolName: 'TaskCreate',
    toolInput: { subject, ...(activeForm === undefined ? {} : { activeForm }) },
    toolResponse: { task: { id } },
  });

  it('reads activeForm from TaskCreate and lets TaskUpdate replace it', () => {
    let plan = reduceTaskTool(undefined, create('1', 'Push', 'Pushing'), 1_000);
    expect(plan?.tasks[0]).toEqual({ id: '1', title: 'Push', status: 'pending', activeForm: 'Pushing' });
    plan = reduceTaskTool(plan, update({ taskId: '1', activeForm: 'Pushing the branch' }), 2_000);
    expect(plan?.tasks[0]?.activeForm).toBe('Pushing the branch');
  });

  it('stamps startedAt on the first in_progress only, endedAt on completed', () => {
    let plan = reduceTaskTool(undefined, create('1', 'A'), 0);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'in_progress' }), 1_000);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'pending' }), 2_000);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'in_progress' }), 3_000);
    expect(plan?.tasks[0]?.startedAt).toBe(1_000);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'completed' }), 9_000);
    expect(plan?.tasks[0]).toMatchObject({ startedAt: 1_000, endedAt: 9_000 });
  });

  it('a rename keeps activeForm and both times', () => {
    let plan = reduceTaskTool(undefined, create('1', 'A', 'Doing A'), 0);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'in_progress' }), 1_000);
    plan = reduceTaskTool(plan, update({ taskId: '1', status: 'completed' }), 2_000);
    plan = reduceTaskTool(plan, update({ taskId: '1', subject: 'B' }), 3_000);
    expect(plan?.tasks[0]).toEqual({
      id: '1',
      title: 'B',
      status: 'completed',
      activeForm: 'Doing A',
      startedAt: 1_000,
      endedAt: 2_000,
    });
  });

  it('an update that changes nothing returns the same plan', () => {
    const plan = reduceTaskTool(undefined, create('1', 'A', 'Doing A'), 0);
    expect(reduceTaskTool(plan, update({ taskId: '1', activeForm: 'Doing A' }), 5)).toBe(plan);
  });
});

describe('reduceTaskTool: TodoWrite times (HIVE-201)', () => {
  const todo = (todos: { content: string; status: string; activeForm?: string }[]): PlanToolCall => ({
    entityId: 'sess-01',
    toolName: 'TodoWrite',
    toolInput: { todos },
    toolResponse: {},
  });

  it('reads activeForm and stamps a todo that starts', () => {
    const plan = reduceTaskTool(
      undefined,
      todo([{ content: 'A', status: 'in_progress', activeForm: 'Doing A' }]),
      1_000,
    );
    expect(plan?.tasks[0]).toEqual({
      id: '1',
      title: 'A',
      status: 'in_progress',
      activeForm: 'Doing A',
      startedAt: 1_000,
    });
  });

  it('carries startedAt from the previous write by title, and stamps endedAt on completion', () => {
    let plan = reduceTaskTool(
      undefined,
      todo([
        { content: 'A', status: 'in_progress' },
        { content: 'B', status: 'pending' },
      ]),
      1_000,
    );
    plan = reduceTaskTool(
      plan,
      todo([
        { content: 'A', status: 'completed' },
        { content: 'B', status: 'in_progress' },
      ]),
      4_000,
    );
    expect(plan?.tasks).toEqual([
      { id: '1', title: 'A', status: 'completed', startedAt: 1_000, endedAt: 4_000 },
      { id: '2', title: 'B', status: 'in_progress', startedAt: 4_000 },
    ]);
  });
});
