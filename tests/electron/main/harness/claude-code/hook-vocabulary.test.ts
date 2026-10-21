import { describe, expect, it } from 'vitest';

import {
  HOOK_EVENTS,
  HOOK_STATUS,
  hookContextReply,
  NOTIFICATION_TYPE_STATUS,
  NOTIFICATION_TYPES,
} from '../../../../../electron/main/harness/claude-code/hook-vocabulary';

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

  it('gives every status-bearing event a status', () => {
    for (const event of HOOK_EVENTS) {
      if (event === 'SessionEnd') continue;
      expect(HOOK_STATUS[event]).toBeDefined();
    }
  });

  it('lists exactly the notification types the status map reads', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(Object.keys(NOTIFICATION_TYPE_STATUS).sort());
  });
});
