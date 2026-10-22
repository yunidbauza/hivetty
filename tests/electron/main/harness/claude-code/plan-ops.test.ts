import { describe, expect, it } from 'vitest';

import { planOpOf, TASK_TOOL_NAMES } from '../../../../../electron/main/harness/claude-code/plan-ops';

describe('planOpOf (HIVE-238)', () => {
  it('names the task tools', () => {
    expect([...TASK_TOOL_NAMES]).toEqual(['TaskCreate', 'TaskUpdate', 'TodoWrite']);
  });

  it('reads a TaskCreate id from the response only', () => {
    expect(planOpOf('TaskCreate', { subject: 'A', activeForm: 'Doing A' }, { task: { id: '1' } })).toEqual({
      kind: 'task-created', id: '1', title: 'A', activeForm: 'Doing A',
    });
    expect(planOpOf('TaskCreate', { subject: 'A' }, {})).toBeUndefined();
    expect(planOpOf('TaskCreate', { subject: '' }, { task: { id: '1' } })).toBeUndefined();
  });

  it('reads a TaskUpdate, dropping an unknown status and deleting on deleted', () => {
    expect(planOpOf('TaskUpdate', { taskId: '2', status: 'completed', subject: 'B' }, {})).toEqual({
      kind: 'task-updated', id: '2', status: 'completed', title: 'B',
    });
    expect(planOpOf('TaskUpdate', { taskId: '2', status: 'bogus' }, {})).toEqual({ kind: 'task-updated', id: '2' });
    expect(planOpOf('TaskUpdate', { taskId: '2', status: 'deleted' }, {})).toEqual({ kind: 'task-deleted', id: '2' });
    expect(planOpOf('TaskUpdate', { status: 'completed' }, {})).toBeUndefined();
  });

  it('reads a TodoWrite with ids by original position', () => {
    expect(
      planOpOf('TodoWrite', { todos: [{ content: 'A', status: 'in_progress', activeForm: 'Doing A' }, { status: 'pending' }, { content: 'C', status: 'x' }] }, {}),
    ).toEqual({
      kind: 'tasks-replaced',
      tasks: [
        { id: '1', title: 'A', status: 'in_progress', activeForm: 'Doing A' },
        { id: '3', title: 'C', status: 'pending' },
      ],
    });
    expect(planOpOf('TodoWrite', {}, {})).toBeUndefined();
  });

  it('parses ExitPlanMode from the response, else the input', () => {
    expect(planOpOf('ExitPlanMode', {}, { plan: '### A\n### B' })).toEqual({
      kind: 'plan-proposed',
      tasks: [{ id: '1', title: 'A', status: 'pending' }, { id: '2', title: 'B', status: 'pending' }],
    });
    expect(planOpOf('ExitPlanMode', { plan: '1. A' }, {})).toEqual({ kind: 'plan-proposed', tasks: [{ id: '1', title: 'A', status: 'pending' }] });
    expect(planOpOf('ExitPlanMode', {}, {})).toEqual({ kind: 'plan-proposed', tasks: [] });
  });

  it('turns a Write or Edit to a plan file into a touch, and nothing else', () => {
    expect(planOpOf('Write', { file_path: '/r/.hive/plans/p.md' }, undefined)).toEqual({ kind: 'plan-file-touched', path: '/r/.hive/plans/p.md' });
    expect(planOpOf('Edit', { file_path: '/r/.hive/plans/p.md' }, undefined)).toEqual({ kind: 'plan-file-touched', path: '/r/.hive/plans/p.md' });
    expect(planOpOf('Write', { file_path: '/r/src/a.md' }, undefined)).toBeUndefined();
    expect(planOpOf('Read', {}, {})).toBeUndefined();
  });
});
