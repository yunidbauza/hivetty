import { describe, expect, it, vi } from 'vitest';

import { readHook } from '../../../../../electron/main/harness/claude-code/hooks';

const json = (fields: Record<string, unknown>): string => JSON.stringify(fields);
const session = (body: string, truncated = false) =>
  readHook({ lane: 'session', entityId: 'sess-07', body, truncated });
const agent = (body: string, truncated = false) =>
  readHook({ lane: 'agent', entityId: 'reviewer', body, truncated });

describe('readHook, agent lane (HIVE-236)', () => {
  it('reads Stop with the uuid and whether background work holds the process', () => {
    expect(
      agent(json({
        session_id: 'abc-1',
        hook_event_name: 'Stop',
        background_tasks: [{ id: 'a1', type: 'subagent', status: 'running' }],
      })),
    ).toEqual({
      effects: [{
        kind: 'agent',
        event: { entityId: 'reviewer', signal: { kind: 'turn-end' }, sessionUuid: 'abc-1', backgroundWork: true },
      }],
    });
  });
  it('says a shell alone does not hold the process', () => {
    const reading = agent(json({
      hook_event_name: 'Stop',
      background_tasks: [{ id: 's1', type: 'shell', status: 'running' }],
    }));
    expect(reading.effects[0]).toMatchObject({ event: { backgroundWork: false } });
  });
  it('recovers the event and uuid from a truncated prefix, and nothing else', () => {
    expect(agent('{"session_id":"abc-1","hook_event_name":"Stop","tool_input":{"x":"', true)).toEqual({
      effects: [{ kind: 'agent', event: { entityId: 'reviewer', signal: { kind: 'turn-end' }, sessionUuid: 'abc-1' } }],
    });
  });
  it('emits nothing for SessionEnd or an unsubscribed event', () => {
    expect(agent(json({ hook_event_name: 'SessionEnd', reason: 'other' }))).toEqual({ effects: [] });
    expect(agent(json({ hook_event_name: 'NotAnEvent' }))).toEqual({ effects: [] });
  });
  it('emits nothing for a Notification, which never fires headless (HIVE-237)', () => {
    expect(agent(json({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }))).toEqual({ effects: [] });
  });
  it('marks a body that does not parse', () => {
    expect(agent('{nope')).toEqual({ malformed: true, effects: [] });
  });
});

describe('readHook, session lane (HIVE-236)', () => {
  it('reads a whole PreToolUse into one status event with every field the tracker uses', () => {
    expect(session(json({
      session_id: 'u-1', hook_event_name: 'PreToolUse', cwd: '/r', tool_use_id: 't-1',
      tool_name: 'Bash', agent_id: 'ag-1', tool_input: { run_in_background: true },
    }))).toEqual({
      effects: [{ kind: 'status', event: {
        entityId: 'sess-07', signal: { kind: 'tool-start' }, sessionUuid: 'u-1',
        cwd: '/r', toolUseId: 't-1', toolName: 'Bash', agentId: 'ag-1', runInBackground: true,
      } }],
    });
  });
  it('keeps running shells, drops subagents quietly and reports other running kinds', () => {
    const reading = session(json({
      hook_event_name: 'SubagentStop',
      background_tasks: [
        { id: 's1', type: 'shell', status: 'running' },
        { id: 's2', type: 'shell', status: 'completed' },
        { id: 'a1', type: 'subagent', status: 'running' },
        { id: 'm1', type: 'monitor', status: 'running' },
      ],
    }));
    expect(reading.effects).toEqual([{ kind: 'status', event: {
      entityId: 'sess-07', signal: { kind: 'subagent-end' }, backgroundShells: ['s1'],
    } }]);
    expect(reading.unknownTaskTypes).toEqual(['monitor']);
  });
  it('recovers event, cwd, tool name and uuid from a truncated prefix', () => {
    expect(session('{"session_id":"abc-1","cwd":"/r","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"content":"', true))
      .toEqual({ effects: [{ kind: 'status', event: {
        entityId: 'sess-07', signal: { kind: 'tool-start' },
        sessionUuid: 'abc-1', cwd: '/r', toolName: 'Write',
      } }] });
  });
  it('turns SessionEnd{clear} into cleared and every other SessionEnd into nothing', () => {
    expect(session(json({ hook_event_name: 'SessionEnd', reason: 'clear' }))).toEqual({ effects: [{ kind: 'cleared' }] });
    expect(session('{"hook_event_name":"SessionEnd","reason":"clear","x":"', true)).toEqual({ effects: [{ kind: 'cleared' }] });
    expect(session(json({ hook_event_name: 'SessionEnd', reason: 'logout' }))).toEqual({ effects: [] });
  });
  it('reads a recognised Notification with its own status and type, even truncated', () => {
    expect(session('{"session_id":"abc-1","cwd":"/r","hook_event_name":"Notification","notification_type":"permission_prompt","message":"', true))
      .toEqual({ effects: [{ kind: 'status', event: {
        entityId: 'sess-07', signal: { kind: 'notice', reason: 'permission' },
        cwd: '/r', sessionUuid: 'abc-1',
      } }] });
  });
  it('emits nothing for an unrecognised Notification or an unsubscribed event', () => {
    expect(session(json({ hook_event_name: 'Notification', notification_type: 'auth_success' }))).toEqual({ effects: [] });
    expect(session(json({ hook_event_name: 'NotAnEvent' }))).toEqual({ effects: [] });
  });
  it('marks a body that does not parse', () => {
    expect(session('not json')).toEqual({ malformed: true, effects: [] });
  });
});

describe('readHook, plan, file and prompt effects (HIVE-236)', () => {
  const status = (kind: string, extra: Record<string, unknown> = {}) =>
    ({ kind: 'status', event: expect.objectContaining({ signal: { kind }, ...extra }) });

  it('hands a main-agent task tool to the plan, then publishes', () => {
    const toolInput = { subject: 'x' };
    const toolResponse = { task: { id: '1' } };
    expect(session(json({ hook_event_name: 'PostToolUse', cwd: '/r', tool_name: 'TaskCreate', tool_input: toolInput, tool_response: toolResponse })).effects)
      .toEqual([
        { kind: 'plan', update: { entityId: 'sess-07', op: { kind: 'task-created', id: '1', title: 'x' }, cwd: '/r' } },
        status('tool-end'),
      ]);
  });
  it('hands a truncated plan-file Write over by path, counts the edit, then publishes', () => {
    expect(session('{"cwd":"/r","hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"/r/.hive/plans/p.md","content":"', true).effects)
      .toEqual([
        { kind: 'plan', update: { entityId: 'sess-07', op: { kind: 'plan-file-touched', path: '/r/.hive/plans/p.md' }, cwd: '/r' } },
        { kind: 'file-edit' },
        status('tool-end'),
      ]);
  });
  it('counts a non-plan edit without a plan call', () => {
    expect(session(json({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/r/a.ts' } })).effects)
      .toEqual([{ kind: 'file-edit' }, status('tool-end')]);
  });
  it("ignores a subagent's edit for both plan and changed files", () => {
    expect(session(json({ hook_event_name: 'PostToolUse', agent_id: 'ag-1', tool_name: 'Write', tool_input: { file_path: '/r/.hive/plans/p.md' } })).effects)
      .toEqual([status('tool-end', { agentId: 'ag-1' })]);
    expect(session('{"agent_id":"ag-1","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"', true).effects)
      .toEqual([status('tool-end')]);
  });
  it('drops a truncated plan-mode plan and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(session('{"hook_event_name":"PostToolUse","tool_name":"ExitPlanMode","tool_input":{"plan":"', true).effects)
      .toEqual([status('tool-end')]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plan mode plan over'));
    warn.mockRestore();
  });
  it('re-reads the plan on Stop, then publishes', () => {
    expect(session(json({ hook_event_name: 'Stop', cwd: '/r' })).effects).toEqual([
      { kind: 'plan', update: { entityId: 'sess-07', op: { kind: 'plan-file-reread' }, cwd: '/r' } },
      status('turn-end'),
    ]);
  });
  it('carries the prompt and its conversation before the status', () => {
    expect(session(json({ hook_event_name: 'UserPromptSubmit', session_id: 'u-1', prompt: 'work on HIVE-1' })).effects)
      .toEqual([{ kind: 'prompt', text: 'work on HIVE-1', conversation: 'u-1' }, status('prompt')]);
    expect(session('{"session_id":"abc-1","hook_event_name":"UserPromptSubmit","prompt":"', true).effects)
      .toEqual([{ kind: 'prompt', conversation: 'abc-1' }, status('prompt')]);
  });
});
