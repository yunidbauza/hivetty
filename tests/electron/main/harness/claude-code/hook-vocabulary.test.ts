import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HOOK_EVENTS,
  hookContextReply,
  noticeSignal,
  toSignal,
} from '../../../../../electron/main/harness/claude-code/hook-vocabulary';
import { createStatusTracker } from '../../../../../electron/main/hooks/tracker';
import { createNotifier } from '../../../../../electron/main/notifications';
import type { NotificationHub } from '../../../../../electron/main/notifications/hub';
import { CH } from '../../../../../electron/shared/ipc-contract';

describe('hook contract', () => {
  it('types the context reply a hook may carry (HIVE-138)', () => {
    expect(hookContextReply('entry a12 in full')).toEqual({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'entry a12 in full',
      },
    });
  });

  it('subscribes the events the tracker needs', () => {
    for (const event of ['PreToolUse', 'SubagentStart', 'SubagentStop'] as const) {
      expect(HOOK_EVENTS).toContain(event);
    }
  });

});

describe('the signal table (HIVE-237)', () => {
  it.each([
    ['SessionStart', undefined, { kind: 'session-start' }],
    ['UserPromptSubmit', undefined, { kind: 'prompt' }],
    ['PreToolUse', 'Bash', { kind: 'tool-start' }],
    ['PostToolUse', 'Bash', { kind: 'tool-end' }],
    ['PermissionRequest', 'AskUserQuestion', { kind: 'waiting', reason: 'question' }],
    ['PermissionRequest', 'Bash', { kind: 'waiting', reason: 'permission' }],
    ['PermissionRequest', undefined, { kind: 'waiting', reason: 'permission' }],
    ['Elicitation', undefined, { kind: 'waiting', reason: 'input' }],
    ['Elicitation', 'AskUserQuestion', { kind: 'waiting', reason: 'input' }],
    ['SubagentStart', undefined, { kind: 'subagent-start' }],
    ['SubagentStop', undefined, { kind: 'subagent-end' }],
    ['Stop', undefined, { kind: 'turn-end' }],
  ] as const)('maps %s (tool %s) to %j', (event, toolName, signal) => {
    expect(toSignal(event, toolName)).toEqual(signal);
  });

  it.each([
    ['idle_prompt', { kind: 'notice', reason: 'idle' }],
    ['permission_prompt', { kind: 'notice', reason: 'permission' }],
    ['auth_success', undefined],
    ['constructor', undefined],
    [undefined, undefined],
  ] as const)('maps Notification %s to %j', (type, signal) => {
    expect(noticeSignal(type)).toEqual(signal);
  });

  it('maps every subscribed event but SessionEnd', () => {
    for (const event of HOOK_EVENTS) {
      if (event === 'SessionEnd') continue;
      const signal = event === 'Notification' ? noticeSignal('idle_prompt') : toSignal(event);
      expect(signal).toBeDefined();
    }
  });
});

describe('Claude through the signal to today’s status and card (HIVE-237)', () => {
  // Today's HOOK_STATUS / NOTIFICATION_TYPE_STATUS, written out so the tables cannot drift with the code.
  it.each([
    [toSignal('UserPromptSubmit'), 'working'],
    [toSignal('PreToolUse', 'Bash'), 'working'],
    [toSignal('PermissionRequest', 'Bash'), 'waiting'],
    [toSignal('PermissionRequest', 'AskUserQuestion'), 'waiting'],
    [toSignal('Elicitation'), 'waiting'],
    [noticeSignal('permission_prompt'), 'waiting'],
    [toSignal('SubagentStart'), 'working'],
    [toSignal('Stop'), 'idle'],
    [noticeSignal('idle_prompt'), 'idle'],
  ])('%j derives %s on a session mid-turn', (signal, status) => {
    const t = createStatusTracker();
    t.apply({ entityId: 'e', signal: { kind: 'session-start' } });
    t.apply({ entityId: 'e', signal: { kind: 'prompt' } });
    expect(t.apply({ entityId: 'e', signal: signal!, toolName: 'Bash' }).status).toBe(status);
  });

  let raise: ReturnType<typeof vi.fn>;
  let n: ReturnType<typeof createNotifier>;

  beforeEach(() => {
    raise = vi.fn(() => null);
    const hub = {
      raise,
      list: () => [],
      markRead: () => undefined,
      clear: () => undefined,
      dismissForeground: () => undefined,
      dismissForSession: () => undefined,
    } as unknown as NotificationHub;
    n = createNotifier({ hub, isForeground: () => false, isForegroundEverywhere: () => false });
  });

  it.each([
    [toSignal('PermissionRequest', 'Bash'), 'session.blocked', 'needs approval'],
    [toSignal('PermissionRequest', 'AskUserQuestion'), 'session.blocked', 'asked a question'],
    [toSignal('Elicitation'), 'session.blocked', 'needs an answer'],
    [noticeSignal('idle_prompt'), 'session.input_needed', 'is waiting on you'],
  ])('%j raises %s with “%s”', (signal, kind, title) => {
    n.observe(CH.sessionStatus, { entityId: 'e', status: signal!.kind === 'notice' ? 'idle' : 'waiting', signal });
    expect(raise).toHaveBeenCalledWith(expect.objectContaining({ kind, title }));
  });

  it('raises the true-idle card on a turn’s end after a prompt', () => {
    n.observe(CH.sessionStatus, { entityId: 'e', status: 'working', signal: toSignal('UserPromptSubmit') });
    n.observe(CH.sessionStatus, { entityId: 'e', status: 'idle', signal: toSignal('Stop') });
    expect(raise).toHaveBeenCalledWith(expect.objectContaining({ kind: 'session.idle', title: 'is yours again' }));
  });
});
