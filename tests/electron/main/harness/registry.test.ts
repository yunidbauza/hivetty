import { describe, expect, it } from 'vitest';

import { claudeCodeAdapter } from '../../../../electron/main/harness/claude-code';
import { createHarnessRegistry, sessionAdapter } from '../../../../electron/main/harness/registry';

/** Stands in for the sessions closure, which alone knows what an entity is. */
const agentSessions = new Set(['sess-01']);
const registry = createHarnessRegistry({
  isAgentSession: (entityId) => agentSessions.has(entityId),
});

describe('harness registry', () => {
  it('resolves an agent session to claude-code', () => {
    expect(registry.harnessOf('sess-01')).toBe('claude-code');
  });

  it('resolves a plain terminal to no harness', () => {
    expect(registry.harnessOf('term-02')).toBeUndefined();
  });

  it('resolves a command to no harness (story 102: a command has no agent)', () => {
    expect(registry.harnessOf('cmd-03')).toBeUndefined();
  });

  it('hands back the Claude Code adapter for its id', () => {
    const adapter = registry.adapterFor('claude-code');
    expect(adapter).toBe(claudeCodeAdapter);
    expect(adapter.id).toBe('claude-code');
    expect(adapter.capabilities).toEqual({ resume: 'by-id', meters: true, contextDelivery: 'prompt-marker' });
  });

  it('hands the shared runtimes the Claude Code adapter (phase 1)', () => {
    expect(sessionAdapter()).toBe(claudeCodeAdapter);
  });
});
