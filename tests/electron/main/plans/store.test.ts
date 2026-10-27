import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readHook } from '../../../../electron/main/harness/claude-code/hooks';
import { createPlans, type Plans } from '../../../../electron/main/plans';
import { parsePlanFile } from '../../../../electron/main/plans/parse-plan-file';
import { CH } from '../../../../electron/shared/ipc-contract';
import { type SessionPlan } from '../../../../electron/shared/plan-contract';
import { toPlanUpdate, type ClaudePlanCall } from '../../../support/plan-calls';

const create = (id: string, subject: string, entityId = 'sess-01'): ClaudePlanCall => ({
  entityId,
  toolName: 'TaskCreate',
  toolInput: { subject },
  toolResponse: { task: { id, subject } },
});

const update = (taskId: string, status: string): ClaudePlanCall => ({
  entityId: 'sess-01',
  toolName: 'TaskUpdate',
  toolInput: { taskId, status },
  toolResponse: {},
});

const onTool = (plans: Plans, call: ClaudePlanCall) => {
  const update = toPlanUpdate(call);
  return update === undefined ? undefined : plans.apply(update);
};

const modePlan: SessionPlan = {
  entityId: 'sess-01',
  source: 'plan-mode',
  tasks: [{ id: '1', title: 'P', status: 'pending' }],
  allDone: false,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPlans', () => {
  it('publishes each change on CH.planChanged', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));

    expect(send).toHaveBeenLastCalledWith(CH.planChanged, {
      entityId: 'sess-01',
      plan: expect.objectContaining({ tasks: [{ id: '1', title: 'A', status: 'pending' }] }),
    });
  });

  it('does not publish a call that changed nothing', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));
    onTool(plans, update('9', 'completed'));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores a tool that is not a task tool', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, { entityId: 'sess-01', toolName: 'Read', toolInput: {}, toolResponse: {} });

    expect(send).not.toHaveBeenCalled();
    expect(plans.get('sess-01')).toBeUndefined();
  });

  it('keeps an all-done plan with no timer, and a new plan replaces it (HIVE-229)', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));
    onTool(plans, update('1', 'completed'));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(plans.get('sess-01')?.allDone).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(send).not.toHaveBeenCalledWith(CH.planChanged, { entityId: 'sess-01', plan: null });

    onTool(plans, create('2', 'B'));

    expect(plans.get('sess-01')?.tasks.map((t) => t.id)).toEqual(['2']);
  });

  it('forget removes a finished plan and publishes plan: null', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));
    onTool(plans, update('1', 'completed'));
    plans.forget('sess-01');

    expect(plans.get('sess-01')).toBeUndefined();
    expect(send).toHaveBeenLastCalledWith(CH.planChanged, { entityId: 'sess-01', plan: null });
  });

  it('drops on demand, and a second drop publishes nothing', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));
    plans.drop('sess-01');
    plans.drop('sess-01');

    expect(plans.get('sess-01')).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(CH.planChanged, { entityId: 'sess-01', plan: null });
  });

  it('drops a plan whose last task was deleted', () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    onTool(plans, create('1', 'A'));
    onTool(plans, update('1', 'deleted'));

    expect(plans.get('sess-01')).toBeUndefined();
    expect(send).toHaveBeenLastCalledWith(CH.planChanged, { entityId: 'sess-01', plan: null });
  });

  it('a higher rank replaces a lower one; a lower rank never overwrites a live higher one', () => {
    const plans = createPlans({ send: vi.fn() });

    plans.offer('sess-01', 'plan-mode', modePlan);

    expect(plans.get('sess-01')?.source).toBe('plan-mode');

    onTool(plans, create('1', 'A'));

    expect(plans.get('sess-01')?.source).toBe('task-tools');

    plans.offer('sess-01', 'plan-file', { ...modePlan, source: 'plan-file' });

    expect(plans.get('sess-01')?.source).toBe('task-tools');
  });

  it('a lower rank replaces an all-done higher one', () => {
    const plans = createPlans({ send: vi.fn() });

    onTool(plans, create('1', 'A'));
    onTool(plans, update('1', 'completed'));
    plans.offer('sess-01', 'plan-mode', modePlan);

    expect(plans.get('sess-01')).toBe(modePlan);
  });

  it('an offer of nothing drops the plan', () => {
    const plans = createPlans({ send: vi.fn() });

    plans.offer('sess-01', 'plan-mode', modePlan);
    plans.offer('sess-01', 'plan-mode', undefined);

    expect(plans.get('sess-01')).toBeUndefined();
  });

  it('lists every plan', () => {
    const plans = createPlans({ send: vi.fn() });

    onTool(plans, create('1', 'A'));
    onTool(plans, create('1', 'B', 'sess-02'));

    expect(plans.list().map((p) => p.entityId).sort()).toEqual(['sess-01', 'sess-02']);
  });
});

/**
 * Sources 2 and 3 (HIVE-180): the plan file, read from disk under
 * confinement, and plan mode's approved plan. `onTool` returns the read's
 * promise for a plan-file call so a test can await it.
 */
describe('createPlans: plan file and plan mode (HIVE-180)', () => {
  const PLAN_TEXT = '## Task 1: A\n- [x] one\n- [ ] two\n## Task 2: B\n- [ ] three\n';

  let root: string;
  let file: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'hive-plan-store-')));
    mkdirSync(join(root, '.hive', 'plans'), { recursive: true });
    file = join(root, '.hive', 'plans', 'p.md');
    writeFileSync(file, PLAN_TEXT);
  });

  const fileCall = (toolName = 'Write', extra: Partial<ClaudePlanCall> = {}): ClaudePlanCall => ({
    entityId: 'sess-01',
    toolName,
    toolInput: { file_path: file },
    toolResponse: undefined,
    cwd: root,
    ...extra,
  });

  const planMode = (plan: string): ClaudePlanCall => ({
    entityId: 'sess-01',
    toolName: 'ExitPlanMode',
    toolInput: { plan },
    toolResponse: {},
  });

  const second = () => {
    const other = join(root, '.hive', 'plans', 'b.md');
    writeFileSync(other, `# B\nPR: 2 of 2\n\n## Task 1: X\n- [ ] x\n`);
    return other;
  };

  it('remembers every plan file a session read, in read order (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    const other = second();
    await onTool(plans, fileCall());
    await onTool(plans, fileCall('Write', { toolInput: { file_path: other } }));

    expect(plans.files('sess-01').map((read) => read.file)).toEqual([file, other]);
    expect(plans.get('sess-01')).toMatchObject({ file: other, part: { index: 2, of: 2 } });
  });

  it('builds a held plan from the text it read, without reading the disk again (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    await onTool(plans, fileCall('Write', { toolInput: { file_path: second() } }));
    writeFileSync(file, '## Task 9: changed on disk\n');

    expect(plans.planOf('sess-01', file)).toMatchObject({ source: 'plan-file', file, tasks: parsePlanFile(PLAN_TEXT) });
    expect(plans.planOf('sess-01', join(root, 'never-read.md'))).toBeUndefined();
    expect(plans.planOf('sess-02', file)).toBeUndefined();
  });

  it('forgets every plan file with the session (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());

    plans.forget('sess-01');

    expect(plans.files('sess-01')).toEqual([]);
  });

  const building = (plans: Plans) => {
    const current = plans.get('sess-01') as SessionPlan;
    plans.offer('sess-01', 'plan-file', { ...current, build: { askId: 'A1', state: 'building', startedAt: 1 } });
  };

  it("records another plan file written during a build but keeps the build's plan on screen (HIVE-359)", async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    building(plans);
    const other = second();

    await onTool(plans, fileCall('Write', { toolInput: { file_path: other } }));

    expect(plans.get('sess-01')).toMatchObject({ file, build: { askId: 'A1', state: 'building' } });
    expect(plans.planOf('sess-01', other)?.tasks).toHaveLength(1);
  });

  it('a finished build no longer holds the panel against a new plan file (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    const current = plans.get('sess-01') as SessionPlan;
    plans.offer('sess-01', 'plan-file', { ...current, build: { askId: 'A1', state: 'done', startedAt: 1 } });
    const other = second();

    await onTool(plans, fileCall('Write', { toolInput: { file_path: other } }));

    expect(plans.get('sess-01')?.file).toBe(other);
  });

  it('re-reads the plan on screen at a Stop, not the last file written (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    building(plans);
    await onTool(plans, fileCall('Write', { toolInput: { file_path: second() } }));

    writeFileSync(file, `${PLAN_TEXT}## Task 3: C\n- [ ] four\n`);
    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(plans.get('sess-01')?.tasks).toHaveLength(3);
  });

  it('reads a plan file into a plan-file plan and publishes it', async () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    await onTool(plans, fileCall());

    const expected = {
      entityId: 'sess-01',
      source: 'plan-file',
      file,
      fileAt: Date.now(),
      tasks: parsePlanFile(PLAN_TEXT),
      allDone: false,
    };
    expect(plans.get('sess-01')).toEqual(expected);
    expect(send).toHaveBeenLastCalledWith(CH.planChanged, { entityId: 'sess-01', plan: expected });
  });

  it('re-reads on the next Edit, so ticking the last step completes a task', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());

    writeFileSync(file, PLAN_TEXT.replace('- [ ] two', '- [x] two'));
    await onTool(plans, fileCall('Edit'));

    expect(plans.get('sess-01')?.tasks.map((t) => t.status)).toEqual(['completed', 'pending']);
  });

  /*
    A tick made by a shell edit fires no Write or Edit hook, so the turn's end
    re-reads the file the session last read (the 0 of 4 panel, 10-19).
  */
  it('re-reads the session plan file at a Stop, so a shell edit reaches the panel', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());

    writeFileSync(file, PLAN_TEXT.replace('- [ ] two', '- [x] two'));
    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(plans.get('sess-01')?.tasks.map((t) => t.status)).toEqual(['completed', 'pending']);
  });

  it('publishes nothing at a Stop when the plan file is unchanged', async () => {
    const send = vi.fn();
    const plans = createPlans({ send });
    await onTool(plans, fileCall());
    const fileAt = plans.get('sess-01')?.fileAt;
    send.mockClear();
    vi.advanceTimersByTime(60_000);

    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(send).not.toHaveBeenCalled();
    expect(plans.get('sess-01')?.fileAt).toBe(fileAt);
  });

  it('keeps a newer plan-mode plan at a Stop when the plan file is unchanged', async () => {
    const send = vi.fn();
    const plans = createPlans({ send });
    // A finished file plan is the only one a plan-mode plan replaces.
    writeFileSync(file, PLAN_TEXT.replaceAll('- [ ]', '- [x]'));
    await onTool(plans, fileCall());
    await onTool(plans, planMode('1. Fresh\n2. Newer'));
    expect(plans.get('sess-01')?.source).toBe('plan-mode');
    send.mockClear();

    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });
    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(send).not.toHaveBeenCalled();
    expect(plans.get('sess-01')?.source).toBe('plan-mode');
  });

  /*
    A file read while a live task-tools plan holds the panel is turned away by
    rank. Its text must not count as shown, or the unchanged-file skip keeps
    it hidden after that plan finishes (acr on #331).
  */
  it('shows a plan file a live task-tools plan turned away, once that plan finishes', async () => {
    const plans = createPlans({ send: vi.fn() });
    onTool(plans, create('1', 'A'));
    await onTool(plans, fileCall());
    expect(plans.get('sess-01')?.source).toBe('task-tools');

    onTool(plans, update('1', 'completed'));
    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(plans.get('sess-01')?.source).toBe('plan-file');
  });

  /*
    A file turned away by rank is re-read at every Stop. Its time is when it
    was written, so an unchanged re-read must not restamp it, or the label a
    task-tools plan carries drifts to the last turn end (acr on #332).
  */
  it('keeps a turned-away plan file\'s time across Stops while its text is unchanged', async () => {
    const plans = createPlans({ send: vi.fn() });
    onTool(plans, create('1', 'A'));
    await onTool(plans, fileCall());
    const written = Date.now();

    vi.advanceTimersByTime(60_000);
    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });
    onTool(plans, create('2', 'B'));

    expect(plans.get('sess-01')?.fileAt).toBe(written);
  });

  it('reads nothing at a Stop for a session with no plan file', async () => {
    const send = vi.fn();
    const plans = createPlans({ send });

    await onTool(plans, { entityId: 'sess-01', toolName: 'Stop', toolInput: undefined, toolResponse: undefined, cwd: root });

    expect(send).not.toHaveBeenCalled();
  });

  it('reads a truncated write the same way', async () => {
    const plans = createPlans({ send: vi.fn() });

    await onTool(plans, fileCall('Write', { truncated: true }));

    expect(plans.get('sess-01')?.source).toBe('plan-file');
  });

  it('a file with no task headings offers nothing', async () => {
    const plans = createPlans({ send: vi.fn() });
    writeFileSync(file, '# Just prose');

    await onTool(plans, fileCall());

    expect(plans.get('sess-01')).toBeUndefined();
  });

  it('a refused read changes nothing and warns once per path', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plans = createPlans({ send: vi.fn() });
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'hive-plan-elsewhere-')));

    await onTool(plans, fileCall('Write', { cwd: elsewhere }));
    await onTool(plans, fileCall('Edit', { cwd: elsewhere }));

    expect(plans.get('sess-01')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('reports every plan file a session read, with when, so its history can keep them (HIVE-359)', async () => {
    // Before the store: it binds `Date.now` when made.
    vi.useFakeTimers({ now: 1_000 });
    const onPlanFiles = vi.fn();
    const plans = createPlans({ send: vi.fn(), onPlanFiles });

    await onTool(plans, fileCall());
    await onTool(plans, fileCall('Edit')); // unchanged text: nothing new to keep
    vi.setSystemTime(2_000);
    const other = second();
    await onTool(plans, fileCall('Write', { toolInput: { file_path: other } }));

    expect(onPlanFiles.mock.calls).toEqual([
      ['sess-01', [{ file, at: 1_000 }]],
      ['sess-01', [{ file, at: 1_000 }, { file: other, at: 2_000 }]],
    ]);
    vi.useRealTimers();
  });

  it('restores every plan file with the time history kept, the last one on screen (HIVE-359)', async () => {
    const plans = createPlans({ send: vi.fn() });
    const other = second();

    await plans.restore('sess-01', [{ file, at: 10 }, { file: other, at: 20 }], root);

    expect(plans.files('sess-01')).toEqual([{ file, at: 10 }, { file: other, at: 20 }]);
    expect(plans.get('sess-01')).toMatchObject({ file: other, fileAt: 20 });
  });

  it('does not report a refused file', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onPlanFiles = vi.fn();
    const plans = createPlans({ send: vi.fn(), onPlanFiles });
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'hive-plan-elsewhere-')));

    await onTool(plans, fileCall('Write', { cwd: elsewhere }));

    expect(onPlanFiles).not.toHaveBeenCalled();
    vi.mocked(console.warn).mockRestore();
  });

  it("restores a session's plan in a fresh store from the file its history kept", async () => {
    const before = createPlans({ send: vi.fn() });
    await onTool(before, fileCall());

    const after = createPlans({ send: vi.fn() });
    await after.restore('sess-01', before.files('sess-01'), root);

    expect(after.get('sess-01')).toEqual(before.get('sess-01'));
    // And the next Stop re-reads it, which is what was missing after a relaunch.
    writeFileSync(file, PLAN_TEXT.replace('- [ ] two', '- [x] two'));
    await after.apply({ entityId: 'sess-01', op: { kind: 'plan-file-reread' }, cwd: root });
    expect(after.get('sess-01')?.tasks[0]?.status).toBe('completed');
  });

  it('a restore confined out of the session cwd offers nothing and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plans = createPlans({ send: vi.fn() });
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'hive-plan-elsewhere-')));

    await plans.restore('sess-01', [{ file, at: 0 }], elsewhere);
    await plans.restore('sess-01', [{ file: join(root, 'missing.md'), at: 0 }], root);
    await plans.restore('sess-01', [{ file: join(root, 'missing.md'), at: 0 }], root);

    expect(plans.get('sess-01')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('keeps a build link across a re-read of the same file', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    const current = plans.get('sess-01') as SessionPlan;
    plans.offer('sess-01', 'plan-file', { ...current, build: { askId: 'A1', state: 'building' } });

    await onTool(plans, fileCall('Edit'));

    expect(plans.get('sess-01')?.build).toEqual({ askId: 'A1', state: 'building' });
  });

  it("keeps a build's ticks and times across a re-read that adds a task", async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    const current = plans.get('sess-01') as SessionPlan;
    plans.offer('sess-01', 'plan-file', {
      ...current,
      build: { askId: 'A1', state: 'building' },
      tasks: current.tasks.map((task) => ({ ...task, status: 'completed', startedAt: 1, endedAt: 2 })),
    });

    writeFileSync(file, `${PLAN_TEXT}## Task 3: C\n- [ ] four\n`);
    await onTool(plans, fileCall('Edit'));

    expect(plans.get('sess-01')?.tasks.map(({ status, startedAt, endedAt }) => [status, startedAt, endedAt])).toEqual([
      ['completed', 1, 2],
      ['completed', 1, 2],
      ['pending', undefined, undefined],
    ]);
  });

  it('with no build linked, a re-read takes the checkboxes as they are', async () => {
    const plans = createPlans({ send: vi.fn() });
    await onTool(plans, fileCall());
    const current = plans.get('sess-01') as SessionPlan;
    plans.offer('sess-01', 'plan-file', {
      ...current,
      tasks: current.tasks.map((task) => ({ ...task, status: 'completed' })),
    });

    writeFileSync(file, `${PLAN_TEXT}## Task 3: C\n`);
    await onTool(plans, fileCall('Edit'));

    expect(plans.get('sess-01')?.tasks.map((task) => task.status)).toEqual(['in_progress', 'pending', 'pending']);
  });

  it("plan mode's plan is offered as proposed tasks", () => {
    const plans = createPlans({ send: vi.fn() });

    void onTool(plans, planMode('1. One\n2. Two'));

    expect(plans.get('sess-01')).toEqual({
      entityId: 'sess-01',
      source: 'plan-mode',
      tasks: [
        { id: '1', title: 'One', status: 'pending' },
        { id: '2', title: 'Two', status: 'pending' },
      ],
      allDone: false,
    });
  });

  it("reads plan mode's plan from tool_response, where claude 2.1.270 sends it", () => {
    // PostToolUse carries `tool_input: {}`; only PreToolUse has `tool_input.plan`.
    const post = readFileSync(join(__dirname, '../../../fixtures/hooks/exit-plan-mode-2.1.270.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as { hook_event_name: string; tool_input: unknown; tool_response?: unknown })
      .find((body) => body.hook_event_name === 'PostToolUse');
    const plans = createPlans({ send: vi.fn() });

    void onTool(plans, {
      entityId: 'sess-01',
      toolName: 'ExitPlanMode',
      toolInput: post?.tool_input,
      toolResponse: post?.tool_response,
    });

    expect(plans.get('sess-01')?.source).toBe('plan-mode');
    expect(plans.get('sess-01')?.tasks.map((task) => task.id)).toEqual(['1', '2']);
  });

  it('a plan-mode plan with no tasks, or no plan string, offers nothing', () => {
    const plans = createPlans({ send: vi.fn() });

    void onTool(plans, planMode('Just do it.'));
    void onTool(plans, { ...planMode(''), toolInput: {} });

    expect(plans.get('sess-01')).toBeUndefined();
  });

  it('plan mode, then TaskCreate, ends with the task-tool plan', () => {
    const plans = createPlans({ send: vi.fn() });

    void onTool(plans, planMode('### P'));
    void onTool(plans, create('1', 'A'));

    expect(plans.get('sess-01')?.source).toBe('task-tools');
  });

  it('TaskCreate, then a plan-file write, keeps the task-tool plan', async () => {
    const plans = createPlans({ send: vi.fn() });

    void onTool(plans, create('1', 'A'));
    await onTool(plans, fileCall());

    expect(plans.get('sess-01')?.source).toBe('task-tools');
  });

  it('stamps task times from the injected clock (HIVE-201)', () => {
    let t = 1_000;
    const plans = createPlans({ send: vi.fn(), now: () => t });
    void onTool(plans, create('1', 'A'));
    t = 5_000;
    void onTool(plans, update('1', 'in_progress'));
    expect(plans.get('sess-01')?.tasks[0]?.startedAt).toBe(5_000);
  });

  it('carries the plan file and its time onto a task-tools plan that takes over (HIVE-201)', async () => {
    const plans = createPlans({ send: vi.fn(), now: () => 42 });
    await onTool(plans, fileCall());
    void onTool(plans, create('1', 'A'));
    expect(plans.get('sess-01')).toMatchObject({ source: 'task-tools', file, fileAt: 42 });
  });

  it('keeps the plan-file record across the replacement of a finished plan, and forget clears it (HIVE-201)', async () => {
    const plans = createPlans({ send: vi.fn(), now: () => 7 });
    await onTool(plans, fileCall());
    void onTool(plans, create('1', 'A'));
    void onTool(plans, update('1', 'completed'));
    void onTool(plans, create('2', 'B'));
    expect(plans.get('sess-01')?.file).toBe(file);
    plans.forget('sess-01');
    void onTool(plans, create('3', 'C'));
    expect(plans.get('sess-01')?.file).toBeUndefined();
  });
});

describe('fixture replay equivalence (HIVE-238)', () => {
  const replayFixture = async (name: string): Promise<unknown[]> => {
    const sent: unknown[] = [];
    let t = 0;
    const plans = createPlans({ send: (_channel, payload) => sent.push(payload), now: () => (t += 1_000) });
    const lines = readFileSync(join(__dirname, '../../../fixtures/hooks', name), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    for (const body of lines) {
      for (const effect of readHook({ lane: 'session', entityId: 'sess-01', body, truncated: false }).effects) {
        if (effect.kind === 'plan') await plans.apply(effect.update);
      }
    }
    return sent;
  };

  it.each(['task-tools-2.1.269.jsonl', 'exit-plan-mode-2.1.270.jsonl'])('%s publishes the same plans', async (name) => {
    const sent = await replayFixture(name);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent).toMatchSnapshot();
  });
});
