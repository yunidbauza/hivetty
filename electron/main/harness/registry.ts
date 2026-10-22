import type { HarnessId } from '@shared/harness-contract';

import { claudeCodeAdapter } from './claude-code';
import type { HarnessAdapter } from './port';

/** Keyed by every `HarnessId`, so a harness without an adapter fails to compile. */
const adapters: Record<HarnessId, HarnessAdapter> = {
  'claude-code': claudeCodeAdapter,
};

/**
 * The adapter the app's shared runtimes write for (HIVE-235). The hooks, skills and MCP runtimes
 * are app-wide rather than per entity, so `harnessOf` has nothing to answer them with.
 * Phase 1: Claude Code.
 */
export const sessionAdapter = (): HarnessAdapter => adapters['claude-code'];

export interface HarnessRegistry {
  adapterFor(id: HarnessId): HarnessAdapter;
  /** The harness driving an entity, or `undefined` for a plain terminal or a command. */
  harnessOf(entityId: string): HarnessId | undefined;
}

/**
 * What the core tells the registry. Only the sessions closure knows what an
 * entity is (entity ids are minted by the renderer, so a prefix proves nothing),
 * and `harness/**` may not import `sessions/**`, so the fact comes in here.
 */
export interface HarnessRegistryDeps {
  /** True for an agent session; false for a plain terminal or a command. */
  isAgentSession(entityId: string): boolean;
}

export function createHarnessRegistry({ isAgentSession }: HarnessRegistryDeps): HarnessRegistry {
  return {
    adapterFor: (id) => adapters[id],
    // Phase 1: every agent session is Claude Code.
    harnessOf: (entityId) => (isAgentSession(entityId) ? 'claude-code' : undefined),
  };
}
